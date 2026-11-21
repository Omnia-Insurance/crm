import { sortMemberSidebarObjectMetadataItems } from '@/navigation-menu-item/display/utils/sortMemberSidebarObjectMetadataItems';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { objectShowInSidebarByObjectMetadataIdSelector } from '@/object-metadata/states/objectShowInSidebarByObjectMetadataIdSelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import isEmpty from 'lodash.isempty';
import { useMemo } from 'react';
import { canReachSomeRecords, isDefined } from 'twenty-shared/utils';

type MemberSidebarObjectMetadataItems = {
  isLoaded: boolean;
  objectMetadataItems: EnrichedObjectMetadataItem[];
};

// Fails closed: until permissions and sidebar visibility load, and for any object without an entry, nothing shows.
export const useMemberSidebarObjectMetadataItems =
  (): MemberSidebarObjectMetadataItems => {
    const { activeNonSystemObjectMetadataItems } =
      useFilteredObjectMetadataItems();
    const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
    const objectShowInSidebarByObjectMetadataId = useAtomStateValue(
      objectShowInSidebarByObjectMetadataIdSelector,
    );

    return useMemo(() => {
      if (
        !isDefined(objectShowInSidebarByObjectMetadataId) ||
        isEmpty(objectPermissionsByObjectMetadataId)
      ) {
        return { isLoaded: false, objectMetadataItems: [] };
      }

      const shownReadableObjectMetadataItems =
        activeNonSystemObjectMetadataItems.filter(
          (objectMetadataItem) =>
            objectShowInSidebarByObjectMetadataId[objectMetadataItem.id] ===
              true &&
            canReachSomeRecords({
              objectRecordsPermissions:
                objectPermissionsByObjectMetadataId[objectMetadataItem.id],
              operationType: 'read',
            }),
        );

      return {
        isLoaded: true,
        objectMetadataItems: sortMemberSidebarObjectMetadataItems(
          shownReadableObjectMetadataItems,
        ),
      };
    }, [
      activeNonSystemObjectMetadataItems,
      objectPermissionsByObjectMetadataId,
      objectShowInSidebarByObjectMetadataId,
    ]);
  };
