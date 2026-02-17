import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { isNavigationMenuInEditModeStateV2 } from '@/navigation-menu-item/states/isNavigationMenuInEditModeStateV2';
import { navigationMenuItemsDraftStateV2 } from '@/navigation-menu-item/states/navigationMenuItemsDraftStateV2';
import { filterNavigationMenuItemsByRole } from '@/navigation-menu-item/utils/filterNavigationMenuItemsByRole';
import { filterWorkspaceNavigationMenuItems } from '@/navigation-menu-item/utils/filterWorkspaceNavigationMenuItems';
import { objectMetadataItemsState } from '@/object-metadata/states/objectMetadataItemsState';
import { prefetchNavigationMenuItemsState } from '@/prefetch/states/prefetchNavigationMenuItemsState';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { useRecoilValueV2 } from '@/ui/utilities/state/jotai/hooks/useRecoilValueV2';
import { coreViewsState } from '@/views/states/coreViewState';
import { convertCoreViewToView } from '@/views/utils/convertCoreViewToView';
import { isDefined } from 'twenty-shared/utils';
import {
  PermissionFlagType,
  type NavigationMenuItem,
} from '~/generated-metadata/graphql';

type PrefetchedNavigationMenuItemsData = {
  navigationMenuItems: NavigationMenuItem[];
  workspaceNavigationMenuItems: NavigationMenuItem[];
  currentWorkspaceMemberId: string | undefined;
};

export const usePrefetchedNavigationMenuItemsData =
  (): PrefetchedNavigationMenuItemsData => {
    const currentWorkspaceMember = useRecoilValue(currentWorkspaceMemberState);
    const currentWorkspaceMemberId = currentWorkspaceMember?.id;
    const prefetchNavigationMenuItems = useRecoilValue(
      prefetchNavigationMenuItemsState,
    );
    const isNavigationMenuInEditMode = useRecoilValueV2(
      isNavigationMenuInEditModeStateV2,
    );
    const navigationMenuItemsDraft = useRecoilValueV2(
      navigationMenuItemsDraftStateV2,
    );

    const permissionFlagMap = usePermissionFlagMap();
    const isAdmin = permissionFlagMap[PermissionFlagType.LAYOUTS];
    const objectMetadataItems = useRecoilValue(objectMetadataItemsState);
    const coreViews = useRecoilValue(coreViewsState);
    const views = useMemo(
      () => coreViews.map(convertCoreViewToView),
      [coreViews],
    );

    const navigationMenuItems = prefetchNavigationMenuItems.filter((item) =>
      isDefined(item.userWorkspaceId),
    );

    const workspaceNavigationMenuItemsFromPrefetch =
      filterWorkspaceNavigationMenuItems(prefetchNavigationMenuItems);

    // Apply role-based filtering for non-admin users (skip in edit mode)
    const roleFilteredItems = useMemo(
      () =>
        filterNavigationMenuItemsByRole(
          workspaceNavigationMenuItemsFromPrefetch,
          isAdmin,
          objectMetadataItems,
          views,
        ),
      [
        workspaceNavigationMenuItemsFromPrefetch,
        isAdmin,
        objectMetadataItems,
        views,
      ],
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
