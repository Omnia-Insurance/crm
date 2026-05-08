export type ProviderId = 'twilio' | 'vonage' | 'ringcentral' | 'aircall';

export type CallDirection = 'outbound' | 'inbound';

export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'no-answer'
  | 'busy'
  | 'failed';

export type SmsStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received';

export interface InitiateCallArgs {
  from: string;
  to: string;
  agentMemberId: string;
  recordingEnabled?: boolean;
}

export interface SendSmsArgs {
  from: string;
  to: string;
  body: string;
  mediaUrls?: string[];
}

export interface ProviderCapabilities {
  voice: boolean;
  sms: boolean;
  mms: boolean;
  webrtc: boolean;
}

export type ErrorClass =
  | 'transient'
  | 'permanent'
  | 'rate-limited'
  | 'unauthorized';

// Normalized webhook event — every adapter parses provider events into one shape.
export type TelephonyEvent =
  | {
      kind: 'call.initiated';
      provider: ProviderId;
      providerCallSid: string;
      direction: CallDirection;
      from: string;
      to: string;
      occurredAt: Date;
    }
  | {
      kind: 'call.answered';
      provider: ProviderId;
      providerCallSid: string;
      occurredAt: Date;
    }
  | {
      kind: 'call.completed';
      provider: ProviderId;
      providerCallSid: string;
      status: CallStatus;
      durationSec: number;
      // Matches Twenty's CURRENCY composite: amountMicros + ISO currency code.
      cost?: { amountMicros: number; currencyCode: string };
      occurredAt: Date;
    }
  | {
      kind: 'recording.completed';
      provider: ProviderId;
      providerCallSid: string;
      recordingUrl: string;
      recordingDurationSec: number;
      occurredAt: Date;
    }
  | {
      kind: 'sms.received';
      provider: ProviderId;
      providerMessageSid: string;
      from: string;
      to: string;
      body: string;
      mediaUrls: string[];
      occurredAt: Date;
    }
  | {
      kind: 'sms.delivered';
      provider: ProviderId;
      providerMessageSid: string;
      status: SmsStatus;
      occurredAt: Date;
    };

export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  rawBody: string;
  url: string;
}

export interface BrowserAccessToken {
  token: string;
  expiresAt: Date;
  // Identifies which client SDK should consume this token; the front-end loads
  // the matching provider SDK at runtime so it can switch when assignments change.
  providerId: ProviderId;
}

// ── Number provisioning ──────────────────────────────────────────────────

export interface AvailableNumber {
  e164: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  monthlyPrice?: { amountMicros: number; currencyCode: string };
}

export interface SearchNumbersArgs {
  country: string; // ISO-3166-1 alpha-2, e.g. 'US'
  areaCode?: string;
  contains?: string;
  limit?: number;
  capabilities?: Partial<Pick<ProviderCapabilities, 'voice' | 'sms' | 'mms'>>;
}

export interface ProvisionedNumber {
  e164: string;
  friendlyName: string;
  providerNumberSid: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}
