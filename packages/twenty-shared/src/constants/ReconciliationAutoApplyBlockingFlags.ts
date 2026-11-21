// Flags that keep a reconciliation item out of every implicit auto-apply path:
// a human must resolve them even at high confidence. Shared by the server batch
// apply and the review UI so their counts cannot diverge;
// RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS mirrors it (parity spec in
// review-item.service.spec.ts).
export const RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS = [
  'REINSTATEMENT',
  'BROKER_EFF_AUDIT',
  'MULTI_MATCH',
  'NAME_MISMATCH',
] as const;

export type ReconciliationAutoApplyBlockingFlag =
  (typeof RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS)[number];
