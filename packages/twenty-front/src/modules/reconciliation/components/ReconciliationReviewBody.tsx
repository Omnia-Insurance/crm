import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS,
  RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD,
} from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { themeCssVariables } from 'twenty-ui/theme';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { isFetchingMoreRecordsFamilyState } from '@/object-record/states/isFetchingMoreRecordsFamilyState';
import { ReconciliationFilterBar } from '@/reconciliation/components/ReconciliationFilterBar';
import { type ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';
import { ReconciliationRunSummaryBanner } from '@/reconciliation/components/ReconciliationRunSummaryBanner';
import { ReconciliationToolbar } from '@/reconciliation/components/ReconciliationToolbar';
import { ReviewItemDetail } from '@/reconciliation/components/ReviewItemDetail';
import { ReviewItemSidebar } from '@/reconciliation/components/ReviewItemSidebar';
import { BATCH_APPLY_REVIEW_ITEMS } from '@/reconciliation/graphql/mutations/batchApproveReviewItems';
import { useReconciliationActiveFilter } from '@/reconciliation/hooks/useReconciliationActiveFilter';
import {
  getBatchApplyCandidates,
  getBatchUndoCandidates,
} from '@/reconciliation/utils/getBatchActionCandidates';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';

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

// Shared with the server (remediation 2.7) so the toolbar counts and confirm
// dialogs cannot drift from what batch apply actually writes.
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
  const { t } = useLingui();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const { enqueueToast } = useToast();

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

  // BOB files routinely exceed one page: pull every page so the sidebar and the
  // batch scope cover the full item set (remediation 2.4). A failed page halts
  // the loop once, with the truncation warning left visible.
  const [isPaginationHalted, setIsPaginationHalted] = useState(false);

  // Flipped by fetchMoreRecords around each request, so each effect run
  // fetches exactly one page.
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
          enqueueToast({
            status: 'error',
            children: t`Failed to load all review items — the list is incomplete.`,
          });
        }
      } catch {
        setIsPaginationHalted(true);
        enqueueToast({
          status: 'error',
          children: t`Failed to load all review items — the list is incomplete.`,
        });
      }
    })();
  }, [
    hasNextPage,
    reviewItemsLoading,
    isPaginationHalted,
    isFetchingMoreRecords,
    fetchMoreRecords,
    enqueueToast,
    t,
  ]);

  // A truncated list understates the batch scope, so batch actions wait for it.
  const isListTruncated = hasNextPage && !reviewItemsLoading;

  const selectedItem =
    reviewItems.find((item) => item.id === selectedItemId) ??
    reviewItems[0] ??
    null;

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
    // The server's unfiltered path applies to every eligible item, not just
    // the loaded ones, so the count is only honest once all pages are in.
    if (isListTruncated) {
      return;
    }

    const description = hasActiveFilters
      ? t`Apply ${batchApplyCount} pending items in the current filter to CRM?`
      : t`Apply ${batchApplyCount} high-confidence items (confidence >= ${AUTO_MATCH_THRESHOLD}%) to CRM?`;

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
      enqueueToast({ status: 'error', children: t`Batch apply failed.` });
    }
  }, [
    batchApplyMutation,
    objectRecordId,
    batchApplyCandidates,
    batchApplyCount,
    enqueueToast,
    hasActiveFilters,
    isListTruncated,
    refetchReviewItems,
    t,
  ]);

  const handleBatchUndoClick = useCallback(async () => {
    if (isListTruncated) {
      return;
    }

    const description = t`Undo ${batchUndoCount} applied items in the current results?`;

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
      enqueueToast({ status: 'error', children: t`Batch undo failed.` });
    }
  }, [
    batchApplyMutation,
    objectRecordId,
    batchUndoCandidates,
    batchUndoCount,
    enqueueToast,
    isListTruncated,
    refetchReviewItems,
    t,
  ]);

  const loadedReviewItemsCount = reviewItems.length;

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
            ? isDefined(totalCount)
              ? t`Failed to load all review items — showing ${loadedReviewItemsCount} of ${totalCount}. Counts and batch actions are unavailable until the full list loads; reload to retry.`
              : t`Failed to load all review items — showing ${loadedReviewItemsCount}. Counts and batch actions are unavailable until the full list loads; reload to retry.`
            : isDefined(totalCount)
              ? t`Loading all review items (${loadedReviewItemsCount} of ${totalCount} loaded) — batch actions are available once the list is complete.`
              : t`Loading all review items (${loadedReviewItemsCount} loaded) — batch actions are available once the list is complete.`}
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
