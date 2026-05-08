import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { resolveAgentForDialedNumber } from 'src/modules/core/messaging/helpers';
import { parseFormBody } from 'src/modules/twilio/webhook-signature';

// Twilio fetches this endpoint when:
//   1. A browser softphone places an outbound call (Voice JS SDK → Twilio →
//      this URL). The form body has `To` with the destination number.
//   2. An inbound call hits a workspace number whose Voice URL is set to
//      this endpoint. The form body has `From` (caller) and `To` (our DID).
//
// Returns TwiML (XML). For outbound, we wrap the destination in <Dial>; for
// inbound, we look up the assignment and dial the agent's `<Client>`.

interface TwilioFormPayload {
  From?: string;
  To?: string;
  Direction?: string;
  CallSid?: string;
}

const handler = async (
  event: RoutePayload<TwilioFormPayload | string>,
) => {
  const params = normalizeBody(event.body);
  const direction = params.Direction;
  const agentFromQuery = event.queryStringParameters?.agent;

  if (direction === 'inbound') {
    const dialedNumber = params.To ?? '';
    const client = new CoreApiClient();
    const agent = await resolveAgentForDialedNumber(client, dialedNumber);
    if (agent?.workspaceMemberId) {
      return twimlResponse(
        `<Response><Dial><Client>${escapeXml(agent.workspaceMemberId)}</Client></Dial></Response>`,
      );
    }
    return twimlResponse(
      `<Response><Say>The party you are calling is unavailable. Please try again later.</Say><Hangup/></Response>`,
    );
  }

  // Outbound — placed via initiate-call (server-initiated REST) or by the
  // browser SDK. `agent` is set by the REST initiate-call path so the
  // outbound leg can be bridged back to the agent's softphone identity for
  // recording / monitoring; for browser-originated calls it's absent and
  // we just dial the destination directly from the API key identity.
  const to = params.To ?? '';
  if (!to) {
    return twimlResponse(`<Response><Say>Missing destination.</Say></Response>`);
  }

  const callerId = process.env.TWILIO_DEFAULT_CALLER_ID;
  const dialAttrs = callerId
    ? ` callerId="${escapeXml(callerId)}"`
    : '';

  if (agentFromQuery) {
    // Bridge inbound leg to the agent's browser softphone — same logic as
    // inbound handling but with an explicit agent target from the query.
    return twimlResponse(
      `<Response><Dial${dialAttrs}><Client>${escapeXml(agentFromQuery)}</Client></Dial></Response>`,
    );
  }

  return twimlResponse(
    `<Response><Dial${dialAttrs}>${escapeXml(to)}</Dial></Response>`,
  );
};

// Twilio sends application/x-www-form-urlencoded. The runtime may or may not
// pre-parse it, so handle both shapes.
function normalizeBody(
  body: TwilioFormPayload | string | null,
): TwilioFormPayload {
  if (body == null) return {};
  if (typeof body === 'string') return parseFormBody(body) as TwilioFormPayload;
  return body;
}

function twimlResponse(xml: string) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>${xml}`,
  };
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default defineLogicFunction({
  universalIdentifier: '4f7a0b3d-9c15-4f5e-8a7b-2e9c3d1f6a40',
  name: 'twiml-app',
  description:
    'Dynamic TwiML endpoint Twilio fetches for inbound calls and browser-originated outbound calls. Routes inbound to the assigned agent\'s `<Client>` softphone and dials outbound destinations.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/twilio/twiml',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
