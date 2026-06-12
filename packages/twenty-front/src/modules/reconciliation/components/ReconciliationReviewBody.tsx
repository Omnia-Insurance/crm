import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { isFetchingMoreRecordsFamilyState } from '@/object-record/states/isFetchingMoreRecordsFamilyState';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { ReconciliationFilterBar } from '@/reconciliation/components/ReconciliationFilterBar';
import { ReconciliationRunSummaryBanner } from '@/reconciliation/components/ReconciliationRunSummaryBanner';
import { ReconciliationToolbar } from '@/reconciliation/components/ReconciliationToolbar';
import { type ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';
import { ReviewItemDetail } from '@/reconciliation/components/ReviewItemDetail';
import { ReviewItemSidebar } from '@/reconciliation/components/ReviewItemSidebar';
import { BATCH_APPLY_REVIEW_ITEMS } from '@/reconciliation/graphql/mutations/batchApproveReviewItems';
import { useReconciliationActiveFilter } from '@/reconciliation/hooks/useReconciliationActiveFilter';
import {
  getBatchApplyCandidates,
  getBatchUndoCandidates,
} from '@/reconciliation/utils/getBatchActionCandidates';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import {
  RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS,
  RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD,
} from 'twenty-shared/constants';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledSplitLayout = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
`;

const StyledTruncationWarning = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const REVIEW_ITEMS_PAGE_SIZE = 1000;

// Batch-apply policy constants shared with the server (remediation 2.7):
// ReviewItemService.BATCH_APPROVE_BLOCKING_FLAGS and the matching engine's
// default autoMatchThreshold import the same twenty-shared values, so the
// toolbar counts and confirm dialogs cannot silently diverge from what the
// server actually applies.
const AUTO_MATCH_THRESHOLD = RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD;
const BATCH_APPLY_BLOCKING_FLAGS: ReadonlySet<string> = new Set(
  RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS,
);

type ReconciliationReviewBodyProps = {
  objectRecordId: string;
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
};

export const ReconciliationReviewBody = ({
  objectRecordId,
  viewBarId,
  reviewItemMetadata,
}: ReconciliationReviewBodyProps) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const { enqueueErrorSnackBar } = useSnackBar();

  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemId(id);
  }, []);

  const { filter, hasActiveFilters } = useReconciliationActiveFilter({
    viewBarId,
    reconciliationId: objectRecordId,
    reviewItemMetadata,
  });

  const {
    records: reviewItems,
    loading: reviewItemsLoading,
    refetch: refetchReviewItems,
    fetchMoreRecords,
    hasNextPage,
    totalCount,
    queryIdentifier,
  } = useFindManyRecords<ReviewItemRecord>({
    objectNameSingular: 'reviewItem',
    filter,
    orderBy: [{ confidence: 'DescNullsLast' }],
    limit: REVIEW_ITEMS_PAGE_SIZE,
    recordGqlFields: {
      id: true,
      name: true,
      category: true,
      decision: true,
      flags: true,
      flagReasons: true,
      confidence: true,
      matchMethod: true,
      summary: true,
      matchNotes: true,
      derivedStatus: true,
      currentCrmStatus: true,
      statusChangeReason: true,
      note: true,
      fieldDiffs: true,
      bobRowSnapshot: true,
      policy: { id: true, name: true },
    },
  });

  // ── Pagination catch-up ──
  // useFindManyRecords only returns the first page; BOB files routinely
  // exceed REVIEW_ITEMS_PAGE_SIZE rows. Keep pulling pages until
  // hasNextPage is false so the sidebar and the batch-candidate scope
  // cover the full item set (reconciliation remediation item 2.4). A page
  // failure surfaces once and halts the loop — no infinite retry; the
  // truncation warning below stays visible in that case.
  const [isPaginationHalted, setIsPaginationHalted] = useState(false);

  // Reactive in-flight guard: fetchMoreRecords flips this family state
  // around each page request, re-arming this effect when the page lands —
  // so each effect run fetches exactly one page and the loop is driven by
  // state transitions (hasNextPage / isFetchingMoreRecords), not by a ref.
  const isFetchingMoreRecords = useAtomFamilyStateValue(
    isFetchingMoreRecordsFamilyState,
    queryIdentifier,
  );

  useEffect(() => {
    if (
      !hasNextPage ||
      reviewItemsLoading ||
      isPaginationHalted ||
      isFetchingMoreRecords
    ) {
      return;
    }

    void (async () => {
      try {
        const result = await fetchMoreRecords();

        if (result !== undefined && 'error' in result) {
          setIsPaginationHalted(true);
          enqueueErrorSnackBar({
            message:
              'Failed to load all review items — the list is incomplete.',
          });
        }
      } catch {
        setIsPaginationHalted(true);
        enqueueErrorSnackBar({
          message: 'Failed to load all review items — the list is incomplete.',
        });
      }
    })();
  }, [
    hasNextPage,
    reviewItemsLoading,
    isPaginationHalted,
    isFetchingMoreRecords,
    fetchMoreRecords,
    enqueueErrorSnackBar,
  ]);

  // While truncated, client-side batch counts understate the real scope —
  // warn and keep the batch buttons disabled until the list is complete.
  const isListTruncated = hasNextPage && !reviewItemsLoading;

  const selectedItem =
    reviewItems.find((item) => item.id === selectedItemId) ??
    reviewItems[0] ??
    null;

  // Auto-advance to next unreviewed item after a decision
  const handleDecisionMade = useCallback(
    (decidedItemId: string) => {
      const currentIndex = reviewItems.findIndex((i) => i.id === decidedItemId);
      const nextPending = reviewItems.find(
        (item, idx) => idx > currentIndex && item.decision === 'PENDING',
      );
      const firstPending =
        nextPending ??
        reviewItems.find(
          (item) => item.id !== decidedItemId && item.decision === 'PENDING',
        );
      if (firstPending) {
        setSelectedItemId(firstPending.id);
      }
      void refetchReviewItems();
    },
    [reviewItems, refetchReviewItems],
  );

  // ── Batch apply / undo mutation ──
  // Candidates are computed from the full (catch-up-paginated) list, so the
  // confirm-dialog counts match the true batch scope. Batch actions stay
  // disabled while the list is known-truncated (see isListTruncated).

  const batchApplyCandidates = useMemo(
    () =>
      getBatchApplyCandidates(reviewItems, {
        hasActiveFilters,
        autoMatchThreshold: AUTO_MATCH_THRESHOLD,
        blockingFlags: BATCH_APPLY_BLOCKING_FLAGS,
      }),
    [reviewItems, hasActiveFilters],
  );

  const batchUndoCandidates = useMemo(
    () => getBatchUndoCandidates(reviewItems),
    [reviewItems],
  );

  const batchApplyCount = batchApplyCandidates.length;
  const batchUndoCount = batchUndoCandidates.length;

  const [batchApplyMutation, { loading: batchApplyLoading }] = useMutation(
    BATCH_APPLY_REVIEW_ITEMS,
  );

  const handleBatchApplyClick = useCallback(async () => {
    // The confirm-dialog count is only honest once every page is loaded —
    // the server's unfiltered path applies to ALL eligible items, not just
    // the loaded ones.
    if (isListTruncated) {
      return;
    }

    const description = hasActiveFilters
      ? `Apply ${batchApplyCount} pending items in the current filter to CRM?`
      : `Apply ${batchApplyCount} high-confidence items (confidence >= ${AUTO_MATCH_THRESHOLD}%) to CRM?`;

    if (!window.confirm(description)) {
      return;
    }

    try {
      await batchApplyMutation({
        variables: hasActiveFilters
          ? {
              reconciliationId: objectRecordId,
              action: 'APPLY',
              reviewItemIds: batchApplyCandidates.map((i) => i.id),
            }
          : {
              reconciliationId: objectRecordId,
              action: 'APPLY',
              minConfidence: AUTO_MATCH_THRESHOLD,
            },
      });
      await refetchReviewItems();
    } catch {
      enqueueErrorSnackBar({ message: 'Batch apply failed.' });
    }
  }, [
    batchApplyMutation,
    objectRecordId,
    batchApplyCandidates,
    batchApplyCount,
    enqueueErrorSnackBar,
    hasActiveFilters,
    isListTruncated,
    refetchReviewItems,
  ]);

  const handleBatchUndoClick = useCallback(async () => {
    if (isListTruncated) {
      return;
    }

    const description = `Undo ${batchUndoCount} applied items in the current results?`;

    if (!window.confirm(description)) {
      return;
    }

    try {
      await batchApplyMutation({
        variables: {
          reconciliationId: objectRecordId,
          action: 'UNDO',
          reviewItemIds: batchUndoCandidates.map((i) => i.id),
        },
      });
      await refetchReviewItems();
    } catch {
      enqueueErrorSnackBar({ message: 'Batch undo failed.' });
    }
  }, [
    batchApplyMutation,
    objectRecordId,
    batchUndoCandidates,
    batchUndoCount,
    enqueueErrorSnackBar,
    isListTruncated,
    refetchReviewItems,
  ]);

  return (
    <>
      <ReconciliationRunSummaryBanner reconciliationId={objectRecordId} />
      <ReconciliationToolbar
        batchApplyCount={batchApplyCount}
        onBatchApplyClick={handleBatchApplyClick}
        batchUndoCount={batchUndoCount}
        onBatchUndoClick={handleBatchUndoClick}
        batchActionLoading={batchApplyLoading || isListTruncated}
        filterBar={<ReconciliationFilterBar viewBarId={viewBarId} />}
      />
      {isListTruncated && (
        <StyledTruncationWarning>
          {isPaginationHalted
            ? `Failed to load all review items — showing ${reviewItems.length}` +
              (totalCount !== undefined ? ` of ${totalCount}` : '') +
              '. Counts and batch actions are unavailable until the full list loads; reload to retry.'
            : `Loading all review items (${reviewItems.length}` +
              (totalCount !== undefined ? ` of ${totalCount}` : '') +
              ' loaded) — batch actions are available once the list is complete.'}
        </StyledTruncationWarning>
      )}
      <StyledSplitLayout>
        <ReviewItemSidebar
          items={reviewItems}
          selectedItemId={selectedItem?.id ?? null}
          onSelectItem={handleSelectItem}
          loading={reviewItemsLoading}
        />
        <ReviewItemDetail
          item={selectedItem}
          reconciliationId={objectRecordId}
          onDecisionMade={handleDecisionMade}
        />
      </StyledSplitLayout>
    </>
  );
};
