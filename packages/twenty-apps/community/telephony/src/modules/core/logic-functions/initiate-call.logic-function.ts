import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';

import { buildTwilioAdapterFromEnv } from 'src/modules/twilio/build-adapter';

interface RequestBody {
  // E.164 of the agent's workspace-issued number (FROM)
  from: string;
  // E.164 of the destination
  to: string;
  // Workspace member id — used to bridge the call leg back to their browser
  // softphone via TwiML `<Dial><Client>{memberId}</Client></Dial>`. For
  // mobile-forward-only flows the TwiML can be customized to dial a cell.
  agentMemberId: string;
  // Optional override; falls back to the workspace's RECORDING_ENABLED flag.
  recordingEnabled?: boolean;
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const body = event.body;
  if (!body?.from || !body.to || !body.agentMemberId) {
    return {
      error:
        'initiate-call requires { from, to, agentMemberId } in the request body',
    };
  }

  const recordingEnabled =
    body.recordingEnabled ??
    (process.env.RECORDING_ENABLED ?? '').toLowerCase() === 'true';

  const adapter = buildTwilioAdapterFromEnv();
  const { callSid } = await adapter.initiateCall({
    from: body.from,
    to: body.to,
    agentMemberId: body.agentMemberId,
    recordingEnabled,
  });

  // We deliberately don't create the Call workspace record here — it's
  // created by the `twilio-webhook` handler when Twilio fires the
  // `initiated` status callback. That keeps a single source of truth for
  // the row's lifecycle and means a failed request here doesn't leak a
  // half-formed Call row.
  return { callSid, provider: 'twilio' };
};

export default defineLogicFunction({
  universalIdentifier: 'b71c3d4f-2a86-4e51-9d82-6a1f0c8e4b97',
  name: 'initiate-call',
  description:
    'Places an outbound call via the configured telephony provider (REST mode). Used for mobile-forward fallback and for click-to-call paths where the browser softphone is not available.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/initiate-call',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
