// OMNIA-CUSTOM: agent performance rollups recompute cadence.
// Hourly at :30 — offset past the top-of-hour Convoso ingestion pulls so the
// rollup picks up the freshest time-card / call data. Change to a nightly
// pattern (e.g. '0 6 * * *') if hourly churn is unwanted.
export const COMPUTE_AGENT_ROLLUPS_CRON_PATTERN = '30 * * * *';
