import { useParams } from 'react-router-dom';

import { useWorkspaceNavigationMenuItems } from '@/navigation-menu-item/display/hooks/useWorkspaceNavigationMenuItems';
import { NavigationDrawerSectionForObjectMetadataItems } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { AnimatedExpandableContainer } from 'twenty-ui/layout';

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

  // Omnia: also suppress the "Opened" section when the object is already
  // visible in the workspace sidebar via showInSidebar permission.
  const isAlreadyShownInWorkspaceSection =
    isDefined(objectMetadataItem) &&
    !hasLayoutsPermission &&
    getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      objectMetadataItem.id,
    ).showInSidebar;

  const shouldShowOpenedSection = isDefined(objectMetadataItem)
    ? !objectMetadataIdsInWorkspaceNav.has(objectMetadataItem.id) &&
      !isAlreadyShownInWorkspaceSection
    : false;

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
