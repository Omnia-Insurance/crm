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
