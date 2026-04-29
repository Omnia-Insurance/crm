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
import { BATCH_APPROVE_REVIEW_ITEMS } from '@/reconciliation/graphql/mutations/batchApproveReviewItems';
import { useReconciliationActiveFilter } from '@/reconciliation/hooks/useReconciliationActiveFilter';

const StyledSplitLayout = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  height: 100%;
  min-height: 0;
`;

const AUTO_MATCH_THRESHOLD = 85;

type Props = {
  objectRecordId: string;
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
};

export const ReconciliationReviewBody = ({
  objectRecordId,
  viewBarId,
  reviewItemMetadata,
}: Props) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemId(id);
  }, []);

  const { filter, hasActiveFilters } = useReconciliationActiveFilter({
    viewBarId,
    reconciliationId: objectRecordId,
    reviewItemMetadata,
  });

  const { records: reviewItems, loading: reviewItemsLoading } =
    useFindManyRecords<ReviewItemRecord>({
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

  const reviewedCount = useMemo(
    () => reviewItems.filter((i) => i.decision !== 'PENDING').length,
    [reviewItems],
  );

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
    },
    [reviewItems],
  );

  // ── Batch approve mutation ──

  const batchApproveCandidates = useMemo(
    () =>
      reviewItems.filter(
        (i) =>
          i.decision === 'PENDING' &&
          i.category !== 'UNMATCHED' &&
          (hasActiveFilters || i.confidence >= AUTO_MATCH_THRESHOLD),
      ),
    [reviewItems, hasActiveFilters],
  );

  const batchApproveCount = batchApproveCandidates.length;

  const [batchApproveMutation, { loading: batchApproveLoading }] = useMutation(
    BATCH_APPROVE_REVIEW_ITEMS,
  );

  const handleBatchApproveClick = useCallback(async () => {
    const description = hasActiveFilters
      ? `Accept ${batchApproveCount} pending items in the current filter?`
      : `Accept ${batchApproveCount} high-confidence items (confidence >= ${AUTO_MATCH_THRESHOLD}%)?`;

    if (!window.confirm(description)) {
      return;
    }

    try {
      await batchApproveMutation({
        variables: hasActiveFilters
          ? {
              reconciliationId: objectRecordId,
              reviewItemIds: batchApproveCandidates.map((i) => i.id),
            }
          : {
              reconciliationId: objectRecordId,
              minConfidence: AUTO_MATCH_THRESHOLD,
            },
      });
    } catch (error) {
      console.error('Batch approve failed:', error);
    }
  }, [
    batchApproveMutation,
    objectRecordId,
    batchApproveCandidates,
    batchApproveCount,
    hasActiveFilters,
  ]);

  return (
    <>
      <ReconciliationToolbar
        reviewedCount={reviewedCount}
        totalCount={reviewItems.length}
        loading={reviewItemsLoading}
        batchApproveCount={batchApproveCount}
        onBatchApproveClick={handleBatchApproveClick}
        batchApproveLoading={batchApproveLoading}
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
