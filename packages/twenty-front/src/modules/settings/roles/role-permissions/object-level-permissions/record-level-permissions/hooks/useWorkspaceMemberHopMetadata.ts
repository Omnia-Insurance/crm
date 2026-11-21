/* @license Enterprise */

import { useMemo } from 'react';
import { StandardObjectNameSingular } from 'twenty-shared/types';

import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFilterableFieldMetadataItems } from '@/object-record/record-filter/hooks/useFilterableFieldMetadataItems';
import { type WorkspaceMemberHopMetadata } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop';

// Initialization and draft sync must read the same metadata, or sync could drop a hop
// that initialization never loaded into the builder
export const useWorkspaceMemberHopMetadata = (
  objectMetadataItemId: string,
): WorkspaceMemberHopMetadata => {
  const { filterableFieldMetadataItems } =
    useFilterableFieldMetadataItems(objectMetadataItemId);

  const { activeObjectMetadataItems } = useFilteredObjectMetadataItems();

  const { objectMetadataItem: workspaceMemberObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: StandardObjectNameSingular.WorkspaceMember,
    });

  const workspaceMemberIdFieldMetadataId =
    workspaceMemberObjectMetadataItem.fields.find(
      (fieldMetadataItem) => fieldMetadataItem.name === 'id',
    )?.id;

  return useMemo(
    () => ({
      fieldMetadataItems: filterableFieldMetadataItems,
      objectMetadataItems: activeObjectMetadataItems,
      workspaceMemberIdFieldMetadataId,
    }),
    [
      filterableFieldMetadataItems,
      activeObjectMetadataItems,
      workspaceMemberIdFieldMetadataId,
    ],
  );
};
