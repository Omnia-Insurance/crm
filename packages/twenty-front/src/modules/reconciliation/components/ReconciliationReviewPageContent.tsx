import { styled } from '@linaria/react';

import { RecordShowCommandMenu } from '@/command-menu-item/components/RecordShowCommandMenu';
import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { RecordShowContainerContextStoreTargetedRecordsEffect } from '@/object-record/record-show/components/RecordShowContainerContextStoreTargetedRecordsEffect';
import { RecordShowPageResourceEffect } from '@/object-record/record-show/components/RecordShowPageResourceEffect';
import { useRecordShowPageResource } from '@/object-record/record-show/hooks/useRecordShowPageResource';
import { computeRecordShowComponentInstanceId } from '@/object-record/record-show/utils/computeRecordShowComponentInstanceId';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { ReconciliationFilterProviders } from '@/reconciliation/components/ReconciliationFilterProviders';
import { ReconciliationReviewBody } from '@/reconciliation/components/ReconciliationReviewBody';
import { SidePanelToggleButton } from '@/side-panel/components/SidePanelToggleButton';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { RecordShowPageHeader } from '~/pages/object-record/RecordShowPageHeader';
import { RecordShowPageTitle } from '~/pages/object-record/RecordShowPageTitle';

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
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

type ReconciliationReviewPageContentProps = {
  objectRecordId: string;
  reviewItemMetadataItem: EnrichedObjectMetadataItem;
};

// The record show page chrome around the review body: the route context store
// already reports a reconciliation record page, so pinned commands show.
export const ReconciliationReviewPageContent = ({
  objectRecordId,
  reviewItemMetadataItem,
}: ReconciliationReviewPageContentProps) => {
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );

  const { loading, record } = useRecordShowPageResource({
    objectNameSingular: 'reconciliation',
    recordId: objectRecordId,
  });

  const recordShowComponentInstanceId =
    computeRecordShowComponentInstanceId(objectRecordId);

  const viewBarId = `reconciliation-review-${objectRecordId}`;

  return (
    <RecordComponentInstanceContextsWrapper
      componentInstanceId={recordShowComponentInstanceId}
    >
      <CommandMenuComponentInstanceContext.Provider
        value={{ instanceId: recordShowComponentInstanceId }}
      >
        <RecordShowPageResourceEffect
          loading={loading}
          record={record}
          recordId={objectRecordId}
        />
        <RecordShowContainerContextStoreTargetedRecordsEffect
          recordId={objectRecordId}
        />
        <RecordShowPageTitle
          objectNameSingular="reconciliation"
          objectRecordId={objectRecordId}
        />
        <PageCardLayout
          header={
            <RecordShowPageHeader
              objectNameSingular="reconciliation"
              objectRecordId={objectRecordId}
            >
              <RecordShowCommandMenu />
              {!isLayoutCustomizationModeEnabled && <SidePanelToggleButton />}
            </RecordShowPageHeader>
          }
        >
          <ReconciliationFilterProviders
            viewBarId={viewBarId}
            reviewItemMetadata={reviewItemMetadataItem}
          >
            <StyledPageBody>
              <ReconciliationReviewBody
                objectRecordId={objectRecordId}
                viewBarId={viewBarId}
                reviewItemMetadata={reviewItemMetadataItem}
              />
            </StyledPageBody>
          </ReconciliationFilterProviders>
        </PageCardLayout>
      </CommandMenuComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};
