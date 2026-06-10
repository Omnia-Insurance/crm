#!/usr/bin/env node
/**
 * Export Convoso call recordings to S3 (or a local directory) before they are
 * purged by Convoso's ~155-day rolling retention window.
 *
 * Verified 2026-06-09: recordings older than ~2026-01-05 already return
 * "Recording not found!" from both the stored permalinks AND freshly-issued
 * URLs from /v1/log/retrieve — the audio is purged vendor-side, only metadata
 * survives. Roughly ~900 recordings/day are crossing the cliff, so this runs
 * ascending by callDate: the dead zone fails fast (58-byte JSON responses) and
 * produces the definitive loss manifest; the at-risk window (oldest alive
 * calls) is reached and saved first.
 *
 * Reads call rows (read-only) from the workspace schema, downloads each
 * recording.primaryLinkUrl, computes sha256, and writes to
 * s3://<bucket>/<prefix>/YYYY/MM/DD/<convosoCallId>.mp3 with sha256 + call
 * metadata on the object. Append-only JSONL state file makes every mode
 * resumable and doubles as the audit log for the Phase 4 exit criterion
 * (count match + spot-audit) and the Convoso support escalation.
 *
 * No BullMQ, no Redis, no record mutations (no webhook-flood risk).
 *
 * Usage:
 *   node scripts/export-convoso-recordings.mjs --dry-run
 *   node scripts/export-convoso-recordings.mjs --bucket omnia-call-recordings [--prefix convoso] \
 *     [--start 2026-01-01] [--end 2026-06-30] [--concurrency 4] [--limit N] [--delay-ms 350] \
 *     [--state convoso-recording-export.state.jsonl] [--retry-failed] [--retry-not-found] \
 *     [--sse-kms-key-id <arn>]
 *
 * Pacing: one global gap (--delay-ms) between request starts, regardless of
 * concurrency; HTTP 429 pauses all workers (Retry-After honored) and widens
 * the gap adaptively. Convoso 429s on bursts even at low average rates.
 *   node scripts/export-convoso-recordings.mjs --local-dir /tmp/recordings --limit 3   # smoke test
 *   node scripts/export-convoso-recordings.mjs --bucket omnia-call-recordings --verify # audit S3 vs state
 *
 * Env: PG_DATABASE_URL (or --database-url), standard AWS credential chain.
 */

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pg from 'pg';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const DATABASE_URL = opt('database-url', process.env.PG_DATABASE_URL ?? process.env.DATABASE_URL);
const SCHEMA = opt('schema', 'workspace_oyoiha4z71ppw867jthfb36d');
const BUCKET = opt('bucket');
const PREFIX = opt('prefix', 'convoso');
const LOCAL_DIR = opt('local-dir');
const START = opt('start', '2025-07-01');
const END = opt('end', '2099-01-01');
const CONCURRENCY = Number(opt('concurrency', '4'));
const LIMIT = Number(opt('limit', '0'));
const STATE_FILE = opt('state', 'convoso-recording-export.state.jsonl');
const KMS_KEY_ID = opt('sse-kms-key-id');
const REGION = opt('region', process.env.AWS_REGION ?? 'us-east-1');
const DRY_RUN = flag('dry-run');
const VERIFY = flag('verify');
const RETRY_FAILED = flag('retry-failed');
const RETRY_NOT_FOUND = flag('retry-not-found');
const DELAY_MS = Number(opt('delay-ms', '350'));

const FETCH_TIMEOUT_MS = 180_000;
const TRANSIENT_RETRIES = 3;
const RATE_LIMIT_RETRIES = 12;
const BATCH = 5000;

if (!DATABASE_URL) {
  console.error('No database URL. Set PG_DATABASE_URL or pass --database-url.');
  process.exit(1);
}
if (!DRY_RUN && !VERIFY && !BUCKET && !LOCAL_DIR) {
  console.error('Pass --bucket <name> (or --local-dir for a smoke test), or --dry-run / --verify.');
  process.exit(1);
}

// ---------- state ----------
// One JSONL line per attempt; the last line per convosoCallId wins.
const state = new Map();
if (existsSync(STATE_FILE)) {
  for (const line of readFileSync(STATE_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      state.set(rec.convosoCallId, rec);
    } catch {
      console.warn(`Skipping malformed state line: ${line.slice(0, 80)}`);
    }
  }
  console.log(`Loaded state: ${state.size} calls already attempted (${STATE_FILE})`);
}
const writeState = (rec) => {
  state.set(rec.convosoCallId, rec);
  appendFileSync(STATE_FILE, JSON.stringify(rec) + '\n');
};

// ---------- db ----------
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();

const fetchBatch = async (afterDate, afterId) => {
  const { rows } = await db.query(
    `SELECT id, "convosoCallId", "callDate", "recordingPrimaryLinkUrl" AS url
     FROM ${SCHEMA}._call
     WHERE "deletedAt" IS NULL
       AND "recordingPrimaryLinkUrl" IS NOT NULL AND "recordingPrimaryLinkUrl" <> ''
       AND "convosoCallId" IS NOT NULL
       AND "callDate" >= $1 AND "callDate" < $2
       AND ("callDate", id) > ($3::timestamptz, $4::uuid)
     ORDER BY "callDate", id
     LIMIT $5`,
    [START, END, afterDate, afterId, BATCH],
  );
  return rows;
};

const EPOCH = '1970-01-01T00:00:00Z';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// ---------- s3 ----------
let s3 = null;
const getS3 = async () => {
  if (!s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3 = new S3Client({ region: REGION });
  }
  return s3;
};

const s3KeyFor = (row) => {
  const d = new Date(row.callDate);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${PREFIX}/${yyyy}/${mm}/${dd}/${row.convosoCallId}.mp3`;
};

// ---------- pacing ----------
// Convoso 429s on bursts (dead-zone responses return in ~200ms, so unpaced
// workers hit ~20 rps). One global gap between request STARTS keeps the
// steady rate at 1000/DELAY_MS rps regardless of concurrency; on 429 all
// workers pause together (honoring Retry-After) and the gap widens
// adaptively, decaying back toward the base after sustained success.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextSlotAt = 0;
let pausedUntil = 0;
let currentDelayMs = DELAY_MS;
let consecutive429 = 0;

const acquireSlot = async () => {
  for (;;) {
    const now = Date.now();
    const wait = Math.max(nextSlotAt - now, pausedUntil - now);
    if (wait <= 0) {
      nextSlotAt = now + currentDelayMs;
      return;
    }
    await sleep(Math.min(wait, 1000));
  }
};

class RateLimitError extends Error {
  constructor(retryAfterMs) {
    super('HTTP 429');
    this.retryAfterMs = retryAfterMs;
  }
}

const onRateLimited = (retryAfterMs) => {
  consecutive429++;
  const backoff = retryAfterMs ?? Math.min(15_000 * 2 ** (consecutive429 - 1), 300_000);
  pausedUntil = Math.max(pausedUntil, Date.now() + backoff);
  currentDelayMs = Math.min(Math.round(currentDelayMs * 1.5), 3000);
  console.log(`429 from Convoso — pausing all workers ${Math.round(backoff / 1000)}s, request gap now ${currentDelayMs}ms`);
};

const onSuccess = () => {
  consecutive429 = 0;
  if (currentDelayMs > DELAY_MS) currentDelayMs = Math.max(DELAY_MS, currentDelayMs - 5);
};

// ---------- download + store ----------
const downloadOnce = async (url) => {
  await acquireSlot();
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (res.status === 429) {
    const ra = res.headers.get('retry-after');
    await res.arrayBuffer().catch(() => {});
    throw new RateLimitError(ra ? Number(ra) * 1000 : undefined);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (contentType.includes('json')) {
    const body = await res.text();
    if (body.includes('Recording not found')) return { notFound: true };
    throw new Error(`Unexpected JSON response: ${body.slice(0, 120)}`);
  }
  if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
    throw new Error(`Unexpected content-type: ${contentType}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('Empty audio body');
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return { buf, sha256, contentType };
};

const store = async (row, key, dl) => {
  if (LOCAL_DIR) {
    const path = join(LOCAL_DIR, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, dl.buf);
    return;
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await (await getS3()).send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: dl.buf,
    ContentType: dl.contentType.includes('audio') ? dl.contentType : 'audio/mpeg',
    Metadata: {
      sha256: dl.sha256,
      convosocallid: String(row.convosoCallId),
      calldate: new Date(row.callDate).toISOString(),
      callrowid: row.id,
    },
    ...(KMS_KEY_ID ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: KMS_KEY_ID } : {}),
  }));
};

const processRow = async (row) => {
  const key = s3KeyFor(row);
  const startedAt = Date.now();
  let lastErr;
  let transientAttempts = 0;
  let rateLimitAttempts = 0;
  while (transientAttempts < TRANSIENT_RETRIES && rateLimitAttempts < RATE_LIMIT_RETRIES) {
    try {
      const dl = await downloadOnce(row.url);
      if (dl.notFound) {
        onSuccess();
        writeState({ convosoCallId: row.convosoCallId, callRowId: row.id, callDate: row.callDate, status: 'not_found', url: row.url, ts: new Date().toISOString() });
        return 'not_found';
      }
      await store(row, key, dl);
      onSuccess();
      writeState({
        convosoCallId: row.convosoCallId, callRowId: row.id, callDate: row.callDate,
        status: 'ok', s3Key: key, bytes: dl.buf.length, sha256: dl.sha256,
        ms: Date.now() - startedAt, ts: new Date().toISOString(),
      });
      return 'ok';
    } catch (err) {
      lastErr = err;
      if (err instanceof RateLimitError) {
        rateLimitAttempts++;
        onRateLimited(err.retryAfterMs);
      } else {
        transientAttempts++;
        if (transientAttempts < TRANSIENT_RETRIES) await sleep(2000 * transientAttempts);
      }
    }
  }
  writeState({ convosoCallId: row.convosoCallId, callRowId: row.id, callDate: row.callDate, status: 'error', error: String(lastErr).slice(0, 300), url: row.url, ts: new Date().toISOString() });
  return 'error';
};

// ---------- modes ----------
const dryRun = async () => {
  const { rows } = await db.query(
    `SELECT to_char(date_trunc('month', "callDate"), 'YYYY-MM') AS month, count(*) AS recordings
     FROM ${SCHEMA}._call
     WHERE "deletedAt" IS NULL AND "recordingPrimaryLinkUrl" <> '' AND "convosoCallId" IS NOT NULL
       AND "callDate" >= $1 AND "callDate" < $2
     GROUP BY 1 ORDER BY 1`,
    [START, END],
  );
  let total = 0;
  for (const r of rows) {
    total += Number(r.recordings);
    console.log(`${r.month}  ${r.recordings}`);
  }
  console.log(`TOTAL ${total} recording URLs in range ${START} → ${END}`);
  const { rows: gap } = await db.query(
    `SELECT count(*) AS n FROM ${SCHEMA}._call
     WHERE "deletedAt" IS NULL AND duration > 0
       AND ("recordingPrimaryLinkUrl" IS NULL OR "recordingPrimaryLinkUrl" = '')
       AND "callDate" >= $1 AND "callDate" < $2`,
    [START, END],
  );
  console.log(`NOTE: ${gap[0].n} connected calls in range have NO recording URL (separate gap to investigate)`);
};

const exportAll = async () => {
  const counters = { ok: 0, not_found: 0, error: 0, skipped: 0, bytes: 0 };
  const t0 = Date.now();
  let stopping = false;
  process.on('SIGINT', () => { console.log('\nSIGINT — finishing in-flight items then stopping (state is resumable).'); stopping = true; });

  let afterDate = EPOCH;
  let afterId = NIL_UUID;
  let processed = 0;
  let queue = [];

  const shouldSkip = (row) => {
    const prev = state.get(row.convosoCallId);
    if (!prev) return false;
    if (prev.status === 'ok') return true;
    if (prev.status === 'not_found') return !RETRY_NOT_FOUND;
    return !RETRY_FAILED; // status === 'error'
  };

  const report = () => {
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`[${mins}m] ok=${counters.ok} not_found=${counters.not_found} error=${counters.error} skipped=${counters.skipped} | ${(counters.bytes / 1e9).toFixed(2)} GB`);
  };

  while (!stopping) {
    const rows = await fetchBatch(afterDate, afterId);
    if (rows.length === 0) break;
    const last = rows[rows.length - 1];
    afterDate = last.callDate;
    afterId = last.id;

    for (const row of rows) {
      if (stopping) break;
      if (LIMIT && processed >= LIMIT) { stopping = true; break; }
      if (shouldSkip(row)) { counters.skipped++; continue; }
      processed++;
      const task = processRow(row).then((status) => {
        counters[status]++;
        const rec = state.get(row.convosoCallId);
        if (status === 'ok' && rec?.bytes) counters.bytes += rec.bytes;
        if ((counters.ok + counters.not_found + counters.error) % 200 === 0) report();
        queue = queue.filter((t) => t !== task);
      });
      queue.push(task);
      if (queue.length >= CONCURRENCY) await Promise.race(queue);
    }
  }
  await Promise.all(queue);
  report();
  console.log('Done. State file is the audit manifest:', STATE_FILE);
};

const verify = async () => {
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3();
  const okRecs = [...state.values()].filter((r) => r.status === 'ok');
  console.log(`Verifying ${okRecs.length} exported objects against s3://${BUCKET} ...`);
  let missing = 0, mismatch = 0, verified = 0;
  let queue = [];
  for (const rec of okRecs) {
    const task = (async () => {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: rec.s3Key }));
        if (Number(head.ContentLength) !== rec.bytes || (head.Metadata?.sha256 && head.Metadata.sha256 !== rec.sha256)) {
          mismatch++;
          console.log(`MISMATCH ${rec.s3Key} bytes=${head.ContentLength}/${rec.bytes}`);
        } else verified++;
      } catch {
        missing++;
        console.log(`MISSING ${rec.s3Key} (convosoCallId=${rec.convosoCallId})`);
      }
      queue = queue.filter((t) => t !== task);
    })();
    queue.push(task);
    if (queue.length >= 16) await Promise.race(queue);
  }
  await Promise.all(queue);
  console.log(`Verified=${verified} missing=${missing} mismatch=${mismatch}`);
  if (missing || mismatch) process.exitCode = 2;
};

try {
  if (DRY_RUN) await dryRun();
  else if (VERIFY) await verify();
  else await exportAll();
} finally {
  await db.end();
}
