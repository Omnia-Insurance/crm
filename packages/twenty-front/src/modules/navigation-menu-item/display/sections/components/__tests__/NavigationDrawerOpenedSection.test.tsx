import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DEFAULT_VIEW_GROUP_LOAD_LIMIT } from 'twenty-shared/constants';
import { NavigationMenuItemType } from 'twenty-shared/types';

import {
  type CurrentUserWorkspace,
  currentUserWorkspaceState,
} from '@/auth/states/currentUserWorkspaceState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { NavigationDrawerOpenedSection } from '@/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection';
import {
  buildMemberSidebarTestUserWorkspace,
  getMemberSidebarTestObjectMetadataItemOrThrow,
  MEMBER_SIDEBAR_TEST_OBJECT_METADATA_ITEMS,
} from '@/navigation-menu-item/display/testing/memberSidebarTestFixtures';
import { AggregateOperations } from '@/object-record/record-table/constants/AggregateOperations';
import {
  type NavigationMenuItem,
  ViewType,
  ViewVisibility,
} from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { setTestViewsInMetadataStore } from '~/testing/utils/setTestViewsInMetadataStore';

const LEADS_VIEW = {
  id: 'leads-view-id',
  name: 'My leads',
  objectMetadataId: getMemberSidebarTestObjectMetadataItemOrThrow('person').id,
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
};

const LEADS_VIEW_NAVIGATION_MENU_ITEM: NavigationMenuItem = {
  id: 'leads-view-navigation-menu-item',
  type: NavigationMenuItemType.VIEW,
  viewId: LEADS_VIEW.id,
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const renderOpenedSection = ({
  pathname,
  currentUserWorkspace,
}: {
  pathname: string;
  currentUserWorkspace: CurrentUserWorkspace;
}) => {
  const MetadataWrapper = getJestMetadataAndApolloMocksWrapper({
    apolloMocks: [],
    objectMetadataItems: MEMBER_SIDEBAR_TEST_OBJECT_METADATA_ITEMS,
    onInitializeJotaiStore: (store) => {
      store.set(currentUserWorkspaceState.atom, currentUserWorkspace);
      store.set(metadataStoreState.atomFamily('navigationMenuItems'), {
        current: [LEADS_VIEW_NAVIGATION_MENU_ITEM],
        draft: [],
        status: 'up-to-date',
      });
      setTestViewsInMetadataStore(store, [LEADS_VIEW]);
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MetadataWrapper>
      <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
    </MetadataWrapper>
  );

  return render(
    <Routes>
      <Route
        path="/objects/:objectNamePlural"
        element={<NavigationDrawerOpenedSection />}
      />
    </Routes>,
    { wrapper: Wrapper },
  );
};

describe('NavigationDrawerOpenedSection', () => {
  it('should hide Opened for a LAYOUTS user when a sidebar view item already lists the object', () => {
    renderOpenedSection({
      pathname: '/objects/people',
      currentUserWorkspace: buildMemberSidebarTestUserWorkspace({
        hasLayoutsPermission: true,
      }),
    });

    expect(screen.queryByText('Opened')).not.toBeInTheDocument();
  });

  it('should show Opened for a LAYOUTS user on an object missing from the sidebar', () => {
    renderOpenedSection({
      pathname: '/objects/companies',
      currentUserWorkspace: buildMemberSidebarTestUserWorkspace({
        hasLayoutsPermission: true,
      }),
    });

    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.getByText('Companies')).toBeInTheDocument();
  });

  it("should hide Opened for a member on an object of their role's list", () => {
    renderOpenedSection({
      pathname: '/objects/policies',
      currentUserWorkspace: buildMemberSidebarTestUserWorkspace({
        showInSidebarByObjectNameSingular: { policy: true, carrier: false },
      }),
    });

    expect(screen.queryByText('Opened')).not.toBeInTheDocument();
  });

  it('should show Opened for a member on an object hidden from their list', () => {
    renderOpenedSection({
      pathname: '/objects/carriers',
      currentUserWorkspace: buildMemberSidebarTestUserWorkspace({
        showInSidebarByObjectNameSingular: { policy: true, carrier: false },
      }),
    });

    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.getByText('Carriers')).toBeInTheDocument();
  });

  it('should hide Opened for a member before sidebar visibility loads', () => {
    renderOpenedSection({
      pathname: '/objects/carriers',
      currentUserWorkspace: buildMemberSidebarTestUserWorkspace({}),
    });

    expect(screen.queryByText('Opened')).not.toBeInTheDocument();
  });
});
