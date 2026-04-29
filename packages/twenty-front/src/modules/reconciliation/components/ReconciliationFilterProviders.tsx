import { useEffect, type PropsWithChildren } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useColumnDefinitionsFromObjectMetadata } from '@/object-metadata/hooks/useColumnDefinitionsFromObjectMetadata';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { useInitViewBar } from '@/views/hooks/useInitViewBar';

type Props = PropsWithChildren<{
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
}>;

const ReconciliationFilterBarInitEffect = ({
  viewBarId,
  reviewItemMetadata,
}: {
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
}) => {
  const { columnDefinitions } =
    useColumnDefinitionsFromObjectMetadata(reviewItemMetadata);

  const { setViewObjectMetadataId, setAvailableFieldDefinitions } =
    useInitViewBar(viewBarId);

  useEffect(() => {
    setViewObjectMetadataId?.(reviewItemMetadata.id);
    setAvailableFieldDefinitions?.(columnDefinitions);
  }, [
    setViewObjectMetadataId,
    setAvailableFieldDefinitions,
    reviewItemMetadata.id,
    columnDefinitions,
  ]);

  return null;
};

/**
 * Mounts the context stack that Twenty's native filter UI expects, scoped to a
 * dedicated `viewBarId` so the reconciliation review page's filter state is
 * isolated from the surrounding reconciliation show page.
 *
 * Children can read filter atoms via `useAtomComponentStateValue(state, viewBarId)`
 * and call `useUpsertRecordFilter` / `useRemoveRecordFilter`.
 */
export const ReconciliationFilterProviders = ({
  viewBarId,
  reviewItemMetadata,
  children,
}: Props) => {
  const derived = useRecordIndexFieldMetadataDerivedStates(
    reviewItemMetadata,
    viewBarId,
  );

  return (
    <RecordComponentInstanceContextsWrapper componentInstanceId={viewBarId}>
      <ViewComponentInstanceContext.Provider value={{ instanceId: viewBarId }}>
        <RecordIndexContextProvider
          value={{
            indexIdentifierUrl: () => '',
            onIndexRecordsLoaded: () => {},
            objectNamePlural: reviewItemMetadata.namePlural,
            objectNameSingular: reviewItemMetadata.nameSingular,
            objectMetadataItem: reviewItemMetadata,
            objectPermissionsByObjectMetadataId: {},
            recordIndexId: viewBarId,
            viewBarInstanceId: viewBarId,
            ...derived,
          }}
        >
          <ReconciliationFilterBarInitEffect
            viewBarId={viewBarId}
            reviewItemMetadata={reviewItemMetadata}
          />
          {children}
        </RecordIndexContextProvider>
      </ViewComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};
