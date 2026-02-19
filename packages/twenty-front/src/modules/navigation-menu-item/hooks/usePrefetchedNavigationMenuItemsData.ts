import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { isNavigationMenuInEditModeStateV2 } from '@/navigation-menu-item/states/isNavigationMenuInEditModeStateV2';
import { navigationMenuItemsDraftStateV2 } from '@/navigation-menu-item/states/navigationMenuItemsDraftStateV2';
import { filterNavigationMenuItemsByRole } from '@/navigation-menu-item/utils/filterNavigationMenuItemsByRole';
import { filterWorkspaceNavigationMenuItems } from '@/navigation-menu-item/utils/filterWorkspaceNavigationMenuItems';
import { prefetchNavigationMenuItemsState } from '@/prefetch/states/prefetchNavigationMenuItemsState';
import { useRecoilValueV2 } from '@/ui/utilities/state/jotai/hooks/useRecoilValueV2';
import { coreViewsState } from '@/views/states/coreViewState';
import { convertCoreViewToView } from '@/views/utils/convertCoreViewToView';
import { isDefined } from 'twenty-shared/utils';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

type PrefetchedNavigationMenuItemsData = {
  navigationMenuItems: NavigationMenuItem[];
  workspaceNavigationMenuItems: NavigationMenuItem[];
  currentWorkspaceMemberId: string | undefined;
};

export const usePrefetchedNavigationMenuItemsData =
  (): PrefetchedNavigationMenuItemsData => {
    const currentWorkspaceMember = useRecoilValue(currentWorkspaceMemberState);
    const currentWorkspaceMemberId = currentWorkspaceMember?.id;
    const currentUserWorkspace = useRecoilValue(currentUserWorkspaceState);
    const prefetchNavigationMenuItems = useRecoilValue(
      prefetchNavigationMenuItemsState,
    );
    const isNavigationMenuInEditMode = useRecoilValueV2(
      isNavigationMenuInEditModeStateV2,
    );
    const navigationMenuItemsDraft = useRecoilValueV2(
      navigationMenuItemsDraftStateV2,
    );

    const coreViews = useRecoilValue(coreViewsState);
    const views = useMemo(
      () => coreViews.map(convertCoreViewToView),
      [coreViews],
    );

    const sidebarPermissions = useMemo(() => {
      const map = new Map<string, boolean>();

      if (isDefined(currentUserWorkspace?.objectsPermissions)) {
        for (const permission of currentUserWorkspace.objectsPermissions) {
          map.set(permission.objectMetadataId, permission.showInSidebar);
        }
      }

      return map;
    }, [currentUserWorkspace?.objectsPermissions]);

    const navigationMenuItems = prefetchNavigationMenuItems.filter((item) =>
      isDefined(item.userWorkspaceId),
    );

    const workspaceNavigationMenuItemsFromPrefetch =
      filterWorkspaceNavigationMenuItems(prefetchNavigationMenuItems);

    // Apply role-based filtering for sidebar visibility (skip in edit mode)
    const roleFilteredItems = useMemo(
      () =>
        filterNavigationMenuItemsByRole(
          workspaceNavigationMenuItemsFromPrefetch,
          sidebarPermissions,
          views,
        ),
      [workspaceNavigationMenuItemsFromPrefetch, sidebarPermissions, views],
    );

    const workspaceNavigationMenuItems =
      isNavigationMenuInEditMode && isDefined(navigationMenuItemsDraft)
        ? navigationMenuItemsDraft
        : roleFilteredItems;

    return {
      navigationMenuItems,
      workspaceNavigationMenuItems,
      currentWorkspaceMemberId,
    };
  };
