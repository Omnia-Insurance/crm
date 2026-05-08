import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

import type { TelephonyEvent } from 'src/modules/core/adapter/types';
import {
  createChannelAssociation,
  createMessageParticipant,
  createMessageThread,
  createSmsMessage,
  findMessageBySid,
  findMessageChannelByHandle,
  findPersonByPhone,
  resolveAgentForDialedNumber,
  updateMessageStatus,
} from 'src/modules/core/messaging/helpers';
import { buildTwilioAdapterFromEnv } from 'src/modules/twilio/build-adapter';

// Single Twilio webhook endpoint. All Twilio status callbacks (call
// lifecycle, SMS delivery, recording completion) post here. The adapter
// normalizes them into TelephonyEvent and we dispatch to per-kind handlers.
//
// Idempotency: every dispatcher keys on the provider's identifier
// (providerCallSid for calls, providerMessageSid for messages) and does an
// upsert-shaped find-then-update / insert. Twilio retries webhooks on
// non-2xx, so handlers must be safe to run twice.

const handler = async (event: RoutePayload<unknown>) => {
  const adapter = buildTwilioAdapterFromEnv();

  const rawBody = extractRawBody(event);
  if (rawBody === null) {
    return { error: 'unable to read request body' };
  }

  const url = reconstructUrl(event);

  let normalized: TelephonyEvent;
  try {
    normalized = await adapter.parseWebhook({
      headers: event.headers,
      rawBody,
      url,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    console.warn(`[twilio-webhook] reject: ${reason}`);
    return { error: 'webhook rejected', reason };
  }

  const client = new CoreApiClient();

  switch (normalized.kind) {
    case 'call.initiated':
      return handleCallInitiated(client, normalized);
    case 'call.answered':
      return handleCallAnswered(client, normalized);
    case 'call.completed':
      return handleCallCompleted(client, normalized);
    case 'recording.completed':
      return handleRecordingCompleted(client, normalized);
    case 'sms.received':
      return handleSmsReceived(client, normalized);
    case 'sms.delivered':
      return handleSmsDelivered(client, normalized);
  }
};

// ── helpers ────────────────────────────────────────────────────────────

function extractRawBody(event: RoutePayload<unknown>): string | null {
  const raw = event.body;
  if (raw == null) return '';
  if (typeof raw === 'string') {
    return event.isBase64Encoded
      ? Buffer.from(raw, 'base64').toString('utf8')
      : raw;
  }
  // Some runtimes pre-parse form bodies into objects. Re-encode so the
  // signature check sees the same bytes Twilio signed. Order-independent
  // because verifyTwilioSignature sorts keys.
  if (typeof raw === 'object') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      params.append(k, String(v ?? ''));
    }
    return params.toString();
  }
  return null;
}

function reconstructUrl(event: RoutePayload<unknown>): string {
  // X-Twilio-Signature is computed over the URL Twilio posted to. Our
  // canonical public URL lives in WEBHOOK_PUBLIC_URL (the workspace's app
  // variable); reconstruct path from the route, query string from the
  // payload's queryStringParameters.
  const base = process.env.WEBHOOK_PUBLIC_URL ?? '';
  const path = event.requestContext?.http?.path ?? '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(event.queryStringParameters ?? {})) {
    if (v !== undefined) qs.append(k, v);
  }
  const qsStr = qs.toString();
  return base.replace(/\/$/, '') + path + (qsStr ? `?${qsStr}` : '');
}

// ── call dispatchers ───────────────────────────────────────────────────

async function handleCallInitiated(
  client: InstanceType<typeof CoreApiClient>,
  ev: Extract<TelephonyEvent, { kind: 'call.initiated' }>,
) {
  const existing = await findCallBySid(client, ev.providerCallSid);
  if (existing) return { processed: true, callId: existing.id, deduped: true };

  const { createTelephonyCall } = (await client.mutation({
    createTelephonyCall: {
      __args: {
        data: {
          name: callDisplayName(ev.direction, ev.from, ev.to),
          direction: ev.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
          status: 'QUEUED',
          fromNumber: ev.from,
          toNumber: ev.to,
          startedAt: ev.occurredAt.toISOString(),
          provider: 'TWILIO',
          providerCallSid: ev.providerCallSid,
        } as any,
      },
      id: true,
    },
  } as any)) as any;
  return { processed: true, callId: createTelephonyCall?.id };
}

async function handleCallAnswered(
  client: InstanceType<typeof CoreApiClient>,
  ev: Extract<TelephonyEvent, { kind: 'call.answered' }>,
) {
  const existing = await findCallBySid(client, ev.providerCallSid);
  if (!existing) return { skipped: true, reason: 'unknown providerCallSid' };

  await client.mutation({
    updateTelephonyCall: {
      __args: {
        id: existing.id,
        data: {
          status: 'IN_PROGRESS',
          answeredAt: ev.occurredAt.toISOString(),
        } as any,
      },
      id: true,
    },
  } as any);
  return { processed: true, callId: existing.id };
}

async function handleCallCompleted(
  client: InstanceType<typeof CoreApiClient>,
  ev: Extract<TelephonyEvent, { kind: 'call.completed' }>,
) {
  const existing = await findCallBySid(client, ev.providerCallSid);
  if (!existing) return { skipped: true, reason: 'unknown providerCallSid' };

  const data: Record<string, unknown> = {
    status: ev.status.toUpperCase().replace('-', '_'),
    endedAt: ev.occurredAt.toISOString(),
    durationSec: ev.durationSec,
  };
  if (ev.cost) {
    data.cost = {
      amountMicros: ev.cost.amountMicros,
      currencyCode: ev.cost.currencyCode,
    };
  }

  await client.mutation({
    updateTelephonyCall: {
      __args: { id: existing.id, data: data as any },
      id: true,
    },
  } as any);
  return { processed: true, callId: existing.id };
}

async function handleRecordingCompleted(
  client: InstanceType<typeof CoreApiClient>,
  ev: Extract<TelephonyEvent, { kind: 'recording.completed' }>,
) {
  const existing = await findCallBySid(client, ev.providerCallSid);
  if (!existing) return { skipped: true, reason: 'unknown providerCallSid' };

  await client.mutation({
    updateTelephonyCall: {
      __args: {
        id: existing.id,
        data: { recordingUrl: ev.recordingUrl } as any,
      },
      id: true,
    },
  } as any);
  // Transcription / summarization is queued by the AI summary job, not done
  // synchronously here — webhooks must return fast.
  return { processed: true, callId: existing.id };
}

async function findCallBySid(
  client: InstanceType<typeof CoreApiClient>,
  providerCallSid: string,
): Promise<{ id: string } | null> {
  const result = (await client.query({
    telephonyCalls: {
      __args: {
        filter: { providerCallSid: { eq: providerCallSid } },
        first: 1,
      } as any,
      edges: { node: { id: true } },
    } as any,
  } as any)) as any;
  return result?.telephonyCalls?.edges?.[0]?.node ?? null;
}

function callDisplayName(
  direction: 'inbound' | 'outbound',
  from: string,
  to: string,
): string {
  return direction === 'inbound'
    ? `Inbound call from ${from}`
    : `Outbound call to ${to}`;
}

// ── SMS dispatchers ────────────────────────────────────────────────────
//
// SMS rides on Twenty's standard `message` / `messageParticipant` /
// `messageChannel` / `messageThread` objects. The SMS-specific fields
// (`status`, `telephonyProvider`, `providerMessageSid`) are added to the
// standard `message` object via this app's `defineField` declarations, so
// they appear as real columns on the message table.
//
// Idempotency: every dispatcher first checks `findMessageBySid` before
// inserting. Twilio retries failed callbacks, so handlers must be safe.

async function handleSmsReceived(
  client: InstanceType<typeof CoreApiClient>,
  ev: Extract<TelephonyEvent, { kind: 'sms.received' }>,
) {
  const existing = await findMessageBySid(client, ev.providerMessageSid);
  if (existing) {
    return { processed: true, messageId: existing.id, deduped: true };
  }

  // The dialed (TO) number is the workspace-issued DID. Look up its channel
  // and the agent assigned to it. Both are best-effort: a missing channel
  // means SMS arrived for a number we don't yet have a channel row for
  // (provisioning hasn't run); we still write the message + participants so
  // nothing is dropped, just skip the channel association.
  const channel = await findMessageChannelByHandle(client, ev.to);
  const agent = await resolveAgentForDialedNumber(client, ev.to);
  const fromPerson = await findPersonByPhone(client, ev.from);

  const thread = await createMessageThread(client);

  const message = await createSmsMessage(client, {
    threadId: thread.id,
    text: ev.body,
    direction: 'INCOMING',
    receivedAt: ev.occurredAt,
    providerMessageSid: ev.providerMessageSid,
    status: 'RECEIVED',
  });

  await createMessageParticipant(client, {
    messageId: message.id,
    handle: ev.from,
    role: 'FROM',
    personId: fromPerson?.id,
  });
  await createMessageParticipant(client, {
    messageId: message.id,
    handle: ev.to,
    role: 'TO',
    workspaceMemberId: agent?.workspaceMemberId,
  });

  if (channel) {
    await createChannelAssociation(client, {
      messageId: message.id,
      messageChannelId: channel.id,
      messageExternalId: ev.providerMessageSid,
      direction: 'INCOMING',
    });
  } else {
    console.warn(
      `[twilio-webhook] sms.received: no messageChannel found for handle=${ev.to}; message saved without channel association. The "Buy a number" flow should provision the channel.`,
    );
  }

  // MMS attachments are deferred — Twenty's `attachment` object with
  // `targetMessage` is the right home, but the file-upload path needs the
  // MetadataApiClient and is non-trivial. Logging URLs preserves the data
  // for manual recovery if needed.
  if (ev.mediaUrls.length > 0) {
    console.log(
      `[twilio-webhook] sms.received: ${ev.mediaUrls.length} MMS media URL(s) deferred (attachment ingest not yet wired): ${ev.mediaUrls.join(', ')}`,
    );
  }

  return {
    processed: true,
    messageId: message.id,
    threadId: thread.id,
    matchedPerson: fromPerson?.id ?? null,
    matchedAgent: agent?.workspaceMemberId ?? null,
    channelLinked: channel !== null,
  };
}

async function handleSmsDelivered(
  client: InstanceType<typeof CoreApiClient>,
  ev: Extract<TelephonyEvent, { kind: 'sms.delivered' }>,
) {
  const existing = await findMessageBySid(client, ev.providerMessageSid);
  if (!existing) {
    // The outbound `send-sms` path doesn't write the message row eagerly;
    // it relies on this callback to do so. Twilio fires `queued` /  `sent`
    // / `delivered` callbacks in sequence, so the first one we see for a
    // sid creates the row. For that, we'd need to know From / To / Body
    // from this callback — Twilio includes them, but our normalized event
    // shape only carries status. For now, log + skip: send-sms callers
    // can pre-create the row in a follow-up if eager visibility is needed.
    console.warn(
      `[twilio-webhook] sms.delivered: unknown providerMessageSid=${ev.providerMessageSid}; status=${ev.status} skipped (outbound row not yet created)`,
    );
    return { skipped: true, reason: 'unknown providerMessageSid' };
  }

  const status = mapSmsStatus(ev.status);
  await updateMessageStatus(client, existing.id, status);
  return { processed: true, messageId: existing.id, status };
}

function mapSmsStatus(
  s: string,
): 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RECEIVED' {
  switch (s) {
    case 'queued':
      return 'QUEUED';
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'failed':
      return 'FAILED';
    case 'received':
      return 'RECEIVED';
    default:
      return 'QUEUED';
  }
}

export default defineLogicFunction({
  universalIdentifier: 'd9e4f1a0-3b62-4c87-9e15-7a8b2d5f0c91',
  name: 'twilio-webhook',
  description:
    'Single Twilio webhook endpoint: signature-verified, normalized via the TwilioAdapter, dispatched to idempotent handlers per event kind (call lifecycle, recording, SMS).',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/twilio/webhook',
    httpMethod: 'POST',
    isAuthRequired: false,
    forwardedRequestHeaders: ['x-twilio-signature'],
  },
});
