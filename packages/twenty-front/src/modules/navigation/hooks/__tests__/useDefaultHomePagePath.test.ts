import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { useDefaultHomePagePath } from '@/navigation/hooks/useDefaultHomePagePath';
// OMNIA-CUSTOM: needed to exercise the admin "last visited" landing behaviour.
import { lastVisitedObjectMetadataItemIdState } from '@/navigation/states/lastVisitedObjectMetadataItemIdState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { AggregateOperations } from '@/object-record/record-table/constants/AggregateOperations';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { createElement, useEffect, type ReactNode } from 'react';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import {
  type NavigationMenuItem,
  NavigationMenuItemType,
  // OMNIA-CUSTOM: LAYOUTS flag drives isAdmin in useDefaultHomePagePath; the
  // upstream nav-menu scenarios only apply to admins.
  PermissionFlagType,
  ViewOpenRecordIn,
  ViewType,
  ViewVisibility,
} from '~/generated-metadata/graphql';
import { mockedUserData } from '~/testing/mock-data/users';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';
import { setTestViewsInMetadataStore } from '~/testing/utils/setTestViewsInMetadataStore';

const Wrapper = ({ children }: { children: ReactNode }) =>
  createElement(JotaiProvider, { store: jotaiStore }, children);

const buildObjectNavigationMenuItem = (
  objectNameSingular: string,
  position: number,
  folderId?: string,
): NavigationMenuItem => ({
  __typename: 'NavigationMenuItem',
  id: `navigation-menu-item-${objectNameSingular}`,
  type: NavigationMenuItemType.OBJECT,
  targetObjectMetadataId:
    getMockObjectMetadataItemOrThrow(objectNameSingular).id,
  position,
  folderId,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const buildFolderNavigationMenuItem = (
  id: string,
  position: number,
): NavigationMenuItem => ({
  __typename: 'NavigationMenuItem',
  id,
  type: NavigationMenuItemType.FOLDER,
  name: 'Folder',
  position,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const buildPageLayoutNavigationMenuItem = (
  pageLayoutId: string,
  position: number,
): NavigationMenuItem => ({
  __typename: 'NavigationMenuItem',
  id: `navigation-menu-item-page-layout-${pageLayoutId}`,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutId,
  position,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const buildLinkNavigationMenuItem = (position: number): NavigationMenuItem => ({
  __typename: 'NavigationMenuItem',
  id: `navigation-menu-item-link-${position}`,
  type: NavigationMenuItemType.LINK,
  link: 'https://example.com',
  position,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const buildViewNavigationMenuItem = (
  viewId: string,
  position: number,
): NavigationMenuItem => ({
  __typename: 'NavigationMenuItem',
  id: `navigation-menu-item-view-${viewId}`,
  type: NavigationMenuItemType.VIEW,
  viewId,
  position,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const renderHooks = ({
  withCurrentUser,
  withExistingView,
  withObjectMetadataLoaded = true,
  objectMetadataItems = getTestEnrichedObjectMetadataItemsMock(),
  navigationMenuItems = [],
  withNavigationMenuItemsLoaded = true,
  // OMNIA-CUSTOM: isAdmin === LAYOUTS permission flag. Upstream nav-menu
  // landing scenarios only apply to admins; members are pinned to their first
  // sidebar-visible object. Defaults to a non-admin member.
  isAdmin = false,
}: {
  withCurrentUser: boolean;
  withExistingView: boolean;
  withObjectMetadataLoaded?: boolean;
  objectMetadataItems?: EnrichedObjectMetadataItem[];
  navigationMenuItems?: NavigationMenuItem[];
  withNavigationMenuItemsLoaded?: boolean;
  isAdmin?: boolean;
}) => {
  if (withObjectMetadataLoaded) {
    setTestObjectMetadataItemsInMetadataStore(jotaiStore, objectMetadataItems);
  } else {
    jotaiStore.set(metadataStoreState.atomFamily('objectMetadataItems'), {
      current: [],
      draft: [],
      status: 'empty',
    });
  }

  jotaiStore.set(metadataStoreState.atomFamily('navigationMenuItems'), {
    current: navigationMenuItems,
    draft: [],
    status: withNavigationMenuItemsLoaded ? 'up-to-date' : 'empty',
  });

  const { result } = renderHook(
    () => {
      const setCurrentUser = useSetAtomState(currentUserState);
      const setCurrentUserWorkspace = useSetAtomState(
        currentUserWorkspaceState,
      );

      useEffect(() => {
        if (withExistingView) {
          setTestViewsInMetadataStore(jotaiStore, [
            {
              id: 'viewId',
              name: 'Test View',
              objectMetadataId: getMockObjectMetadataItemOrThrow('company').id,
              type: ViewType.TABLE,
              key: null,
              isCompact: false,
              openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
              viewFields: [],
              viewFieldGroups: [],
              viewGroups: [],
              viewSorts: [],
              viewFilters: [],
              viewFilterGroups: [],
              kanbanAggregateOperation: AggregateOperations.COUNT,
              icon: '',
              kanbanAggregateOperationFieldMetadataId: '',
              position: 0,
              visibility: ViewVisibility.WORKSPACE,
              createdByUserWorkspaceId: null,
              shouldHideEmptyGroups: false,
              isActive: true,
            },
          ]);
        } else {
          setTestViewsInMetadataStore(jotaiStore, []);
        }

        if (withCurrentUser) {
          setCurrentUser(mockedUserData);
          // OMNIA-CUSTOM: add the LAYOUTS permission flag so the hook treats the
          // user as an admin for the upstream nav-menu landing scenarios.
          setCurrentUserWorkspace(
            isAdmin
              ? {
                  ...mockedUserData.currentUserWorkspace,
                  permissionFlags: [
                    ...(mockedUserData.currentUserWorkspace.permissionFlags ??
                      []),
                    PermissionFlagType.LAYOUTS,
                  ],
                }
              : mockedUserData.currentUserWorkspace,
          );
        }
      }, [setCurrentUser, setCurrentUserWorkspace]);

      return useDefaultHomePagePath();
    },
    {
      wrapper: Wrapper,
    },
  );
  return { result };
};

describe('useDefaultHomePagePath', () => {
  // OMNIA-CUSTOM: the admin "last visited" landing reads a localStorage-backed
  // atom that would otherwise leak between tests in the shared jotaiStore.
  afterEach(() => {
    jotaiStore.set(lastVisitedObjectMetadataItemIdState.atom, null);
  });

  it('should return proper path when no currentUser', async () => {
    const { result } = renderHooks({
      withCurrentUser: false,
      withExistingView: false,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.SignInUp);
    });
  });
  it('should return proper path when no currentUser and existing view', async () => {
    const { result } = renderHooks({
      withCurrentUser: false,
      withExistingView: true,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.SignInUp);
    });
  });
  it('should redirect to the first object of the navigation menu', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      isAdmin: true,
      navigationMenuItems: [
        buildObjectNavigationMenuItem('person', 0),
        buildObjectNavigationMenuItem('company', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/people');
    });
  });
  it('should honor display order over a lower-positioned item nested in a folder', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      isAdmin: true,
      navigationMenuItems: [
        buildObjectNavigationMenuItem('company', 0, 'folder-1'),
        buildObjectNavigationMenuItem('person', 1),
        buildFolderNavigationMenuItem('folder-1', 2),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/people');
    });
  });
  it('should redirect to a PAGE_LAYOUT navigation menu item as homepage', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      isAdmin: true,
      navigationMenuItems: [
        buildPageLayoutNavigationMenuItem('page-layout-1', 0),
        buildObjectNavigationMenuItem('person', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/page/page-layout-1');
    });
  });
  it('should skip a LINK navigation menu item and use the next valid item', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      isAdmin: true,
      navigationMenuItems: [
        buildLinkNavigationMenuItem(0),
        buildObjectNavigationMenuItem('person', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/people');
    });
  });
  it('should honor the view of a VIEW navigation menu item', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: true,
      isAdmin: true,
      navigationMenuItems: [buildViewNavigationMenuItem('viewId', 0)],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(
        '/objects/companies?viewId=viewId',
      );
    });
  });
  it('should fall back to the first readable object when the menu has no object item', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      isAdmin: true,
      navigationMenuItems: [],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/companies');
    });
  });
  it('should redirect to profile settings when there is no readable object', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      objectMetadataItems: [],
      navigationMenuItems: [],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(
        getSettingsPath(SettingsPath.ProfilePage),
      );
    });
  });
  // Regression: during the post-login transition window object metadata may
  // not yet be loaded. We must not redirect the user to /settings/profile
  // (the genuine empty-fallback) until metadata has actually loaded.
  it('should defer to AppPath.Index when currentUser is defined but object metadata is not loaded yet', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      withObjectMetadataLoaded: false,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.Index);
    });
  });
  it('should defer to AppPath.Index when navigation menu items are not loaded yet', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      navigationMenuItems: [buildObjectNavigationMenuItem('person', 0)],
      withNavigationMenuItemsLoaded: false,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.Index);
    });
  });
  // OMNIA-CUSTOM: non-admin members are pinned to their first sidebar-visible
  // object (person/Leads) and must never follow the workspace navigation menu,
  // which is only read-permission filtered (not showInSidebar filtered).
  it('should pin a non-admin member to the first sidebar object (Leads/person) regardless of navigation menu items', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: true,
      isAdmin: false,
      navigationMenuItems: [
        buildObjectNavigationMenuItem('company', 0),
        buildViewNavigationMenuItem('viewId', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/people');
    });
  });
  // OMNIA-CUSTOM: admins return to their last-visited object when it is still
  // part of the workspace sidebar, taking precedence over the first navigation
  // menu item (person here).
  it('should land an admin on their last-visited object when it is still in the sidebar', async () => {
    jotaiStore.set(
      lastVisitedObjectMetadataItemIdState.atom,
      getMockObjectMetadataItemOrThrow('company').id,
    );

    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      isAdmin: true,
      navigationMenuItems: [
        buildObjectNavigationMenuItem('person', 0),
        buildObjectNavigationMenuItem('company', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/companies');
    });
  });
});
