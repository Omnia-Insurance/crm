import { createHmac, timingSafeEqual } from 'crypto';

// Twilio's X-Twilio-Signature scheme:
//   1. Take the full URL the request was sent to (including query string).
//   2. Append the POST form parameters sorted by key, concatenated as `${k}${v}`.
//   3. HMAC-SHA1 with the auth token, then base64.
// See: https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// We verify against the workspace's TWILIO_WEBHOOK_SECRET (which can be the
// auth token, or a dedicated signing secret for a Twilio Signing Key).

export type SignatureVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function verifyTwilioSignature({
  url,
  params,
  signatureHeader,
  secret,
}: {
  url: string;
  params: Record<string, string>;
  signatureHeader: string | undefined;
  secret: string;
}): SignatureVerificationResult {
  if (!signatureHeader) {
    return { ok: false, reason: 'missing X-Twilio-Signature header' };
  }

  const sortedKeys = Object.keys(params).sort();
  const data =
    url + sortedKeys.map((k) => `${k}${params[k] ?? ''}`).join('');
  const expected = createHmac('sha1', secret).update(data).digest('base64');

  if (signatureHeader.length !== expected.length) {
    return { ok: false, reason: 'signature length mismatch' };
  }
  const ok = timingSafeEqual(
    Buffer.from(signatureHeader, 'utf8'),
    Buffer.from(expected, 'utf8'),
  );
  return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

// Twilio sends webhooks as application/x-www-form-urlencoded. The runtime
// usually pre-parses the body, but we need the same key set for signing —
// pass the parsed object straight in.
export function parseFormBody(rawBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of rawBody.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = eq < 0 ? pair : pair.slice(0, eq);
    const v = eq < 0 ? '' : pair.slice(eq + 1);
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(
      v.replace(/\+/g, ' '),
    );
  }
  return out;
}
