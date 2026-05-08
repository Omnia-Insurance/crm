import { TelephonyAdapter } from 'src/modules/core/adapter/telephony-adapter';
import {
  AvailableNumber,
  BrowserAccessToken,
  CallStatus,
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
import { mintTwilioAccessToken } from 'src/modules/twilio/access-token';
import {
  parseFormBody,
  verifyTwilioSignature,
} from 'src/modules/twilio/webhook-signature';

export interface TwilioAdapterConfig {
  accountSid: string;
  authToken: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  twimlAppSid?: string;
  webhookSecret?: string;
  // Public base URL where this app's logic-function routes are served. Used
  // to build webhook URLs Twilio fetches/posts to. Required for outbound
  // calls (Url + StatusCallback) and recording callbacks.
  webhookBaseUrl?: string;
}

const TWILIO_REST_BASE = 'https://api.twilio.com/2010-04-01';

const TWILIO_STATUS_MAP: Record<string, CallStatus> = {
  queued: 'queued',
  initiated: 'queued',
  ringing: 'ringing',
  'in-progress': 'in-progress',
  completed: 'completed',
  busy: 'busy',
  'no-answer': 'no-answer',
  failed: 'failed',
  canceled: 'failed',
};

// Twilio error codes that mean the request will never succeed regardless of
// retries. Anything not in this list and not a 5xx is treated as 'permanent'
// by HTTP-status fallback in classifyError.
const PERMANENT_TWILIO_CODES = new Set<number>([
  21211, // Invalid 'To' Phone Number
  21212, // Invalid 'From' Phone Number
  21214, // 'To' phone number cannot be reached
  21217, // Phone number does not appear to be valid
  21219, // 'To' number not verified for this trial account
  21601, // Phone number is not a valid SMS-capable inbound number
  21610, // Attempt to send to unsubscribed recipient
  21611, // 'From' number is not enabled for SMS
  21614, // 'To' number is not a valid mobile number
]);

class TwilioRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | undefined,
    readonly moreInfo: string | undefined,
  ) {
    super(message);
    this.name = 'TwilioRestError';
  }
}

export class TwilioAdapter implements TelephonyAdapter {
  readonly providerId: ProviderId = 'twilio';
  readonly capabilities: ProviderCapabilities = {
    voice: true,
    sms: true,
    mms: true,
    webrtc: true,
  };

  constructor(private readonly cfg: TwilioAdapterConfig) {}

  async initiateCall(
    args: InitiateCallArgs,
  ): Promise<{ callSid: string }> {
    const baseUrl = this.requireWebhookBaseUrl();
    const url = new URL(`${baseUrl}/twilio/twiml`);
    url.searchParams.set('agent', args.agentMemberId);

    const body: Record<string, string | undefined> = {
      From: args.from,
      To: args.to,
      Url: url.toString(),
      StatusCallback: `${baseUrl}/twilio/webhook`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
    };
    if (args.recordingEnabled) {
      body.Record = 'true';
      body.RecordingStatusCallback = `${baseUrl}/twilio/webhook`;
      body.RecordingStatusCallbackEvent = 'completed';
    }

    const res = await this.post<{ sid: string }>(
      `/Accounts/${this.cfg.accountSid}/Calls.json`,
      body,
    );
    return { callSid: res.sid };
  }

  async hangup(callSid: string): Promise<void> {
    await this.post<{ sid: string }>(
      `/Accounts/${this.cfg.accountSid}/Calls/${encodeURIComponent(callSid)}.json`,
      { Status: 'completed' },
    );
  }

  async sendSms(args: SendSmsArgs): Promise<{ messageSid: string }> {
    const baseUrl = this.cfg.webhookBaseUrl;
    const body: Record<string, string | undefined> = {
      From: args.from,
      To: args.to,
      Body: args.body,
      // Twilio will POST status updates here so the message row gets the
      // delivered/failed lifecycle. Optional — skipped when no base URL.
      StatusCallback: baseUrl ? `${baseUrl}/twilio/webhook` : undefined,
    };

    // MMS: Twilio accepts repeated MediaUrl params via form encoding.
    if (args.mediaUrls && args.mediaUrls.length > 0) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined) params.append(k, v);
      }
      for (const mediaUrl of args.mediaUrls) {
        params.append('MediaUrl', mediaUrl);
      }
      const res = await this.postRaw<{ sid: string }>(
        `/Accounts/${this.cfg.accountSid}/Messages.json`,
        params,
      );
      return { messageSid: res.sid };
    }

    const res = await this.post<{ sid: string }>(
      `/Accounts/${this.cfg.accountSid}/Messages.json`,
      body,
    );
    return { messageSid: res.sid };
  }

  async generateBrowserAccessToken(
    memberId: string,
  ): Promise<BrowserAccessToken> {
    if (!this.cfg.apiKeySid || !this.cfg.apiKeySecret) {
      throw new Error(
        'Twilio API Key SID + Secret are required to mint browser access tokens. Configure TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET on the workspace.',
      );
    }
    if (!this.cfg.twimlAppSid) {
      throw new Error(
        'Twilio TwiML App SID is required to mint browser access tokens. Configure TWILIO_TWIML_APP_SID on the workspace.',
      );
    }

    const { token, expiresAt } = mintTwilioAccessToken({
      accountSid: this.cfg.accountSid,
      apiKeySid: this.cfg.apiKeySid,
      apiKeySecret: this.cfg.apiKeySecret,
      identity: memberId,
      twimlAppSid: this.cfg.twimlAppSid,
    });
    return { token, expiresAt, providerId: 'twilio' };
  }

  async parseWebhook(req: WebhookRequest): Promise<TelephonyEvent> {
    const params = parseFormBody(req.rawBody);

    if (this.cfg.webhookSecret) {
      const result = verifyTwilioSignature({
        url: req.url,
        params,
        signatureHeader: req.headers['x-twilio-signature'],
        secret: this.cfg.webhookSecret,
      });
      if (!result.ok) {
        throw new Error(`Twilio webhook signature invalid: ${result.reason}`);
      }
    }

    const occurredAt = new Date();
    const callSid = params.CallSid;
    const messageSid = params.MessageSid;
    const recordingUrl = params.RecordingUrl;

    if (recordingUrl && callSid) {
      return {
        kind: 'recording.completed',
        provider: 'twilio',
        providerCallSid: callSid,
        recordingUrl,
        recordingDurationSec: Number(params.RecordingDuration ?? '0'),
        occurredAt,
      };
    }

    if (messageSid) {
      const status = params.MessageStatus;
      if (status === 'received') {
        return {
          kind: 'sms.received',
          provider: 'twilio',
          providerMessageSid: messageSid,
          from: params.From ?? '',
          to: params.To ?? '',
          body: params.Body ?? '',
          mediaUrls: collectMediaUrls(params),
          occurredAt,
        };
      }
      return {
        kind: 'sms.delivered',
        provider: 'twilio',
        providerMessageSid: messageSid,
        status:
          status === 'delivered' || status === 'sent' || status === 'failed'
            ? status
            : 'queued',
        occurredAt,
      };
    }

    if (callSid) {
      const callStatus = params.CallStatus;
      const direction = params.Direction === 'inbound' ? 'inbound' : 'outbound';
      if (callStatus === 'initiated' || callStatus === 'queued') {
        return {
          kind: 'call.initiated',
          provider: 'twilio',
          providerCallSid: callSid,
          direction,
          from: params.From ?? '',
          to: params.To ?? '',
          occurredAt,
        };
      }
      if (callStatus === 'in-progress') {
        return {
          kind: 'call.answered',
          provider: 'twilio',
          providerCallSid: callSid,
          occurredAt,
        };
      }
      return {
        kind: 'call.completed',
        provider: 'twilio',
        providerCallSid: callSid,
        status: TWILIO_STATUS_MAP[callStatus ?? 'completed'] ?? 'completed',
        durationSec: Number(params.CallDuration ?? '0'),
        occurredAt,
      };
    }

    throw new Error(
      'Twilio webhook: could not classify event from form parameters',
    );
  }

  async searchAvailableNumbers(
    args: SearchNumbersArgs,
  ): Promise<AvailableNumber[]> {
    const country = args.country || 'US';
    const params = new URLSearchParams();
    if (args.areaCode) params.append('AreaCode', args.areaCode);
    if (args.contains) params.append('Contains', args.contains);
    if (args.limit) params.append('PageSize', String(args.limit));
    if (args.capabilities?.voice) params.append('VoiceEnabled', 'true');
    if (args.capabilities?.sms) params.append('SmsEnabled', 'true');
    if (args.capabilities?.mms) params.append('MmsEnabled', 'true');

    const path = `/Accounts/${this.cfg.accountSid}/AvailablePhoneNumbers/${country}/Local.json`;
    const res = await this.get<{
      available_phone_numbers: Array<{
        phone_number: string;
        friendly_name: string;
        locality: string | null;
        region: string | null;
        capabilities: { voice: boolean; SMS: boolean; MMS: boolean };
      }>;
    }>(path, params);

    return res.available_phone_numbers.map((n) => ({
      e164: n.phone_number,
      friendlyName: n.friendly_name,
      locality: n.locality,
      region: n.region,
      capabilities: {
        voice: !!n.capabilities.voice,
        sms: !!n.capabilities.SMS,
        mms: !!n.capabilities.MMS,
      },
    }));
  }

  async provisionNumber(args: {
    e164: string;
    friendlyName?: string;
  }): Promise<ProvisionedNumber> {
    const baseUrl = this.cfg.webhookBaseUrl;
    const body: Record<string, string | undefined> = {
      PhoneNumber: args.e164,
      FriendlyName: args.friendlyName,
    };
    // Wire the new number to this app's TwiML + webhook routes at purchase
    // time so inbound calls + SMS work from the moment the row appears.
    if (baseUrl) {
      body.VoiceUrl = `${baseUrl}/twilio/twiml`;
      body.VoiceMethod = 'POST';
      body.StatusCallback = `${baseUrl}/twilio/webhook`;
      body.StatusCallbackMethod = 'POST';
      body.SmsUrl = `${baseUrl}/twilio/webhook`;
      body.SmsMethod = 'POST';
    }

    const res = await this.post<{
      sid: string;
      phone_number: string;
      friendly_name: string;
      capabilities: { voice: boolean; sms: boolean; mms: boolean };
    }>(`/Accounts/${this.cfg.accountSid}/IncomingPhoneNumbers.json`, body);

    return {
      providerNumberSid: res.sid,
      e164: res.phone_number,
      friendlyName: res.friendly_name,
      capabilities: {
        voice: !!res.capabilities.voice,
        sms: !!res.capabilities.sms,
        mms: !!res.capabilities.mms,
      },
    };
  }

  async releaseNumber(providerNumberSid: string): Promise<void> {
    const res = await fetch(
      `${TWILIO_REST_BASE}/Accounts/${this.cfg.accountSid}/IncomingPhoneNumbers/${encodeURIComponent(providerNumberSid)}.json`,
      {
        method: 'DELETE',
        headers: { Authorization: this.basicAuth() },
      },
    );
    if (!res.ok) {
      throw new TwilioRestError(
        `Twilio release failed: ${res.status}`,
        res.status,
        undefined,
        undefined,
      );
    }
  }

  async probe(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const res = await fetch(
        `${TWILIO_REST_BASE}/Accounts/${this.cfg.accountSid}.json`,
        { headers: { Authorization: this.basicAuth() } },
      );
      return { ok: res.ok, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  classifyError(err: unknown): ErrorClass {
    if (err instanceof TwilioRestError) {
      if (err.code !== undefined && PERMANENT_TWILIO_CODES.has(err.code)) {
        return 'permanent';
      }
      if (err.status === 401 || err.status === 403) return 'unauthorized';
      if (err.status === 429) return 'rate-limited';
      if (err.status >= 500) return 'transient';
      if (err.status >= 400) return 'permanent';
    }
    // Network-level errors (ETIMEDOUT, ECONNRESET, fetch failures) → transient.
    return 'transient';
  }

  // ── REST helpers ───────────────────────────────────────────────────────

  private async post<T>(
    path: string,
    body: Record<string, string | undefined>,
  ): Promise<T> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) params.append(k, v);
    }
    return this.postRaw<T>(path, params);
  }

  private async get<T>(path: string, params: URLSearchParams): Promise<T> {
    const url = `${TWILIO_REST_BASE}${path}?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: this.basicAuth() },
    });
    const text = await res.text();
    if (!res.ok) {
      let code: number | undefined;
      let message = `Twilio ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { code?: number; message?: string };
        code = parsed.code;
        if (parsed.message) message = parsed.message;
      } catch {
        // body wasn't JSON
      }
      throw new TwilioRestError(message, res.status, code, undefined);
    }
    return JSON.parse(text) as T;
  }

  private async postRaw<T>(path: string, params: URLSearchParams): Promise<T> {
    const res = await fetch(`${TWILIO_REST_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      let code: number | undefined;
      let message = `Twilio ${res.status}`;
      let moreInfo: string | undefined;
      try {
        const parsed = JSON.parse(text) as {
          code?: number;
          message?: string;
          more_info?: string;
        };
        code = parsed.code;
        if (parsed.message) message = parsed.message;
        moreInfo = parsed.more_info;
      } catch {
        // body wasn't JSON — keep the default message
      }
      throw new TwilioRestError(message, res.status, code, moreInfo);
    }
    return JSON.parse(text) as T;
  }

  // Prefer the API Key pair (revocable, scoped) when configured; otherwise
  // fall back to the account auth token.
  private basicAuth(): string {
    const user = this.cfg.apiKeySid ?? this.cfg.accountSid;
    const pass = this.cfg.apiKeySecret ?? this.cfg.authToken;
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  private requireWebhookBaseUrl(): string {
    if (!this.cfg.webhookBaseUrl) {
      throw new Error(
        'TwilioAdapter requires webhookBaseUrl to place outbound calls (used for the TwiML callback). Configure it when constructing the adapter.',
      );
    }
    return this.cfg.webhookBaseUrl;
  }
}

function collectMediaUrls(params: Record<string, string>): string[] {
  const urls: string[] = [];
  const count = Number(params.NumMedia ?? '0');
  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) urls.push(url);
  }
  return urls;
}
