import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewTypeComponentState } from '@/context-store/states/contextStoreCurrentViewTypeComponentState';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { styled } from '@linaria/react';
import { useEffect, useMemo } from 'react';

// Exact same imports as RecordShowPage
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

import { ReconciliationFilterProviders } from '@/reconciliation/components/ReconciliationFilterProviders';
import { ReconciliationReviewBody } from '@/reconciliation/components/ReconciliationReviewBody';
import type { ObjectRecord } from '@/object-record/types/ObjectRecord';

export type ReviewItemRecord = ObjectRecord & {
  name: string;
  category: string;
  decision: string;
  flags: string[] | null;
  flagReasons: Record<string, string> | null;
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

const StyledPageBody = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

type Props = {
  objectRecordId: string;
};

export const ReconciliationReviewPageContent = ({ objectRecordId }: Props) => {
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
  const { objectMetadataItem: reviewItemMetadata } = useObjectMetadataItem({
    objectNameSingular: 'reviewItem',
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
    setContextStoreCurrentViewType(null);
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

  const viewBarId = useMemo(
    () => `reconciliation-review-${objectRecordId}`,
    [objectRecordId],
  );

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
                    <ReconciliationFilterProviders
                      viewBarId={viewBarId}
                      reviewItemMetadata={reviewItemMetadata}
                    >
                      <StyledPageBody>
                        <ReconciliationReviewBody
                          objectRecordId={objectRecordId}
                          viewBarId={viewBarId}
                          reviewItemMetadata={reviewItemMetadata}
                        />
                      </StyledPageBody>
                    </ReconciliationFilterProviders>
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
