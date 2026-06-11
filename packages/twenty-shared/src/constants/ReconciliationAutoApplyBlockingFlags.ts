/**
 * Review-item flags that disqualify a reconciliation item from any implicit
 * auto-apply path (high-confidence batch approve, learned-rule auto-apply).
 * They mark ambiguity a human should resolve even when raw confidence is
 * high — a renewal-vs-reinstatement, an audit-eligible cancel, or a
 * tie-broken multi-match would all be high-impact mistakes to auto-apply.
 *
 * Single source of truth shared by the server batch-apply policy
 * (ReviewItemService.BATCH_APPROVE_BLOCKING_FLAGS) and the review UI's
 * batch-candidate selection (ReconciliationReviewBody), so the toolbar
 * counts can never silently diverge from what the server actually applies
 * (reconciliation remediation item 2.7).
 *
 * NOTE: ReconciliationDecisionRuleService.RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS
 * mirrors this list; a parity test in review-item.service.spec.ts pins the
 * two together.
 */
export const RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS = [
  'REINSTATEMENT',
  'BROKER_EFF_AUDIT',
  'MULTI_MATCH',
  'NAME_MISMATCH',
] as const;

export type ReconciliationAutoApplyBlockingFlag =
  (typeof RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS)[number];
