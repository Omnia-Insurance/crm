import { useParams } from 'react-router-dom';

import { useWorkspaceNavigationMenuItems } from '@/navigation-menu-item/display/hooks/useWorkspaceNavigationMenuItems';
import { NavigationDrawerSectionForObjectMetadataItems } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { AnimatedExpandableContainer } from 'twenty-ui/layout';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const NavigationDrawerOpenedSection = () => {
  const { t } = useLingui();

  const { activeObjectMetadataItems } = useFilteredObjectMetadataItems();

  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);

  const { objectMetadataIdsInWorkspaceNav } = useWorkspaceNavigationMenuItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const {
    objectNamePlural: currentObjectNamePlural,
    objectNameSingular: currentObjectNameSingular,
  } = useParams();

  const objectMetadataItem = activeObjectMetadataItems.find(
    (item) =>
      item.namePlural === currentObjectNamePlural ||
      item.nameSingular === currentObjectNameSingular,
  );

  // For admins, upstream's objectMetadataIdsInWorkspaceNav handles exclusion.
  // For non-layout users, exclude objects already shown in the workspace
  // section via showInSidebar permission.
  const isObjectAlreadyInNavbar = isDefined(objectMetadataItem)
    ? objectMetadataIdsInWorkspaceNav.has(objectMetadataItem.id)
    : true;

  const isAlreadyShownInWorkspaceSection =
    isDefined(objectMetadataItem) &&
    !hasLayoutsPermission &&
    getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      objectMetadataItem.id,
    ).showInSidebar;

  const shouldShowOpenedSection =
    !isObjectAlreadyInNavbar && !isAlreadyShownInWorkspaceSection;

  return (
    <AnimatedExpandableContainer isExpanded={shouldShowOpenedSection}>
      <NavigationDrawerSectionForObjectMetadataItems
        sectionTitle={t`Opened`}
        objectMetadataItems={
          isDefined(objectMetadataItem) ? [objectMetadataItem] : []
        }
      />
    </AnimatedExpandableContainer>
  );
};
