import {
  AvailableNumber,
  BrowserAccessToken,
  ErrorClass,
  InitiateCallArgs,
  ProviderCapabilities,
  ProviderId,
  ProvisionedNumber,
  SearchNumbersArgs,
  SendSmsArgs,
  TelephonyEvent,
  WebhookRequest,
} from 'src/modules/core/adapter/types';

// One adapter per provider. The ProviderRouter (sibling file) is the only
// caller that should pick which adapter to use — feature code talks to the
// router, not directly to adapters, so that failover and weighting work.
export interface TelephonyAdapter {
  readonly providerId: ProviderId;
  readonly capabilities: ProviderCapabilities;

  // Outbound voice
  initiateCall(args: InitiateCallArgs): Promise<{ callSid: string }>;
  hangup(callSid: string): Promise<void>;

  // Outbound messaging
  sendSms(args: SendSmsArgs): Promise<{ messageSid: string }>;

  // Inbound webhooks
  parseWebhook(req: WebhookRequest): Promise<TelephonyEvent>;

  // Browser softphone — the user is pinned to whichever provider issued
  // their assigned number, so this is provider-specific even though the
  // router is what decides who issues the token at request time.
  generateBrowserAccessToken(memberId: string): Promise<BrowserAccessToken>;

  // Number provisioning — used by the CSO settings UI for the
  // buy / release flow. `provisionNumber` is also responsible for pointing
  // the new number's VoiceUrl / SmsUrl at this app's webhook routes so
  // inbound calls + SMS land in the workspace from the moment of purchase.
  searchAvailableNumbers(args: SearchNumbersArgs): Promise<AvailableNumber[]>;
  provisionNumber(args: {
    e164: string;
    friendlyName?: string;
  }): Promise<ProvisionedNumber>;
  releaseNumber(providerNumberSid: string): Promise<void>;

  // Health
  probe(): Promise<{ ok: boolean; latencyMs: number }>;
  classifyError(err: unknown): ErrorClass;
}
