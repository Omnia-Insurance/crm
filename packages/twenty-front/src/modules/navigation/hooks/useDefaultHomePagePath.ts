import { currentUserState } from '@/auth/states/currentUserState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { metadataStoreStatusFamilySelector } from '@/metadata-store/states/metadataStoreStatusFamilySelector';
import { useNavigationMenuItemSectionItems } from '@/navigation-menu-item/display/hooks/useNavigationMenuItemSectionItems';
import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { lastVisitedObjectMetadataItemIdState } from '@/navigation/states/lastVisitedObjectMetadataItemIdState';
import { type ObjectPathInfo } from '@/navigation/types/ObjectPathInfo';
import { getFirstNavigationMenuItemLink } from '@/navigation/utils/getFirstNavigationMenuItemLink';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { filterReadableActiveObjectMetadataItems } from '@/object-metadata/utils/filterReadableActiveObjectMetadataItems';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { getObjectPermissionsFromMapByObjectMetadataId } from '@/settings/roles/role-permissions/objects-permissions/utils/getObjectPermissionsFromMapByObjectMetadataId';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { useStore } from 'jotai';
import isEmpty from 'lodash.isempty';
import { useCallback, useMemo } from 'react';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { getAppPath, getSettingsPath, isDefined } from 'twenty-shared/utils';
import { PermissionFlagType } from '~/generated-metadata/graphql';

// OMNIA-CUSTOM: member sidebar display order — person (Leads) first
const SIDEBAR_ORDER = ['person', 'policy', 'note', 'task'];

export const useDefaultHomePagePath = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const permissionFlagMap = usePermissionFlagMap();
  const isAdmin = permissionFlagMap[PermissionFlagType.LAYOUTS];
  const metadataStore = useAtomFamilyStateValue(
    metadataStoreState,
    'objectMetadataItems',
  );
  const areObjectMetadataItemsLoaded = metadataStore.status === 'up-to-date';
  const navigationMenuItemsStatus = useAtomFamilySelectorValue(
    metadataStoreStatusFamilySelector,
    'navigationMenuItems',
  );
  const areNavigationMenuItemsLoaded =
    navigationMenuItemsStatus === 'up-to-date';

  const { activeObjectMetadataItems } = useFilteredObjectMetadataItems();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const views = useAtomStateValue(viewsSelector);
  const navigationMenuItemsInDisplayOrder = useNavigationMenuItemSectionItems();
  const store = useStore();

  const readableNonSystemObjectMetadataItems = useMemo(
    () =>
      filterReadableActiveObjectMetadataItems(
        activeObjectMetadataItems,
        objectPermissionsByObjectMetadataId,
      )
        .filter((item) => !item.isSystem)
        .sort((a, b) => a.nameSingular.localeCompare(b.nameSingular)),
    [activeObjectMetadataItems, objectPermissionsByObjectMetadataId],
  );

  // OMNIA-CUSTOM: For non-layout (member) users, restrict landing candidates to
  // objects visible in the sidebar (showInSidebar permission) and order them to
  // match the sidebar display order (SIDEBAR_ORDER — person/Leads first).
  const sidebarVisibleObjectMetadataItems = useMemo(() => {
    if (isAdmin) {
      return readableNonSystemObjectMetadataItems;
    }

    return readableNonSystemObjectMetadataItems
      .filter((item) => {
        const objectPermissions = getObjectPermissionsFromMapByObjectMetadataId(
          {
            objectPermissionsByObjectMetadataId,
            objectMetadataId: item.id,
          },
        );

        return objectPermissions?.showInSidebar;
      })
      .sort((a, b) => {
        const indexA = SIDEBAR_ORDER.indexOf(a.nameSingular);
        const indexB = SIDEBAR_ORDER.indexOf(b.nameSingular);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.nameSingular.localeCompare(b.nameSingular);
      });
  }, [
    isAdmin,
    readableNonSystemObjectMetadataItems,
    objectPermissionsByObjectMetadataId,
  ]);

  const getActiveObjectMetadataItemMatchingId = useCallback(
    (objectMetadataId: string) =>
      readableNonSystemObjectMetadataItems.find(
        (item) => item.id === objectMetadataId,
      ),
    [readableNonSystemObjectMetadataItems],
  );

  const getFirstView = useCallback(
    (objectMetadataItemId: string | undefined | null) => {
      return views.find(
        (view) => view.objectMetadataId === objectMetadataItemId,
      );
    },
    [views],
  );

  const buildRecordIndexPath = useCallback(
    (objectPathInfo: ObjectPathInfo) =>
      getAppPath(
        AppPath.RecordIndexPage,
        { objectNamePlural: objectPathInfo.objectMetadataItem?.namePlural },
        objectPathInfo.view?.id
          ? { viewId: objectPathInfo.view.id }
          : undefined,
      ),
    [],
  );

  // Upstream helper: first workspace navigation-menu link, in display order and
  // filtered by read permission. Used as the admin landing target.
  const firstNavigationMenuItemLink = useMemo(
    () =>
      getFirstNavigationMenuItemLink({
        navigationMenuItemsInDisplayOrder,
        objectMetadataItems,
        views,
        objectPermissionsByObjectMetadataId,
      }),
    [
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
      views,
      navigationMenuItemsInDisplayOrder,
    ],
  );

  // OMNIA-CUSTOM: object metadata ids present in the workspace sidebar, used to
  // gate the admin "last visited" landing behaviour.
  const sidebarObjectMetadataIds = useMemo(() => {
    const ids: string[] = [];
    for (const navigationMenuItem of navigationMenuItemsInDisplayOrder) {
      const objectMetadataItem = getObjectMetadataForNavigationMenuItem(
        navigationMenuItem,
        objectMetadataItems,
        views,
      );
      if (isDefined(objectMetadataItem)) {
        ids.push(objectMetadataItem.id);
      }
    }
    return ids;
  }, [navigationMenuItemsInDisplayOrder, objectMetadataItems, views]);

  // OMNIA-CUSTOM: members always land on their first sidebar-visible object.
  const memberLandingPathInfo = useMemo<ObjectPathInfo | null>(() => {
    const firstItem = sidebarVisibleObjectMetadataItems[0];

    return isDefined(firstItem)
      ? { objectMetadataItem: firstItem, view: getFirstView(firstItem.id) }
      : null;
  }, [sidebarVisibleObjectMetadataItems, getFirstView]);

  // OMNIA-CUSTOM: admins return to their last-visited object when it is still
  // part of the workspace sidebar.
  const adminLastVisitedPathInfo = useMemo<ObjectPathInfo | null>(() => {
    if (!isAdmin) {
      return null;
    }

    const lastVisitedObjectMetadataItemId = store.get(
      lastVisitedObjectMetadataItemIdState.atom,
    );

    if (!isDefined(lastVisitedObjectMetadataItemId)) {
      return null;
    }

    const lastVisitedObjectMetadataItem = getActiveObjectMetadataItemMatchingId(
      lastVisitedObjectMetadataItemId,
    );

    if (
      !isDefined(lastVisitedObjectMetadataItem) ||
      !sidebarObjectMetadataIds.includes(lastVisitedObjectMetadataItem.id)
    ) {
      return null;
    }

    return {
      objectMetadataItem: lastVisitedObjectMetadataItem,
      view: getFirstView(lastVisitedObjectMetadataItem.id),
    };
  }, [
    isAdmin,
    store,
    getActiveObjectMetadataItemMatchingId,
    sidebarObjectMetadataIds,
    getFirstView,
  ]);

  // Fallback landing object (alphabetically-first readable object).
  const fallbackObjectPathInfo = useMemo<ObjectPathInfo | null>(() => {
    const [firstObjectMetadataItem] = readableNonSystemObjectMetadataItems;

    if (!isDefined(firstObjectMetadataItem)) {
      return null;
    }

    return {
      objectMetadataItem: firstObjectMetadataItem,
      view: getFirstView(firstObjectMetadataItem.id),
    };
  }, [getFirstView, readableNonSystemObjectMetadataItems]);

  const defaultHomePagePath = useMemo(() => {
    if (!isDefined(currentUser)) {
      return AppPath.SignInUp;
    }

    if (isEmpty(readableNonSystemObjectMetadataItems)) {
      // Object metadata may legitimately be empty for a user with no readable
      // objects, in which case /settings/profile is the intended fallback.
      // It can also be transiently empty during the post-login window before
      // workspace metadata has finished loading. Defer to AppPath.Index in
      // that case so the user isn't stranded on /settings/profile once
      // metadata becomes available.
      if (!areObjectMetadataItemsLoaded) {
        return AppPath.Index;
      }
      return getSettingsPath(SettingsPath.ProfilePage);
    }

    // The navigation menu drives the redirect and loads after the minimal-
    // metadata fast path. Wait for it instead of falling back to the
    // alphabetically-first object during the post-login window.
    if (!areNavigationMenuItemsLoaded) {
      return AppPath.Index;
    }

    // OMNIA-CUSTOM: members are pinned to their first sidebar-visible object and
    // must never fall through to the workspace navigation link, which is only
    // read-permission filtered (not showInSidebar filtered).
    if (!isAdmin) {
      if (!isDefined(memberLandingPathInfo)) {
        // showInSidebar permissions may still be loading — return undefined to
        // defer the redirect rather than landing on the wrong object.
        return undefined;
      }
      return buildRecordIndexPath(memberLandingPathInfo);
    }

    // OMNIA-CUSTOM: admins honour their last-visited object, then follow the
    // workspace navigation menu, then fall back to the first readable object.
    if (isDefined(adminLastVisitedPathInfo)) {
      return buildRecordIndexPath(adminLastVisitedPathInfo);
    }

    if (isDefined(firstNavigationMenuItemLink)) {
      return firstNavigationMenuItemLink;
    }

    if (!isDefined(fallbackObjectPathInfo)) {
      return AppPath.NotFound;
    }

    return buildRecordIndexPath(fallbackObjectPathInfo);
  }, [
    currentUser,
    readableNonSystemObjectMetadataItems,
    areObjectMetadataItemsLoaded,
    areNavigationMenuItemsLoaded,
    isAdmin,
    memberLandingPathInfo,
    adminLastVisitedPathInfo,
    firstNavigationMenuItemLink,
    fallbackObjectPathInfo,
    buildRecordIndexPath,
  ]);

  return { defaultHomePagePath };
};
