import { defineApplication } from 'twenty-sdk/define';

import {
  AI_SUMMARY_ENABLED_UI,
  APP_ABOUT_DESCRIPTION,
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  RECORDING_ENABLED_UI,
  WEBHOOK_PUBLIC_URL_UI,
  ROUTER_BREAKER_COOLDOWN_SEC_UI,
  ROUTER_BREAKER_ERROR_RATE_UI,
  ROUTER_BREAKER_WINDOW_SEC_UI,
  ROUTER_POLICY_UI,
  ROUTER_PROBE_INTERVAL_SEC_UI,
  ROUTER_WEIGHT_TWILIO_UI,
  ROUTER_WEIGHT_VONAGE_UI,
  TWILIO_ACCOUNT_SID_UI,
  TWILIO_API_KEY_SECRET_UI,
  TWILIO_API_KEY_SID_UI,
  TWILIO_AUTH_TOKEN_UI,
  TWILIO_TWIML_APP_SID_UI,
  TWILIO_WEBHOOK_SECRET_UI,
  VONAGE_API_KEY_UI,
  VONAGE_API_SECRET_UI,
  VONAGE_APPLICATION_ID_UI,
  VONAGE_PRIVATE_KEY_UI,
  VONAGE_WEBHOOK_SECRET_UI,
} from 'src/modules/shared/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  aboutDescription: APP_ABOUT_DESCRIPTION,
  icon: 'IconPhone',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  applicationVariables: {
    // ── Provider router ────────────────────────────────────────────────
    ROUTER_POLICY: {
      universalIdentifier: ROUTER_POLICY_UI,
      description:
        'Outbound routing policy. `weighted` (default) picks a provider via ROUTER_WEIGHT_*, `priority` always picks the highest-weight healthy provider, `cost` picks the cheapest healthy provider per destination. Inbound is always single-provider.',
      isSecret: false,
    },
    ROUTER_WEIGHT_TWILIO: {
      universalIdentifier: ROUTER_WEIGHT_TWILIO_UI,
      description:
        'Outbound weight for Twilio (integer 0–100). Set to 0 to disable Twilio for outbound while keeping it as the inbound carrier.',
      isSecret: false,
    },
    ROUTER_WEIGHT_VONAGE: {
      universalIdentifier: ROUTER_WEIGHT_VONAGE_UI,
      description:
        'Outbound weight for Vonage (integer 0–100). Combined with the other ROUTER_WEIGHT_* values to drive weighted-random selection.',
      isSecret: false,
    },
    ROUTER_BREAKER_ERROR_RATE: {
      universalIdentifier: ROUTER_BREAKER_ERROR_RATE_UI,
      description:
        'Trip a provider circuit breaker when its error rate over the last ROUTER_BREAKER_WINDOW_SEC exceeds this fraction (e.g. `0.25` for 25%). Default: 0.25.',
      isSecret: false,
    },
    ROUTER_BREAKER_WINDOW_SEC: {
      universalIdentifier: ROUTER_BREAKER_WINDOW_SEC_UI,
      description:
        'Rolling window in seconds used to compute provider error rate. Default: 60.',
      isSecret: false,
    },
    ROUTER_BREAKER_COOLDOWN_SEC: {
      universalIdentifier: ROUTER_BREAKER_COOLDOWN_SEC_UI,
      description:
        'Time a tripped breaker stays open before going half-open and probing. Default: 120.',
      isSecret: false,
    },
    ROUTER_PROBE_INTERVAL_SEC: {
      universalIdentifier: ROUTER_PROBE_INTERVAL_SEC_UI,
      description:
        'How often background health probes call each provider. Default: 30.',
      isSecret: false,
    },

    // ── Twilio ─────────────────────────────────────────────────────────
    TWILIO_ACCOUNT_SID: {
      universalIdentifier: TWILIO_ACCOUNT_SID_UI,
      description: 'Twilio Account SID (starts with `AC…`).',
      isSecret: false,
    },
    TWILIO_AUTH_TOKEN: {
      universalIdentifier: TWILIO_AUTH_TOKEN_UI,
      description:
        'Twilio Auth Token. Used for REST calls when no API Key is configured, and for X-Twilio-Signature verification on inbound webhooks.',
      isSecret: true,
    },
    TWILIO_API_KEY_SID: {
      universalIdentifier: TWILIO_API_KEY_SID_UI,
      description:
        'Twilio API Key SID (starts with `SK…`). Required to mint short-lived AccessTokens for the Voice JS SDK in the browser softphone.',
      isSecret: false,
    },
    TWILIO_API_KEY_SECRET: {
      universalIdentifier: TWILIO_API_KEY_SECRET_UI,
      description: 'Twilio API Key secret matching TWILIO_API_KEY_SID.',
      isSecret: true,
    },
    TWILIO_TWIML_APP_SID: {
      universalIdentifier: TWILIO_TWIML_APP_SID_UI,
      description:
        'Twilio TwiML App SID (`AP…`) whose Voice URL points at this app\'s `/twilio/twiml` route.',
      isSecret: false,
    },
    TWILIO_WEBHOOK_SECRET: {
      universalIdentifier: TWILIO_WEBHOOK_SECRET_UI,
      description:
        'Shared secret for verifying X-Twilio-Signature on inbound webhooks. When unset, signature verification is skipped (use only in dev/test).',
      isSecret: true,
    },

    // ── Vonage ─────────────────────────────────────────────────────────
    VONAGE_API_KEY: {
      universalIdentifier: VONAGE_API_KEY_UI,
      description: 'Vonage API key.',
      isSecret: false,
    },
    VONAGE_API_SECRET: {
      universalIdentifier: VONAGE_API_SECRET_UI,
      description: 'Vonage API secret.',
      isSecret: true,
    },
    VONAGE_APPLICATION_ID: {
      universalIdentifier: VONAGE_APPLICATION_ID_UI,
      description: 'Vonage Application UUID for Voice / Messages API.',
      isSecret: false,
    },
    VONAGE_PRIVATE_KEY: {
      universalIdentifier: VONAGE_PRIVATE_KEY_UI,
      description:
        'Vonage application private key (PEM). Used to sign JWTs for the Voice and Messages APIs.',
      isSecret: true,
    },
    VONAGE_WEBHOOK_SECRET: {
      universalIdentifier: VONAGE_WEBHOOK_SECRET_UI,
      description:
        'Shared signature secret for verifying inbound Vonage webhooks. When unset, signature verification is skipped (use only in dev/test).',
      isSecret: true,
    },

    // ── Feature toggles ────────────────────────────────────────────────
    RECORDING_ENABLED: {
      universalIdentifier: RECORDING_ENABLED_UI,
      description:
        'When `true`, outbound and inbound calls are recorded by the provider and stored on the Call record. Disclosure prompts are the operator\'s responsibility.',
      isSecret: false,
    },
    AI_SUMMARY_ENABLED: {
      universalIdentifier: AI_SUMMARY_ENABLED_UI,
      description:
        'When `true`, completed call recordings trigger transcription and an AI-generated summary written to the Call record.',
      isSecret: false,
    },

    // ── Deployment ─────────────────────────────────────────────────────
    WEBHOOK_PUBLIC_URL: {
      universalIdentifier: WEBHOOK_PUBLIC_URL_UI,
      description:
        'Public base URL where this app\'s logic-function routes are reachable from the public internet (e.g. `https://crm.example.com/api/app-logic/<appId>`). Used as the StatusCallback / TwiML URL for Twilio and as the canonical URL for `X-Twilio-Signature` verification. Required for outbound calls and for inbound webhook signature validation.',
      isSecret: false,
    },
  },
});
