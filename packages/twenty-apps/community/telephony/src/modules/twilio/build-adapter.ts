import {
  TwilioAdapter,
  type TwilioAdapterConfig,
} from 'src/modules/twilio/adapter';

// Reads the workspace's applicationVariables (injected as process.env in
// logic-function processes) and constructs a configured TwilioAdapter.
//
// Throws a clear error when required credentials are missing — better to
// fail fast at the route boundary than to surface a confusing 401 from
// Twilio inside an outbound call attempt.

export function buildTwilioAdapterFromEnv(): TwilioAdapter {
  const cfg: TwilioAdapterConfig = {
    accountSid: requireEnv('TWILIO_ACCOUNT_SID'),
    authToken: requireEnv('TWILIO_AUTH_TOKEN'),
    apiKeySid: process.env.TWILIO_API_KEY_SID,
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET,
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID,
    webhookSecret: process.env.TWILIO_WEBHOOK_SECRET,
    webhookBaseUrl: process.env.WEBHOOK_PUBLIC_URL,
  };
  return new TwilioAdapter(cfg);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required Telephony app variable "${name}". Configure it under Settings → Applications → Telephony.`,
    );
  }
  return v;
}
