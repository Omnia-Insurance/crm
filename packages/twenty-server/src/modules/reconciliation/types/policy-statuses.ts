/**
 * Shared CRM policy-status sets for the reconciliation pipeline.
 *
 * Single home for the status vocabularies that were previously duplicated
 * across three sites (audit 2026-06-10 §4.4 "De-Ambetter the constants"):
 *   - engines/diff.ts        NEGATIVE_TERMINAL_STATUSES (diff suppression)
 *   - engines/matching.ts    NEGATIVE_TERMINAL_STATUSES_FOR_MATCHING (candidate narrowing)
 *   - types/reconciliation.ts ACTIVE_CRM_STATUSES (missing-from-BOB checks)
 *
 * This file is intentionally import-free: both `types/` and `engines/`
 * consume it, so it must never import from either (no runtime cycles).
 * The old export sites re-export from here for backward compatibility.
 */

/**
 * Statuses that all represent some form of "this policy is over." Moving
 * between them (e.g. PAYMENT_ERROR_CANCELED → CANCELED, DECLINED → CANCELED)
 * doesn't change the underlying outcome and usually strips useful context
 * the legacy CRM carried.
 *
 * Used by: diff suppression (negative-to-negative status changes produce no
 * diff), deriveFlags REINSTATEMENT gating, deriveCategory, and multi-policy-
 * number candidate narrowing in the matching engine.
 */
export const NEGATIVE_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'CANCELED',
  'PAYMENT_ERROR_CANCELED',
  'DECLINED',
  'INCOMPLETE',
]);

/** Non-cancel statuses that should appear in BOB. */
export const ACTIVE_CRM_STATUSES: ReadonlySet<string> = new Set([
  'SUBMITTED',
  'PENDING',
  'ACTIVE_APPROVED',
  'ACTIVE_PLACED',
  'ACTIVE',
  'PAYMENT_ERROR_ACTIVE_APPROVED',
  'PAYMENT_ERROR_ACTIVE_PLACED',
]);

// ---------------------------------------------------------------------------
// Per-carrier status vocabulary (OMN-12 tuning depth — multi-carrier audit
// 2026-06-11 §"Externalize the status vocabulary (terminal/active sets) into
// validated config")
// ---------------------------------------------------------------------------

/**
 * The configurable shape of the status vocabulary: the
 * `carrierConfig.statusVocabulary` knob is validated and merged over
 * `DEFAULT_STATUS_VOCABULARY` by `parseCarrierPipelineConfig`
 * (types/carrier-config.ts). Plain readonly arrays — not Sets — so the
 * resolved config stays JSON-serializable for the per-run config
 * fingerprint (utils/config-fingerprint.util.ts); consumers that need set
 * semantics build a Set once (match.job.ts `loadMatchContext`).
 */
export type StatusVocabulary = {
  /** Statuses meaning "this policy is over" — see NEGATIVE_TERMINAL_STATUSES. */
  negativeTerminalStatuses: readonly string[];
  /** Non-cancel statuses that should appear in BOB — see ACTIVE_CRM_STATUSES.
   *  Consumed by the match job's missing-from-BOB phase (OMN-12): when
   *  matchingConfig.enableMissingFromBob is on, CRM policies in these
   *  statuses that never matched a file row become MISSING_FROM_BOB review
   *  items. Inert (but accepted) while the knob is off. */
  activeStatuses: readonly string[];
};

/** Unset knobs reproduce today's hardcoded sets bit-for-bit. */
export const DEFAULT_STATUS_VOCABULARY: StatusVocabulary = {
  negativeTerminalStatuses: [...NEGATIVE_TERMINAL_STATUSES],
  activeStatuses: [...ACTIVE_CRM_STATUSES],
};

/**
 * Every CRM policy status the reconciliation module knows about: the
 * OmniaStatus union the status engines can emit (a strict subset) plus the
 * default policy-status SELECT vocabulary the CRM ships with. A
 * `statusVocabulary` entry outside this set WARNS but does not fail at the
 * config boundary — workspace admins legitimately add SELECT options
 * (GRACE_PERIOD, DELINQUENT, …) and the whole point of the knob is letting
 * reconciliation reason about them; the warning exists to catch typos.
 */
export const KNOWN_CRM_POLICY_STATUSES: ReadonlySet<string> = new Set([
  ...NEGATIVE_TERMINAL_STATUSES,
  ...ACTIVE_CRM_STATUSES,
]);
