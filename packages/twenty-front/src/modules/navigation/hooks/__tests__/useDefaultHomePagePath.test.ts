import { currentUserState } from '@/auth/states/currentUserState';
import {
  type CurrentUserWorkspace,
  currentUserWorkspaceState,
} from '@/auth/states/currentUserWorkspaceState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { useDefaultHomePagePath } from '@/navigation/hooks/useDefaultHomePagePath';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { AggregateOperations } from '@/object-record/record-table/constants/AggregateOperations';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { createElement, useEffect, type ReactNode } from 'react';
import { DEFAULT_VIEW_GROUP_LOAD_LIMIT } from 'twenty-shared/constants';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import {
  type NavigationMenuItem,
  NavigationMenuItemType,
  PermissionFlagType,
  ViewKey,
  ViewType,
  ViewVisibility,
} from '~/generated-metadata/graphql';
import { mockedUserData } from '~/testing/mock-data/users';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';
import { setTestViewsInMetadataStore } from '~/testing/utils/setTestViewsInMetadataStore';

let mockIsMobile = false;

jest.mock('twenty-ui/utilities', () => ({
  ...jest.requireActual('twenty-ui/utilities'),
  useIsMobile: () => mockIsMobile,
}));

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

const buildCompanyView = (
  id: string,
  key: ViewKey | null,
  position: number,
) => ({
  id,
  name: 'Company view',
  objectMetadataId: getMockObjectMetadataItemOrThrow('company').id,
  type: ViewType.TABLE,
  key,
  isCompact: false,
  viewFields: [],
  viewFieldGroups: [],
  viewGroups: [],
  viewSorts: [],
  viewFilters: [],
  viewFilterGroups: [],
  kanbanAggregateOperation: AggregateOperations.COUNT,
  icon: '',
  kanbanAggregateOperationFieldMetadataId: '',
  position,
  visibility: ViewVisibility.WORKSPACE,
  createdByUserWorkspaceId: null,
  shouldHideEmptyGroups: false,
  groupLoadLimit: DEFAULT_VIEW_GROUP_LOAD_LIMIT,
  isActive: true,
});

// OMNIA-CUSTOM: upstream scenarios run as a LAYOUTS holder; members get the Omnia landing.
const LAYOUTS_USER_WORKSPACE: CurrentUserWorkspace = {
  ...mockedUserData.currentUserWorkspace,
  permissionFlags: [
    ...(mockedUserData.currentUserWorkspace.permissionFlags ?? []),
    PermissionFlagType.LAYOUTS,
  ],
};

// Reuses the pet mock's id, so the mocked user's read permission on pet applies to it.
const POLICY_OBJECT_METADATA_ITEM: EnrichedObjectMetadataItem = {
  ...getMockObjectMetadataItemOrThrow('pet'),
  nameSingular: 'policy',
  namePlural: 'policies',
  labelSingular: 'Policy',
  labelPlural: 'Policies',
};

const OBJECT_METADATA_ITEMS_WITH_POLICY =
  getTestEnrichedObjectMetadataItemsMock().map((objectMetadataItem) =>
    objectMetadataItem.id === POLICY_OBJECT_METADATA_ITEM.id
      ? POLICY_OBJECT_METADATA_ITEM
      : objectMetadataItem,
  );

// Without an argument the visibility field is absent, as in a session persisted before it existed.
const buildMemberUserWorkspace = (
  showInSidebarByObjectNameSingular?: Record<string, boolean>,
): CurrentUserWorkspace => ({
  ...mockedUserData.currentUserWorkspace,
  objectSidebarVisibility: isDefined(showInSidebarByObjectNameSingular)
    ? Object.entries(showInSidebarByObjectNameSingular).map(
        ([nameSingular, showInSidebar]) => {
          const objectMetadataItem = OBJECT_METADATA_ITEMS_WITH_POLICY.find(
            (item) => item.nameSingular === nameSingular,
          );

          if (!isDefined(objectMetadataItem)) {
            throw new Error(`No mock object named ${nameSingular}`);
          }

          return { objectMetadataId: objectMetadataItem.id, showInSidebar };
        },
      )
    : undefined,
});

const renderHooks = ({
  withCurrentUser,
  withExistingView,
  withObjectMetadataLoaded = true,
  objectMetadataItems = getTestEnrichedObjectMetadataItemsMock(),
  navigationMenuItems = [],
  withNavigationMenuItemsLoaded = true,
  views,
  currentUserWorkspace = LAYOUTS_USER_WORKSPACE,
}: {
  withCurrentUser: boolean;
  withExistingView: boolean;
  withObjectMetadataLoaded?: boolean;
  objectMetadataItems?: EnrichedObjectMetadataItem[];
  navigationMenuItems?: NavigationMenuItem[];
  withNavigationMenuItemsLoaded?: boolean;
  views?: Parameters<typeof setTestViewsInMetadataStore>[1];
  currentUserWorkspace?: CurrentUserWorkspace;
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
        if (isDefined(views)) {
          setTestViewsInMetadataStore(jotaiStore, views);
        } else if (withExistingView) {
          setTestViewsInMetadataStore(jotaiStore, [
            {
              id: 'viewId',
              name: 'Test View',
              objectMetadataId: getMockObjectMetadataItemOrThrow('company').id,
              type: ViewType.TABLE,
              key: null,
              isCompact: false,
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
              groupLoadLimit: DEFAULT_VIEW_GROUP_LOAD_LIMIT,
              isActive: true,
            },
          ]);
        } else {
          setTestViewsInMetadataStore(jotaiStore, []);
        }

        if (withCurrentUser) {
          setCurrentUser(mockedUserData);
          setCurrentUserWorkspace(currentUserWorkspace);
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
  afterEach(() => {
    mockIsMobile = false;
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
      navigationMenuItems: [],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/companies');
    });
  });
  it('should target the initial view rather than the index view when the menu has no object item', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      navigationMenuItems: [],
      views: [
        buildCompanyView('index-view-id', ViewKey.INDEX, 0),
        buildCompanyView('initial-view-id', null, 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(
        '/objects/companies?viewId=initial-view-id',
      );
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
  // Metadata may not be loaded yet right after login; don't fall back to /settings/profile.
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
  it('should return the mobile home page on mobile', async () => {
    mockIsMobile = true;

    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      navigationMenuItems: [buildObjectNavigationMenuItem('person', 0)],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.Home);
    });
  });
  it('should still return the sign in page on mobile when there is no currentUser', async () => {
    mockIsMobile = true;
    jotaiStore.set(currentUserState.atom, null);

    const { result } = renderHooks({
      withCurrentUser: false,
      withExistingView: false,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.SignInUp);
    });
  });
  it('should defer to AppPath.Index when object metadata is loaded but empty while navigation menu items are not loaded yet', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      objectMetadataItems: [],
      navigationMenuItems: [],
      withNavigationMenuItemsLoaded: false,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.Index);
    });
  });

  // OMNIA-CUSTOM: member landing (MEMBER_LANDING_OBJECT_ORDER over the role's sidebar list).
  it('should keep the navigation menu landing for a LAYOUTS holder', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      navigationMenuItems: [
        buildObjectNavigationMenuItem('company', 0),
        buildObjectNavigationMenuItem('person', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/companies');
    });
  });
  it('should pin a non-admin member to the first sidebar object (Leads/person) when it is readable and shown', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      currentUserWorkspace: buildMemberUserWorkspace({
        company: true,
        person: true,
      }),
      navigationMenuItems: [
        buildObjectNavigationMenuItem('company', 0),
        buildObjectNavigationMenuItem('person', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/people');
    });
  });
  it('should land a member on policy when person is hidden, never on a hidden object', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      objectMetadataItems: OBJECT_METADATA_ITEMS_WITH_POLICY,
      currentUserWorkspace: buildMemberUserWorkspace({
        company: false,
        person: false,
        policy: true,
        note: true,
      }),
      navigationMenuItems: [
        buildObjectNavigationMenuItem('person', 0),
        buildObjectNavigationMenuItem('company', 1),
      ],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual('/objects/policies');
    });
  });
  it('should land a member on the first object of their sidebar list when no landing object is shown', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      currentUserWorkspace: buildMemberUserWorkspace({
        rocket: true,
        surveyResult: true,
      }),
      navigationMenuItems: [buildObjectNavigationMenuItem('rocket', 0)],
    });

    // The sidebar lists the newest custom object first; upstream would pick the menu item.
    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(
        '/objects/surveyResults',
      );
    });
  });
  it('should land a member on profile settings when their sidebar shows nothing', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      currentUserWorkspace: buildMemberUserWorkspace({}),
      navigationMenuItems: [buildObjectNavigationMenuItem('person', 0)],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(
        getSettingsPath(SettingsPath.ProfilePage),
      );
    });
  });
  it('should return the mobile home page for a member on mobile', async () => {
    mockIsMobile = true;

    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      currentUserWorkspace: buildMemberUserWorkspace({ person: true }),
      navigationMenuItems: [buildObjectNavigationMenuItem('person', 0)],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.Home);
    });
  });
  it('should defer to AppPath.Index for a member whose sidebar visibility has not loaded', async () => {
    const { result } = renderHooks({
      withCurrentUser: true,
      withExistingView: false,
      currentUserWorkspace: buildMemberUserWorkspace(),
      navigationMenuItems: [buildObjectNavigationMenuItem('person', 0)],
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toEqual(AppPath.Index);
    });
  });
});
