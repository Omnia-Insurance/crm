export const APP_DISPLAY_NAME = 'Telephony';
export const APP_DESCRIPTION =
  'Calls, SMS, voicemail and recording inside Twenty, with pluggable provider routing across Twilio, Vonage and others.';
export const APP_ABOUT_DESCRIPTION = [
  'Bring telephony into Twenty as a first-class part of every record. Click-to-call from any Person or Company, run a browser softphone, ring inbound calls to the assigned owner, and let SMS conversations land on the timeline next to emails and notes.',
  '',
  '**What it adds**',
  '- Click-to-call on every phone field',
  '- Browser softphone (WebRTC) for outbound and inbound',
  '- Calls + SMS as native records, surfaced on Person / Company / Opportunity timelines',
  '- Automatic call recording, transcription and AI summary',
  '- Per-workspace number assignment to team members',
  '',
  '**Provider routing**',
  '- Pluggable provider adapters — Twilio first, Vonage / RingCentral / Aircall as drop-in replacements',
  '- Weighted outbound routing with per-provider circuit breakers and health probes',
  '- Mobile-forward fallback when a provider WebRTC plane is down',
  '',
  '**Privacy and compliance**',
  '- Recording is opt-in per workspace and disclosable per-call',
  '- Provider credentials live in workspace-scoped applicationVariables and never leave the workspace',
].join('\n');

// App + role identifiers
export const APPLICATION_UNIVERSAL_IDENTIFIER =
  '0ffec413-81b8-4a60-99fa-bc52a434794a';
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '91521422-56cc-4647-b490-69e4a6a4d695';

// Twilio applicationVariable identifiers
export const TWILIO_ACCOUNT_SID_UI = '4da46b6f-df13-4dba-aa52-65f7cd12d992';
export const TWILIO_AUTH_TOKEN_UI = '24720f06-71c7-47a5-ad32-aae93bcf12f2';
export const TWILIO_API_KEY_SID_UI = 'eb250fbd-ee61-4f19-81f7-e1c82526e431';
export const TWILIO_API_KEY_SECRET_UI = 'fb383cda-bd63-4b52-a97d-55cf49f1ad0f';
export const TWILIO_TWIML_APP_SID_UI = '164da0cd-e805-438d-ab52-e50c58a00c0a';
export const TWILIO_WEBHOOK_SECRET_UI = '050e6d41-33c7-4b38-8c09-4ecb2d3234b2';

// Vonage applicationVariable identifiers
export const VONAGE_API_KEY_UI = '2d7f6638-d80c-42d7-9e98-e6d50fb4e944';
export const VONAGE_API_SECRET_UI = 'e804b151-4e19-4b24-8d6f-925c37d8e2f7';
export const VONAGE_APPLICATION_ID_UI = '0ad74bdf-855e-426e-97b4-3253913f717b';
export const VONAGE_PRIVATE_KEY_UI = '733fa063-5568-4f2b-a9e6-87b4594b8cce';
export const VONAGE_WEBHOOK_SECRET_UI = '241e989b-4956-4cd3-96b3-390310646d3b';

// Router policy applicationVariable identifiers
export const ROUTER_POLICY_UI = '3154f566-2560-459a-97f5-710df0809862';
export const ROUTER_WEIGHT_TWILIO_UI = '59ddd350-00a2-45d5-905c-3ff24b06af79';
export const ROUTER_WEIGHT_VONAGE_UI = 'a4f57eeb-3acb-4a8d-b6f6-1bd294a0b4b5';
export const ROUTER_BREAKER_ERROR_RATE_UI =
  '2bae02d3-0d75-45f6-af79-4437ec6d7287';
export const ROUTER_BREAKER_WINDOW_SEC_UI =
  '53edb9f6-dc4c-4a51-93a5-1dc0f9b8f242';
export const ROUTER_BREAKER_COOLDOWN_SEC_UI =
  '83234905-c121-48d0-a61e-4cc5d9fa4b02';
export const ROUTER_PROBE_INTERVAL_SEC_UI =
  'f971aa0d-dbd6-4cee-b88b-0b7256bcd55c';

// Feature toggles
export const RECORDING_ENABLED_UI = 'aba32ffc-5fe0-48bc-878e-579899ce63a5';
export const AI_SUMMARY_ENABLED_UI = '31ed8ce1-4ce3-4808-90f1-d2715d5508b5';

// Deployment
export const WEBHOOK_PUBLIC_URL_UI = 'efbc1618-0cd8-4bc6-9450-83bba2767023';
