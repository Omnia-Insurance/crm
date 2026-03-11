import { useParams } from 'react-router-dom';

import { useWorkspaceFavorites } from '@/favorites/hooks/useWorkspaceFavorites';
import { getOmniaMemberWorkspaceObjectMetadataItems } from '@/navigation-menu-item/utils/getOmniaMemberWorkspaceObjectMetadataItems';
import { useWorkspaceNavigationMenuItems } from '@/navigation-menu-item/hooks/useWorkspaceNavigationMenuItems';
import { NavigationDrawerSectionForObjectMetadataItems } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { useIsPrefetchLoading } from '@/prefetch/hooks/useIsPrefetchLoading';
import { prefetchIsLoadedFamilyState } from '@/prefetch/states/prefetchIsLoadedFamilyState';
import { PrefetchKey } from '@/prefetch/types/PrefetchKey';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useIsFeatureEnabled } from '@/workspace/hooks/useIsFeatureEnabled';
import { useLingui } from '@lingui/react/macro';
import {
  FeatureFlagKey,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

const WORKFLOW_OBJECTS_IN_SIDEBAR = [
  CoreObjectNameSingular.Workflow,
  CoreObjectNameSingular.WorkflowRun,
  CoreObjectNameSingular.WorkflowVersion,
];

export const NavigationDrawerOpenedSection = () => {
  const { t } = useLingui();

  const { activeObjectMetadataItems } = useFilteredObjectMetadataItems();
  const filteredActiveNonSystemObjectMetadataItems =
    activeObjectMetadataItems.filter((item) => !item.isRemote);

  const isPrefetchLoading = useIsPrefetchLoading();
  const isNavigationMenuItemEditingEnabled = useIsFeatureEnabled(
    FeatureFlagKey.IS_NAVIGATION_MENU_ITEM_EDITING_ENABLED,
  );
  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);
  const prefetchIsLoaded = useAtomFamilyStateValue(
    prefetchIsLoadedFamilyState,
    PrefetchKey.AllNavigationMenuItems,
  );

  const loading =
    isPrefetchLoading ||
    (isNavigationMenuItemEditingEnabled &&
      hasLayoutsPermission &&
      !prefetchIsLoaded);

  const { workspaceFavoritesObjectMetadataItems } = useWorkspaceFavorites();
  const { workspaceNavigationMenuItemsObjectMetadataItems } =
    useWorkspaceNavigationMenuItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const omniaMemberWorkspaceObjectMetadataItems =
    getOmniaMemberWorkspaceObjectMetadataItems(
      filteredActiveNonSystemObjectMetadataItems,
    );

  const {
    objectNamePlural: currentObjectNamePlural,
    objectNameSingular: currentObjectNameSingular,
  } = useParams();

  if (!currentObjectNamePlural && !currentObjectNameSingular) {
    return;
  }

  const objectMetadataItem = filteredActiveNonSystemObjectMetadataItems.find(
    (item) =>
      item.namePlural === currentObjectNamePlural ||
      item.nameSingular === currentObjectNameSingular,
  );

  if (!objectMetadataItem) {
    return;
  }

  const workspaceItemsToExclude = isNavigationMenuItemEditingEnabled
    ? hasLayoutsPermission
      ? workspaceNavigationMenuItemsObjectMetadataItems
      : omniaMemberWorkspaceObjectMetadataItems
    : workspaceFavoritesObjectMetadataItems;

  const isWorkflowObjectInSidebar = WORKFLOW_OBJECTS_IN_SIDEBAR.includes(
    objectMetadataItem.nameSingular as CoreObjectNameSingular,
  );
  const objectPermissions = getObjectPermissionsForObject(
    objectPermissionsByObjectMetadataId,
    objectMetadataItem.id,
  );
  const isOmniaMemberWorkspaceObject =
    omniaMemberWorkspaceObjectMetadataItems.some(
      (workspaceObjectMetadataItem) =>
        workspaceObjectMetadataItem.id === objectMetadataItem.id,
    );
  const shouldDisplayObjectInOpenedSectionForMemberWorkspace =
    isNavigationMenuItemEditingEnabled &&
    !hasLayoutsPermission &&
    isOmniaMemberWorkspaceObject;

  const shouldDisplayObjectInOpenedSection =
    !isWorkflowObjectInSidebar &&
    (objectPermissions.showInSidebar ||
      shouldDisplayObjectInOpenedSectionForMemberWorkspace) &&
    !workspaceItemsToExclude
      .map((item) => item.id)
      .includes(objectMetadataItem.id);

  if (loading) {
    return null;
  }

  return (
    shouldDisplayObjectInOpenedSection && (
      <NavigationDrawerSectionForObjectMetadataItems
        sectionTitle={t`Opened`}
        objectMetadataItems={[objectMetadataItem]}
        isRemote={false}
      />
    )
  );
};
