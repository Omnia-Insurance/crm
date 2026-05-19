import { Injectable } from '@nestjs/common';

import { randomUUID } from 'crypto';

import {
  type TelephonyProviderAccessTokenInput,
  type TelephonyProviderAdapter,
  type TelephonyProviderOutboundCallInput,
  type TelephonyProviderWebhookValidationInput,
} from 'src/modules/telephony/providers/telephony-provider-adapter.interface';
import {
  type TelephonyCallEventType,
  type TelephonyCallSessionStatus,
  type TelephonyProviderAccessToken,
  type TelephonyProviderOutboundCall,
  type TelephonyProviderWebhookEvent,
} from 'src/modules/telephony/types/telephony.type';

const PROVIDER_KEY = 'twilio-compatible';

const getString = (
  payload: Record<string, unknown>,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }

  }

  return null;
};

const parseDecimalDigits = (value: string): number | null => {
  if (value.length === 0) {
    return null;
  }

  let result = 0;

  for (const character of value) {
    const characterCode = character.charCodeAt(0);

    if (characterCode < 48 || characterCode > 57) {
      return null;
    }

    result = result * 10 + characterCode - 48;
  }

  return result;
};

const getNumber = (
  payload: Record<string, unknown>,
  keys: string[],
): number | null => {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = parseDecimalDigits(value.trim());

      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
};

const getHeader = (
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
): string | null => {
  const value = headers[headerName] ?? headers[headerName.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
};

const mapStatusToEvent = (
  payload: Record<string, unknown>,
): {
  eventType: TelephonyCallEventType;
  callSessionStatus?: TelephonyCallSessionStatus;
} => {
  const recordingId = getString(payload, [
    'RecordingSid',
    'RecordingID',
    'recordingSid',
    'recordingId',
  ]);
  const recordingUrl = getString(payload, [
    'RecordingUrl',
    'RecordingURL',
    'recordingUrl',
  ]);

  if (recordingId || recordingUrl) {
    return {
      eventType: 'RECORDING_READY',
      callSessionStatus: undefined,
    };
  }

  const rawEvent = getString(payload, [
    'Event',
    'event',
    'CallEvent',
    'callEvent',
  ]);
  const rawStatus = getString(payload, [
    'CallStatus',
    'callStatus',
    'DialCallStatus',
    'dialCallStatus',
    'Status',
    'status',
  ]);
  const normalized = (rawStatus ?? rawEvent ?? '').toLowerCase();

  if (['queued', 'initiated', 'dialing'].includes(normalized)) {
    return { eventType: 'DIALING', callSessionStatus: 'DIALING' };
  }

  if (['ringing', 'ring'].includes(normalized)) {
    return { eventType: 'RINGING', callSessionStatus: 'RINGING' };
  }

  if (['in-progress', 'in_progress', 'answered', 'answer'].includes(normalized)) {
    return { eventType: 'ANSWERED', callSessionStatus: 'IN_PROGRESS' };
  }

  if (['completed', 'complete', 'hangup'].includes(normalized)) {
    return { eventType: 'COMPLETED', callSessionStatus: 'COMPLETED' };
  }

  if (
    ['busy', 'failed', 'no-answer', 'no_answer', 'canceled', 'cancelled'].includes(
      normalized,
    )
  ) {
    return { eventType: 'FAILED', callSessionStatus: 'FAILED' };
  }

  return { eventType: 'DIALING', callSessionStatus: 'DIALING' };
};

@Injectable()
export class TwilioCompatibleTelephonyProviderAdapter
  implements TelephonyProviderAdapter
{
  readonly key = PROVIDER_KEY;

  createAccessToken(
    input: TelephonyProviderAccessTokenInput,
  ): TelephonyProviderAccessToken {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const identity = input.agentProfileId
      ? `agent:${input.agentProfileId}`
      : `workspace-member:${input.workspaceMemberId}`;
    const tokenPayload = {
      provider: PROVIDER_KEY,
      workspaceId: input.workspaceId,
      identity,
      expiresAt,
    };

    return {
      provider: PROVIDER_KEY,
      token: Buffer.from(JSON.stringify(tokenPayload)).toString('base64url'),
      identity,
      expiresAt,
    };
  }

  createOutboundCall(
    input: TelephonyProviderOutboundCallInput,
  ): TelephonyProviderOutboundCall {
    const providerCallId = `crm-${input.callSessionId}-${randomUUID()}`;

    return {
      provider: PROVIDER_KEY,
      providerCallId,
      providerParentCallId: null,
      instruction: {
        provider: PROVIDER_KEY,
        action: 'outbound-call',
        workspaceId: input.workspaceId,
        callSessionId: input.callSessionId,
        agentProfileId: input.agentProfileId,
        from: input.fromNumber,
        to: input.toNumber,
        record: input.recordingEnabled,
        statusCallback: input.webhookUrl,
      },
    };
  }

  validateWebhook(input: TelephonyProviderWebhookValidationInput): boolean {
    if (!input.webhookSecret) {
      return true;
    }

    const sharedSecret = getHeader(
      input.headers,
      'x-telephony-webhook-secret',
    );

    return sharedSecret === input.webhookSecret;
  }

  normalizeWebhookEvent(
    payload: Record<string, unknown>,
  ): TelephonyProviderWebhookEvent {
    const { eventType, callSessionStatus } = mapStatusToEvent(payload);
    const timestamp = getString(payload, [
      'Timestamp',
      'EventTimestamp',
      'timestamp',
      'eventTimestamp',
    ]);
    const eventTime = timestamp ? new Date(timestamp) : new Date();

    return {
      eventType,
      callSessionStatus,
      provider: PROVIDER_KEY,
      providerEventId: getString(payload, [
        'EventSid',
        'MessageSid',
        'SequenceNumber',
        'eventSid',
        'sequenceNumber',
      ]),
      providerCallId: getString(payload, [
        'CallSid',
        'CallUUID',
        'callSid',
        'callUuid',
      ]),
      providerParentCallId: getString(payload, [
        'ParentCallSid',
        'ParentCallUUID',
        'parentCallSid',
        'parentCallUuid',
      ]),
      providerRecordingId: getString(payload, [
        'RecordingSid',
        'RecordingID',
        'recordingSid',
        'recordingId',
      ]),
      recordingUrl: getString(payload, [
        'RecordingUrl',
        'RecordingURL',
        'recordingUrl',
      ]),
      recordingStatus: getString(payload, [
        'RecordingStatus',
        'recordingStatus',
      ]),
      fromNumber: getString(payload, ['From', 'from']),
      toNumber: getString(payload, ['To', 'to']),
      durationSeconds: getNumber(payload, [
        'CallDuration',
        'Duration',
        'callDuration',
        'duration',
      ]),
      eventTime: Number.isNaN(eventTime.getTime()) ? new Date() : eventTime,
      payload,
    };
  }
}
