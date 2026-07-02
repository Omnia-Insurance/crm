// OMNIA-CUSTOM: prompts/responses contain PHI (HIPAA) — never record content,
// only timing/token spans. Upstream defaults both to true.
export const AI_TELEMETRY_CONFIG = {
  isEnabled: true,
  recordInputs: false,
  recordOutputs: false,
};
