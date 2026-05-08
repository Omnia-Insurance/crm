import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';

import { buildTwilioAdapterFromEnv } from 'src/modules/twilio/build-adapter';

interface RequestBody {
  // E.164 of the workspace-issued sending number
  from: string;
  // E.164 of the recipient
  to: string;
  body: string;
  mediaUrls?: string[];
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const args = event.body;
  if (!args?.from || !args.to || !args.body) {
    return {
      error: 'send-sms requires { from, to, body } in the request body',
    };
  }

  const adapter = buildTwilioAdapterFromEnv();
  const { messageSid } = await adapter.sendSms({
    from: args.from,
    to: args.to,
    body: args.body,
    mediaUrls: args.mediaUrls,
  });

  // Like initiate-call, we don't write the `message` row here. Twilio's
  // delivery callback fires within a second or two with status QUEUED/SENT
  // and the webhook handler upserts the message row keyed by
  // providerMessageSid. That avoids inserting an optimistic row that we'd
  // then need to reconcile with the eventual SID.
  return { messageSid, provider: 'twilio' };
};

export default defineLogicFunction({
  universalIdentifier: 'c5b94d6e-7f1a-4e23-8b6c-9d2e3f5a1b06',
  name: 'send-sms',
  description:
    'Sends an SMS (or MMS, when mediaUrls are provided) via the configured telephony provider. The resulting message row is created by the delivery-callback webhook, keyed by providerMessageSid.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/send-sms',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
