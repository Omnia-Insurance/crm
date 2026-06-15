/**
 * Default confidence threshold (0–100) above which a reconciliation match is
 * considered auto-match grade. Used by the matching engine's default config
 * (engines/matching.ts autoMatchThreshold) and by the review UI's
 * high-confidence batch-apply scope (ReconciliationReviewBody), which sends
 * it to the server as `minConfidence`.
 *
 * Shared so the toolbar's confirm-dialog count and the server's batch-apply
 * eligibility can never silently diverge (reconciliation remediation
 * item 2.7). Per-carrier configs may still override the engine threshold.
 */
export const RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD = 85;
