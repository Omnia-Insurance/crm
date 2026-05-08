import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { buildTwilioAdapterFromEnv } from 'src/modules/twilio/build-adapter';

interface RequestBody {
  e164: string;
  friendlyName?: string;
  // Optional: assign immediately to this workspaceMember (skips a separate
  // assign call when the CSO is buying a number for a specific agent).
  assignToWorkspaceMemberId?: string;
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const args = event.body;
  if (!args?.e164) {
    return { error: 'buy-number requires { e164 } in the request body' };
  }

  const adapter = buildTwilioAdapterFromEnv();
  const provisioned = await adapter.provisionNumber({
    e164: args.e164,
    friendlyName: args.friendlyName,
  });

  // Persist as a `phoneNumber` workspace row.
  const client = new CoreApiClient();
  const created = (await client.mutation({
    createPhoneNumber: {
      __args: {
        data: {
          e164: provisioned.e164,
          friendlyName: provisioned.friendlyName,
          provider: 'TWILIO',
          providerNumberSid: provisioned.providerNumberSid,
          voiceEnabled: provisioned.capabilities.voice,
          smsEnabled: provisioned.capabilities.sms,
          mmsEnabled: provisioned.capabilities.mms,
        } as any,
      },
      id: true,
    },
  } as any)) as any;

  const phoneNumberId = created.createPhoneNumber.id;

  // Provision the matching `messageChannel` so inbound SMS to this number
  // can be linked through `messageChannelMessageAssociation`. Best-effort —
  // if this fails, SMS still saves (just without channel association).
  // The handle is the E.164; type SMS is the upstream-supported value.
  try {
    await client.mutation({
      createMessageChannel: {
        __args: {
          data: {
            handle: provisioned.e164,
            type: 'SMS',
          } as any,
        },
        id: true,
      },
    } as any);
  } catch (err) {
    console.warn(
      `[buy-number] messageChannel creation failed for ${provisioned.e164}; SMS will save without channel link until provisioned manually:`,
      err,
    );
  }

  let assignmentId: string | null = null;
  if (args.assignToWorkspaceMemberId) {
    const assignment = (await client.mutation({
      createPhoneAssignment: {
        __args: {
          data: {
            name: `${provisioned.e164} → member`,
            phoneNumberId,
            workspaceMemberId: args.assignToWorkspaceMemberId,
            isDefault: true,
            outboundCallerId: true,
            webrtcEnabled: true,
          } as any,
        },
        id: true,
      },
    } as any)) as any;
    assignmentId = assignment.createPhoneAssignment.id;
  }

  return {
    provider: 'twilio',
    phoneNumberId,
    e164: provisioned.e164,
    providerNumberSid: provisioned.providerNumberSid,
    assignmentId,
  };
};

export default defineLogicFunction({
  universalIdentifier: '9a4f0589-e1dc-40f6-9de2-e4d9b00ccb3d',
  name: 'buy-number',
  description:
    'Purchase a phone number from the configured provider, persist a phoneNumber row, provision the matching SMS messageChannel, and optionally assign to a workspaceMember.',
  timeoutSeconds: 20,
  handler,
  httpRouteTriggerSettings: {
    path: '/numbers/buy',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
