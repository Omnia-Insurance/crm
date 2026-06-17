export type TelephonyAgentStatus =
  | 'READY'
  | 'BREAK'
  | 'LUNCH'
  | 'TRAINING'
  | 'OFFLINE';

export type TelephonyCampaignLeadStatus =
  | 'READY'
  | 'LOCKED'
  | 'CALLING'
  | 'CALLBACK'
  | 'RETRY_WAIT'
  | 'COMPLETED'
  | 'DNC_BLOCKED'
  | 'TIME_WINDOW_BLOCKED'
  | 'EXHAUSTED';

export type TelephonyCallDirection = 'OUTBOUND' | 'INBOUND';

export type TelephonyCallSessionStatus =
  | 'RESERVED'
  | 'OFFERED'
  | 'DIALING'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'MISSED'
  | 'DISPOSITIONED';

export type TelephonyCallEventType =
  | 'ROUTED'
  | 'LOCKED'
  | 'RELEASED'
  | 'DIALING'
  | 'RINGING'
  | 'ANSWERED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECORDING_READY'
  | 'BLOCKED_ATTEMPT'
  | 'INBOUND_OFFERED'
  | 'INBOUND_MISSED'
  | 'DISPOSITION_SUBMITTED';

export type TelephonyProviderWebhookEvent = {
  eventType: TelephonyCallEventType;
  callSessionStatus?: TelephonyCallSessionStatus;
  provider: string;
  providerEventId: string | null;
  providerCallId: string | null;
  providerParentCallId: string | null;
  providerRecordingId: string | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  durationSeconds: number | null;
  eventTime: Date;
  payload: Record<string, unknown>;
};

export type TelephonyProviderOutboundCall = {
  provider: string;
  providerCallId: string;
  providerParentCallId?: string | null;
  instruction: Record<string, unknown>;
};

export type TelephonyProviderAccessToken = {
  provider: string;
  token: string;
  identity: string;
  expiresAt: string;
};
