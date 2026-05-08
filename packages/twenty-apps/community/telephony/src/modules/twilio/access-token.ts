import { createHmac } from 'crypto';

// Mints a Twilio Voice JS SDK AccessToken without pulling in the `twilio` npm
// package. The token is a JWT signed with HMAC-SHA256 over the API Key Secret;
// the only Twilio-specific bit is the `cty: 'twilio-fpa;v=1'` header (FPA =
// Flexible Privilege Authentication) and the `grants` claim shape.
//
// Reference: https://www.twilio.com/docs/iam/access-tokens

interface MintArgs {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  identity: string; // workspaceMember id — used by `<Dial><Client>` for inbound
  twimlAppSid: string;
  ttlSeconds?: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour, the Twilio default and ceiling for typical use

export function mintTwilioAccessToken({
  accountSid,
  apiKeySid,
  apiKeySecret,
  identity,
  twimlAppSid,
  ttlSeconds = DEFAULT_TTL_SECONDS,
}: MintArgs): { token: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
    cty: 'twilio-fpa;v=1',
  };

  const payload = {
    jti: `${apiKeySid}-${now}`,
    iss: apiKeySid,
    sub: accountSid,
    nbf: now,
    exp,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: twimlAppSid },
      },
    },
  };

  const headerSegment = base64url(JSON.stringify(header));
  const payloadSegment = base64url(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = createHmac('sha256', apiKeySecret)
    .update(signingInput)
    .digest('base64');
  const signatureSegment = base64urlFromBase64(signature);

  return {
    token: `${signingInput}.${signatureSegment}`,
    expiresAt: new Date(exp * 1000),
  };
}

function base64url(input: string): string {
  return base64urlFromBase64(Buffer.from(input, 'utf8').toString('base64'));
}

function base64urlFromBase64(input: string): string {
  return input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
