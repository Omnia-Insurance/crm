import { type PropsWithChildren } from 'react';
import { StandardObjectNameSingular } from 'twenty-shared/types';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';

type ReviewItemCommentsFilterProvidersProps = PropsWithChildren<{
  viewBarId: string;
}>;

// Scopes the native filter UI to the comments panel and binds it to Task
// fields, so filters resolve against tasks rather than review items.
export const ReviewItemCommentsFilterProviders = ({
  viewBarId,
  children,
}: ReviewItemCommentsFilterProvidersProps) => {
  const { objectMetadataItem: taskObjectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: StandardObjectNameSingular.Task,
  });

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const recordIndexFieldMetadataDerivedStates =
    useRecordIndexFieldMetadataDerivedStates(taskObjectMetadataItem, viewBarId);

  return (
    <RecordComponentInstanceContextsWrapper componentInstanceId={viewBarId}>
      <ViewComponentInstanceContext.Provider value={{ instanceId: viewBarId }}>
        <RecordIndexContextProvider
          value={{
            indexIdentifierUrl: () => '',
            onIndexRecordsLoaded: () => {},
            objectNamePlural: taskObjectMetadataItem.namePlural,
            objectNameSingular: taskObjectMetadataItem.nameSingular,
            objectMetadataItem: taskObjectMetadataItem,
            objectPermissionsByObjectMetadataId,
            recordIndexId: viewBarId,
            viewBarInstanceId: viewBarId,
            ...recordIndexFieldMetadataDerivedStates,
          }}
        >
          {children}
        </RecordIndexContextProvider>
      </ViewComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};
