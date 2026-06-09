import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useCallback, useMemo, useState } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { ReconciliationFilterBar } from '@/reconciliation/components/ReconciliationFilterBar';
import { ReconciliationToolbar } from '@/reconciliation/components/ReconciliationToolbar';
import { type ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';
import { ReviewItemDetail } from '@/reconciliation/components/ReviewItemDetail';
import { ReviewItemSidebar } from '@/reconciliation/components/ReviewItemSidebar';
import { BATCH_APPLY_REVIEW_ITEMS } from '@/reconciliation/graphql/mutations/batchApproveReviewItems';
import { useReconciliationActiveFilter } from '@/reconciliation/hooks/useReconciliationActiveFilter';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

const StyledSplitLayout = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
`;

const AUTO_MATCH_THRESHOLD = 85;
const BATCH_APPLY_BLOCKING_FLAGS = new Set([
  'REINSTATEMENT',
  'BROKER_EFF_AUDIT',
  'MULTI_MATCH',
  'NAME_MISMATCH',
]);

const hasBatchApplyBlockingFlag = (item: ReviewItemRecord) =>
  item.flags?.some((flag) => BATCH_APPLY_BLOCKING_FLAGS.has(flag)) ?? false;

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
  } = useFindManyRecords<ReviewItemRecord>({
    objectNameSingular: 'reviewItem',
    filter,
    orderBy: [{ confidence: 'DescNullsLast' }],
    limit: 1000,
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

  const batchApplyCandidates = useMemo(
    () =>
      reviewItems.filter(
        (i) =>
          i.decision === 'PENDING' &&
          i.category !== 'UNMATCHED' &&
          (hasActiveFilters ||
            (i.confidence >= AUTO_MATCH_THRESHOLD &&
              !hasBatchApplyBlockingFlag(i))),
      ),
    [reviewItems, hasActiveFilters],
  );

  const batchUndoCandidates = useMemo(
    () =>
      reviewItems.filter(
        (i) => i.decision === 'APPROVED' && i.category !== 'UNMATCHED',
      ),
    [reviewItems],
  );

  const batchApplyCount = batchApplyCandidates.length;
  const batchUndoCount = batchUndoCandidates.length;

  const [batchApplyMutation, { loading: batchApplyLoading }] = useMutation(
    BATCH_APPLY_REVIEW_ITEMS,
  );

  const handleBatchApplyClick = useCallback(async () => {
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
    refetchReviewItems,
  ]);

  const handleBatchUndoClick = useCallback(async () => {
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
    refetchReviewItems,
  ]);

  return (
    <>
      <ReconciliationToolbar
        batchApplyCount={batchApplyCount}
        onBatchApplyClick={handleBatchApplyClick}
        batchUndoCount={batchUndoCount}
        onBatchUndoClick={handleBatchUndoClick}
        batchActionLoading={batchApplyLoading}
        filterBar={<ReconciliationFilterBar viewBarId={viewBarId} />}
      />
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
