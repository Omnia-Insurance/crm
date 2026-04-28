import { useMutation } from '@apollo/client/react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewTypeComponentState } from '@/context-store/states/contextStoreCurrentViewTypeComponentState';
import { ContextStoreViewType } from '@/context-store/types/ContextStoreViewType';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecordGqlOperationFilter } from 'twenty-shared/types';
import type { FilterKey } from '@/reconciliation/types/FilterKey';
import { START_RECONCILIATION_APPLY } from '@/reconciliation/graphql/mutations/startReconciliationApply';
import { BATCH_APPROVE_REVIEW_ITEMS } from '@/reconciliation/graphql/mutations/batchApproveReviewItems';

// Exact same imports as RecordShowPage
import { CommandMenuItemMoreActionsButton } from '@/command-menu-item/server-items/display/components/CommandMenuItemMoreActionsButton';
import { RecordShowCommandMenu } from '@/command-menu-item/components/RecordShowCommandMenu';
import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { TimelineActivityContext } from '@/activities/timeline-activities/contexts/TimelineActivityContext';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { MainContainerLayoutWithSidePanel } from '@/object-record/components/MainContainerLayoutWithSidePanel';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { DraftRelatedViolationsContext } from '@/object-record/record-field/ui/contexts/DraftRelatedViolationsContext';
import { RecordShowContainerContextStoreTargetedRecordsEffect } from '@/object-record/record-show/components/RecordShowContainerContextStoreTargetedRecordsEffect';
import { RecordShowEffect } from '@/object-record/record-show/components/RecordShowEffect';
import { useRecordShowPage } from '@/object-record/record-show/hooks/useRecordShowPage';
import { computeRecordShowComponentInstanceId } from '@/object-record/record-show/utils/computeRecordShowComponentInstanceId';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { RecordShowPageHeader } from '~/pages/object-record/RecordShowPageHeader';
import { RecordShowPageTitle } from '~/pages/object-record/RecordShowPageTitle';
import { PageLayoutType } from '~/generated-metadata/graphql';

import { ReviewItemSidebar } from '@/reconciliation/components/ReviewItemSidebar';
import { ReviewItemDetail } from '@/reconciliation/components/ReviewItemDetail';
import { ReconciliationToolbar } from '@/reconciliation/components/ReconciliationToolbar';
import type { ObjectRecord } from '@/object-record/types/ObjectRecord';

type ReconciliationRecord = ObjectRecord & {
  name: string;
  status: string;
  stats: Record<string, number> | null;
  carrierConfig?: { name: string } | null;
};

export type ReviewItemRecord = ObjectRecord & {
  name: string;
  category: string;
  decision: string;
  flags: string[] | null;
  confidence: number;
  matchMethod: string;
  summary: string;
  matchNotes: string;
  derivedStatus: string;
  currentCrmStatus: string;
  statusChangeReason: string;
  note: string;
  fieldDiffs: unknown[];
  bobRowSnapshot: Record<string, unknown> | null;
  policy?: { id: string; name: string } | null;
};

const StyledSplitLayout = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  height: 100%;
`;

type Props = {
  objectRecordId: string;
};

export const ReconciliationReviewPageContent = ({
  objectRecordId,
}: Props) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemId(id);
  }, []);

  // Use the same hook RecordShowPage uses — handles metadata, icon, etc.
  const { objectNameSingular } = useRecordShowPage(
    'reconciliation',
    objectRecordId,
  );

  // OMNIA-CUSTOM: Set the context store's current object metadata item ID
  // (normally set by MainContextStoreProviderEffect via route params,
  // but our custom route doesn't expose :objectNameSingular as a param)
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'reconciliation',
  });
  const setContextStoreCurrentObjectMetadataItemId = useSetAtomComponentState(
    contextStoreCurrentObjectMetadataItemIdComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const setContextStoreCurrentViewType = useSetAtomComponentState(
    contextStoreCurrentViewTypeComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  useEffect(() => {
    setContextStoreCurrentObjectMetadataItemId(objectMetadataItem.id);
    setContextStoreCurrentViewType(ContextStoreViewType.ShowPage);
    return () => {
      setContextStoreCurrentObjectMetadataItemId(undefined);
      setContextStoreCurrentViewType(null);
    };
  }, [
    objectMetadataItem.id,
    setContextStoreCurrentObjectMetadataItemId,
    setContextStoreCurrentViewType,
  ]);

  const recordShowComponentInstanceId =
    computeRecordShowComponentInstanceId(objectRecordId);

  // Fetch review items
  const reviewItemFilter = useMemo<RecordGqlOperationFilter>(
    () => ({ reconciliationId: { eq: objectRecordId } }),
    [objectRecordId],
  );

  const { records: reviewItems, loading: reviewItemsLoading } =
    useFindManyRecords<ReviewItemRecord>({
      objectNameSingular: 'reviewItem',
      filter: reviewItemFilter,
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

  const counts = useMemo(() => {
    const flagged = reviewItems.filter(
      (i) => i.flags && i.flags.length > 0,
    ).length;
    const unmatched = reviewItems.filter(
      (i) => i.category === 'UNMATCHED',
    ).length;
    const matched = reviewItems.length - unmatched;
    return { all: reviewItems.length, matched, flagged, unmatched };
  }, [reviewItems]);

  const reviewedCount = useMemo(
    () => reviewItems.filter((i) => i.decision !== 'PENDING').length,
    [reviewItems],
  );

  const filteredItems = useMemo(() => {
    let result = reviewItems;

    if (activeFilter === 'matched') {
      result = result.filter((i) => i.category !== 'UNMATCHED');
    } else if (activeFilter === 'flagged') {
      result = result.filter((i) => i.flags && i.flags.length > 0);
    } else if (activeFilter === 'unmatched') {
      result = result.filter((i) => i.category === 'UNMATCHED');
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.policy?.name ?? '').toLowerCase().includes(q),
      );
    }

    return result;
  }, [reviewItems, activeFilter, search]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedItemId) ??
    filteredItems[0] ??
    null;

  // Auto-advance to next unreviewed item after a decision
  const handleDecisionMade = useCallback(
    (decidedItemId: string) => {
      const currentIndex = filteredItems.findIndex(
        (i) => i.id === decidedItemId,
      );
      const nextPending = filteredItems.find(
        (item, idx) => idx > currentIndex && item.decision === 'PENDING',
      );
      const firstPending =
        nextPending ??
        filteredItems.find(
          (item) => item.id !== decidedItemId && item.decision === 'PENDING',
        );
      if (firstPending) {
        setSelectedItemId(firstPending.id);
      }
    },
    [filteredItems],
  );

  // ── Apply + Batch approve mutations ──

  const AUTO_MATCH_THRESHOLD = 85;

  const approvedCount = useMemo(
    () =>
      reviewItems.filter(
        (i) => i.decision === 'APPROVED' && i.category !== 'UNMATCHED',
      ).length,
    [reviewItems],
  );

  const batchApproveCount = useMemo(
    () =>
      reviewItems.filter(
        (i) =>
          i.decision === 'PENDING' &&
          i.category !== 'UNMATCHED' &&
          i.confidence >= AUTO_MATCH_THRESHOLD,
      ).length,
    [reviewItems],
  );

  const [applyMutation, { loading: applyLoading }] = useMutation(
    START_RECONCILIATION_APPLY,
  );
  const [batchApproveMutation, { loading: batchApproveLoading }] = useMutation(
    BATCH_APPROVE_REVIEW_ITEMS,
  );

  const handleApplyClick = useCallback(async () => {
    if (
      !window.confirm(
        `Apply ${approvedCount} approved changes to the CRM? This cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await applyMutation({
        variables: { reconciliationId: objectRecordId },
      });
    } catch (error) {
      console.error('Apply failed:', error);
    }
  }, [applyMutation, objectRecordId, approvedCount]);

  const handleBatchApproveClick = useCallback(async () => {
    if (
      !window.confirm(
        `Accept ${batchApproveCount} high-confidence items (confidence >= ${AUTO_MATCH_THRESHOLD}%)?`,
      )
    ) {
      return;
    }

    try {
      await batchApproveMutation({
        variables: {
          reconciliationId: objectRecordId,
          minConfidence: AUTO_MATCH_THRESHOLD,
        },
      });
    } catch (error) {
      console.error('Batch approve failed:', error);
    }
  }, [batchApproveMutation, objectRecordId, batchApproveCount]);

  // Replicate RecordShowPage structure exactly
  return (
    <DraftRelatedViolationsContext.Provider value={[]}>
      <LayoutRenderingProvider
        value={{
          targetRecordIdentifier: {
            id: objectRecordId,
            targetObjectNameSingular: 'reconciliation',
          },
          layoutType: PageLayoutType.RECORD_PAGE,
          isInSidePanel: false,
        }}
      >
        <RecordComponentInstanceContextsWrapper
          componentInstanceId={recordShowComponentInstanceId}
        >
          <ContextStoreComponentInstanceContext.Provider
            value={{ instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID }}
          >
            <CommandMenuComponentInstanceContext.Provider
              value={{ instanceId: recordShowComponentInstanceId }}
            >
              <PageContainer>
            <RecordShowPageTitle
              objectNameSingular={objectNameSingular}
              objectRecordId={objectRecordId}
            />
            <RecordShowPageHeader
              objectNameSingular={objectNameSingular}
              objectRecordId={objectRecordId}
            >
              <RecordShowCommandMenu />
              <CommandMenuItemMoreActionsButton />
            </RecordShowPageHeader>
            <MainContainerLayoutWithSidePanel>
              <TimelineActivityContext.Provider
                value={{ recordId: objectRecordId }}
              >
                <RecordShowEffect
                  objectNameSingular={objectNameSingular}
                  recordId={objectRecordId}
                />
                <RecordShowContainerContextStoreTargetedRecordsEffect
                  recordId={objectRecordId}
                />
                <ReconciliationToolbar
                  counts={counts}
                  reviewedCount={reviewedCount}
                  totalCount={reviewItems.length}
                  search={search}
                  onSearchChange={setSearch}
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  loading={reviewItemsLoading}
                  approvedCount={approvedCount}
                  onApplyClick={handleApplyClick}
                  applyLoading={applyLoading}
                  batchApproveCount={batchApproveCount}
                  onBatchApproveClick={handleBatchApproveClick}
                  batchApproveLoading={batchApproveLoading}
                />
                <StyledSplitLayout>
                  <ReviewItemSidebar
                    items={filteredItems}
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
              </TimelineActivityContext.Provider>
            </MainContainerLayoutWithSidePanel>
          </PageContainer>
        </CommandMenuComponentInstanceContext.Provider>
      </ContextStoreComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
      </LayoutRenderingProvider>
    </DraftRelatedViolationsContext.Provider>
  );
};
