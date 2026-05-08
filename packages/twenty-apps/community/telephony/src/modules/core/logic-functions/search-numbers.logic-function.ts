import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';

import { buildTwilioAdapterFromEnv } from 'src/modules/twilio/build-adapter';

interface RequestBody {
  country?: string; // ISO-3166-1 alpha-2; defaults to US
  areaCode?: string;
  contains?: string;
  limit?: number;
  capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean };
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const args = event.body ?? {};
  const adapter = buildTwilioAdapterFromEnv();
  const numbers = await adapter.searchAvailableNumbers({
    country: args.country ?? 'US',
    areaCode: args.areaCode,
    contains: args.contains,
    limit: Math.min(args.limit ?? 20, 50),
    capabilities: args.capabilities,
  });
  return { provider: 'twilio', numbers };
};

export default defineLogicFunction({
  universalIdentifier: '69fa8585-44bf-49e2-97e7-b50295c862fa',
  name: 'search-numbers',
  description:
    'Search the configured provider for available phone numbers matching area code / capability filters. Returns up to 50 candidates.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/numbers/search',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
