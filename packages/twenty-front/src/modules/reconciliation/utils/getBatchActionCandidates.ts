/**
 * Pure batch-candidate selection for the reconciliation review toolbar.
 *
 * Extracted from ReconciliationReviewBody so the eligibility rules are unit
 * testable. The caller passes the threshold/blocking-flag policy in (the
 * constants stay in ReconciliationReviewBody next to the mutation that
 * relies on the server-side mirror of the same policy).
 *
 * These counts are only the *true* batch scope when the caller has loaded
 * every review item page (see the pagination catch-up loop in
 * ReconciliationReviewBody — reconciliation remediation item 2.4).
 */
export type BatchCandidateReviewItem = {
  id: string;
  decision: string;
  category: string;
  confidence: number;
  flags: string[] | null;
};

export const getBatchApplyCandidates = <T extends BatchCandidateReviewItem>(
  items: T[],
  {
    hasActiveFilters,
    autoMatchThreshold,
    blockingFlags,
  }: {
    hasActiveFilters: boolean;
    autoMatchThreshold: number;
    blockingFlags: ReadonlySet<string>;
  },
): T[] =>
  items.filter(
    (item) =>
      item.decision === 'PENDING' &&
      item.category !== 'UNMATCHED' &&
      (hasActiveFilters ||
        (item.confidence >= autoMatchThreshold &&
          !(item.flags?.some((flag) => blockingFlags.has(flag)) ?? false))),
  );

export const getBatchUndoCandidates = <T extends BatchCandidateReviewItem>(
  items: T[],
): T[] =>
  items.filter(
    (item) => item.decision === 'APPROVED' && item.category !== 'UNMATCHED',
  );
