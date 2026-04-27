import { useIdentifyActiveNavigationMenuItems } from '@/navigation-menu-item/display/hooks/useIdentifyActiveNavigationMenuItems';
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

  const { objectMetadataIdForOpenedSection } =
    useIdentifyActiveNavigationMenuItems();

  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const objectMetadataItem = activeObjectMetadataItems.find(
    (item) => item.id === objectMetadataIdForOpenedSection,
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

  const shouldShowOpenedSection =
    isDefined(objectMetadataItem) && !isAlreadyShownInWorkspaceSection;

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
