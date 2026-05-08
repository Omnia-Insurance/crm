import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';

import { buildTwilioAdapterFromEnv } from 'src/modules/twilio/build-adapter';

interface RequestBody {
  // The workspaceMember id that the browser softphone should register as.
  // Inbound `<Dial><Client>{memberId}</Client></Dial>` will then ring this
  // browser tab. The caller authenticates as the member; this is just the
  // identity Twilio will expose to TwiML.
  memberId: string;
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const memberId = event.body?.memberId;
  if (!memberId || typeof memberId !== 'string') {
    return { error: 'memberId is required' };
  }

  const adapter = buildTwilioAdapterFromEnv();
  const { token, expiresAt, providerId } =
    await adapter.generateBrowserAccessToken(memberId);

  return {
    providerId,
    token,
    expiresAt: expiresAt.toISOString(),
  };
};

export default defineLogicFunction({
  universalIdentifier: 'a3d9e012-2f4c-4e66-9a1d-67c31c0e7d8b',
  name: 'generate-access-token',
  description:
    'Mints a short-lived AccessToken for the active workspaceMember\'s browser softphone. Returns provider id + JWT + expiry.',
  timeoutSeconds: 5,
  handler,
  httpRouteTriggerSettings: {
    path: '/twilio/access-token',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
