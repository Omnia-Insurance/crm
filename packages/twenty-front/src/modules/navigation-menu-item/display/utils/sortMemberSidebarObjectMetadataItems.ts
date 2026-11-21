import { MEMBER_SIDEBAR_FIRST_OBJECT_NAMES } from '@/navigation-menu-item/display/constants/MemberSidebarFirstObjectNames';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isDefined } from 'twenty-shared/utils';

export const sortMemberSidebarObjectMetadataItems = (
  objectMetadataItems: EnrichedObjectMetadataItem[],
): EnrichedObjectMetadataItem[] => {
  const firstObjectMetadataItems = MEMBER_SIDEBAR_FIRST_OBJECT_NAMES.map(
    (nameSingular) =>
      objectMetadataItems.find(
        (objectMetadataItem) =>
          objectMetadataItem.nameSingular === nameSingular,
      ),
  ).filter(isDefined);

  const otherObjectMetadataItemsNewestFirst = objectMetadataItems
    .filter(
      (objectMetadataItem) =>
        !MEMBER_SIDEBAR_FIRST_OBJECT_NAMES.includes(
          objectMetadataItem.nameSingular,
        ),
    )
    .sort(
      (objectMetadataItemA, objectMetadataItemB) =>
        new Date(objectMetadataItemB.createdAt).getTime() -
        new Date(objectMetadataItemA.createdAt).getTime(),
    );

  return [...firstObjectMetadataItems, ...otherObjectMetadataItemsNewestFirst];
};
