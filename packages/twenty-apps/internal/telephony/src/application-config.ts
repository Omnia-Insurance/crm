import { defineApplication } from 'twenty-sdk/define';

import {
  TELEPHONY_APP_UNIVERSAL_IDENTIFIER,
  TELEPHONY_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const TELEPHONY_ABOUT_DESCRIPTION = [
  'Run outbound and inbound calling from the CRM without making Convoso the source of truth.',
  '',
  '#### What this app provides',
  '',
  'Telephony installs campaign dialing metadata, queue records, dispositions, live call sessions, provider call events, agent presence, inbound queue mapping, and an agent softphone workspace.',
  '',
  '#### Dependency',
  '',
  'Install Brokerage first. Telephony links to Brokerage Leads (`person`), Calls, Agent Profiles, and Lead Sources instead of redefining them.',
  '',
  '#### Provider boundary',
  '',
  'Provider identifiers stay on Telephony Call Sessions and Events. Brokerage Calls remain the final historical call record after completion/disposition.',
  '',
  '#### Compliance',
  '',
  'The server runtime enforces Lead `doNotCall`, lead-local allowed calling windows, routing leases, and blocked-attempt audit events with no agent override in v1.',
].join('\n');

export default defineApplication({
  universalIdentifier: TELEPHONY_APP_UNIVERSAL_IDENTIFIER,
  displayName: 'Telephony',
  description:
    'CRM-owned campaign dialing, softphone sessions, routing, dispositions, and provider call events.',
  aboutDescription: TELEPHONY_ABOUT_DESCRIPTION,
  defaultRoleUniversalIdentifier: TELEPHONY_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  serverVariables: {
    TELEPHONY_PROVIDER: {
      description:
        'Provider adapter key. Defaults to `twilio-compatible` for Twilio/Plivo-style webhook payloads.',
      isSecret: false,
      isRequired: false,
    },
    TELEPHONY_WEBHOOK_PUBLIC_URL: {
      description:
        'Public base URL used when returning provider call instructions and webhook URLs.',
      isSecret: false,
      isRequired: false,
    },
    TELEPHONY_PROVIDER_WEBHOOK_SECRET: {
      description:
        'Shared secret for provider webhook validation when the provider supports one.',
      isSecret: true,
      isRequired: false,
    },
    TELEPHONY_DEFAULT_FROM_NUMBER: {
      description:
        'Fallback outbound caller ID in E.164 format when no campaign/inbound queue number is configured.',
      isSecret: false,
      isRequired: false,
    },
  },
});
