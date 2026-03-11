import {
  FeatureFlagKey,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

import { WorkspaceFavorites } from '@/favorites/components/WorkspaceFavorites';
import { OmniaMemberWorkspaceNavigationMenuItems } from '@/navigation-menu-item/components/OmniaMemberWorkspaceNavigationMenuItems';
import { WorkspaceNavigationMenuItems } from '@/navigation-menu-item/components/WorkspaceNavigationMenuItems';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useIsFeatureEnabled } from '@/workspace/hooks/useIsFeatureEnabled';

export const WorkspaceNavigationMenuItemsDispatcher = () => {
  const isNavigationMenuItemEditingEnabled = useIsFeatureEnabled(
    FeatureFlagKey.IS_NAVIGATION_MENU_ITEM_EDITING_ENABLED,
  );
  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);

  if (isNavigationMenuItemEditingEnabled && hasLayoutsPermission) {
    return <WorkspaceNavigationMenuItems />;
  }

  if (isNavigationMenuItemEditingEnabled) {
    return <OmniaMemberWorkspaceNavigationMenuItems />;
  }

  return <WorkspaceFavorites />;
};
