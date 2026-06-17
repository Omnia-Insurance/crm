import {
  type TelephonyProviderAccessToken,
  type TelephonyProviderOutboundCall,
  type TelephonyProviderWebhookEvent,
} from 'src/modules/telephony/types/telephony.type';

export type TelephonyProviderWebhookValidationInput = {
  headers: Record<string, string | string[] | undefined>;
  payload: Record<string, unknown>;
  rawBody?: Buffer;
  webhookSecret?: string | null;
};

export type TelephonyProviderOutboundCallInput = {
  workspaceId: string;
  callSessionId: string;
  agentProfileId: string;
  fromNumber: string | null;
  toNumber: string;
  recordingEnabled: boolean;
  webhookUrl: string | null;
};

export type TelephonyProviderAccessTokenInput = {
  workspaceId: string;
  workspaceMemberId: string;
  agentProfileId: string | null;
};

export interface TelephonyProviderAdapter {
  readonly key: string;

  createAccessToken(
    input: TelephonyProviderAccessTokenInput,
  ): TelephonyProviderAccessToken;

  createOutboundCall(
    input: TelephonyProviderOutboundCallInput,
  ): TelephonyProviderOutboundCall;

  validateWebhook(input: TelephonyProviderWebhookValidationInput): boolean;

  normalizeWebhookEvent(
    payload: Record<string, unknown>,
  ): TelephonyProviderWebhookEvent;
}
