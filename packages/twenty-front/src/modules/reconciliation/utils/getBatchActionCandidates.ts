// The caller passes the threshold and blocking flags, which the server mirrors. The counts
// are the true batch scope only once every review item page is loaded (remediation 2.4).
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
