import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useColumnDefinitionsFromObjectMetadata } from '@/object-metadata/hooks/useColumnDefinitionsFromObjectMetadata';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { useInitViewBar } from '@/views/hooks/useInitViewBar';
import { type PropsWithChildren, useEffect } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';

type Props = PropsWithChildren<{
  viewBarId: string;
}>;

const InitEffect = ({ viewBarId }: { viewBarId: string }) => {
  const { objectMetadataItem: taskMetadata } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Task,
  });

  const { columnDefinitions } =
    useColumnDefinitionsFromObjectMetadata(taskMetadata);

  const { setViewObjectMetadataId, setAvailableFieldDefinitions } =
    useInitViewBar(viewBarId);

  useEffect(() => {
    setViewObjectMetadataId?.(taskMetadata.id);
    setAvailableFieldDefinitions?.(columnDefinitions);
  }, [
    setViewObjectMetadataId,
    setAvailableFieldDefinitions,
    taskMetadata.id,
    columnDefinitions,
  ]);

  return null;
};

/**
 * Mounts the context stack Twenty's native filter UI expects, scoped to a
 * dedicated `viewBarId` and bound to the Task object metadata. Used by the
 * comments rail on the reconciliation review page so filters built with
 * <ViewBarFilterDropdown /> resolve task fields (assignee, status, dueAt,
 * createdAt) — not reviewItem fields.
 */
export const ReviewItemCommentsFilterProviders = ({
  viewBarId,
  children,
}: Props) => {
  const { objectMetadataItem: taskMetadata } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Task,
  });

  const derived = useRecordIndexFieldMetadataDerivedStates(
    taskMetadata,
    viewBarId,
  );

  return (
    <RecordComponentInstanceContextsWrapper componentInstanceId={viewBarId}>
      <ViewComponentInstanceContext.Provider value={{ instanceId: viewBarId }}>
        <RecordIndexContextProvider
          value={{
            indexIdentifierUrl: () => '',
            onIndexRecordsLoaded: () => {},
            objectNamePlural: taskMetadata.namePlural,
            objectNameSingular: taskMetadata.nameSingular,
            objectMetadataItem: taskMetadata,
            objectPermissionsByObjectMetadataId: {},
            recordIndexId: viewBarId,
            viewBarInstanceId: viewBarId,
            ...derived,
          }}
        >
          <InitEffect viewBarId={viewBarId} />
          {children}
        </RecordIndexContextProvider>
      </ViewComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};
