import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { NavigationMenuItemType } from 'twenty-shared/types';

import {
  type CurrentUserWorkspace,
  currentUserWorkspaceState,
} from '@/auth/states/currentUserWorkspaceState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { WorkspaceSectionDispatcher } from '@/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher';
import {
  buildMemberSidebarTestUserWorkspace,
  getMemberSidebarTestObjectMetadataItemOrThrow,
  MEMBER_SIDEBAR_TEST_OBJECT_METADATA_ITEMS,
} from '@/navigation-menu-item/display/testing/memberSidebarTestFixtures';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const MEMBER_ROLE_SHOW_IN_SIDEBAR = {
  dashboard: true,
  person: true,
  call: true,
  policy: true,
  note: true,
  task: true,
  carrier: false,
};

const COMPANY_NAVIGATION_MENU_ITEM: NavigationMenuItem = {
  id: 'company-navigation-menu-item',
  type: NavigationMenuItemType.OBJECT,
  targetObjectMetadataId:
    getMemberSidebarTestObjectMetadataItemOrThrow('company').id,
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const renderWorkspaceSectionDispatcher = (
  currentUserWorkspace: CurrentUserWorkspace,
) => {
  const MetadataWrapper = getJestMetadataAndApolloMocksWrapper({
    apolloMocks: [],
    objectMetadataItems: MEMBER_SIDEBAR_TEST_OBJECT_METADATA_ITEMS,
    onInitializeJotaiStore: (store) => {
      store.set(currentUserWorkspaceState.atom, currentUserWorkspace);
      store.set(metadataStoreState.atomFamily('navigationMenuItems'), {
        current: [COMPANY_NAVIGATION_MENU_ITEM],
        draft: [],
        status: 'up-to-date',
      });
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MetadataWrapper>
      <MemoryRouter initialEntries={['/objects/tasks']}>
        {children}
      </MemoryRouter>
    </MetadataWrapper>
  );

  return render(<WorkspaceSectionDispatcher />, { wrapper: Wrapper });
};

const getLinkLabels = () =>
  screen.getAllByRole('link').map((link) => link.textContent);

describe('WorkspaceSectionDispatcher', () => {
  it("should list exactly the member role's shown and readable objects, in sidebar order", () => {
    renderWorkspaceSectionDispatcher(
      buildMemberSidebarTestUserWorkspace({
        showInSidebarByObjectNameSingular: MEMBER_ROLE_SHOW_IN_SIDEBAR,
        unreadableObjectNameSingulars: ['call'],
      }),
    );

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(getLinkLabels()).toEqual([
      'Dashboards',
      'Leads',
      'Policies',
      'Notes',
      'Tasks',
    ]);
  });

  it('should hide hidden, unlisted and unreadable objects from a member', () => {
    renderWorkspaceSectionDispatcher(
      buildMemberSidebarTestUserWorkspace({
        showInSidebarByObjectNameSingular: MEMBER_ROLE_SHOW_IN_SIDEBAR,
        unreadableObjectNameSingulars: ['call'],
      }),
    );

    expect(screen.queryByText('Carriers')).not.toBeInTheDocument();
    expect(screen.queryByText('Calls')).not.toBeInTheDocument();
    expect(screen.queryByText('Companies')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit navigation' }),
    ).not.toBeInTheDocument();
  });

  it('should list an object a member can read only through a row-level rule', () => {
    renderWorkspaceSectionDispatcher(
      buildMemberSidebarTestUserWorkspace({
        showInSidebarByObjectNameSingular: { policy: true },
        rowLevelReadableObjectNameSingulars: ['policy'],
      }),
    );

    expect(getLinkLabels()).toEqual(['Policies']);
  });

  it('should render nothing for a member before sidebar visibility loads', () => {
    renderWorkspaceSectionDispatcher(buildMemberSidebarTestUserWorkspace({}));

    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('should render the curated workspace section for LAYOUTS users', () => {
    renderWorkspaceSectionDispatcher(
      buildMemberSidebarTestUserWorkspace({
        showInSidebarByObjectNameSingular: MEMBER_ROLE_SHOW_IN_SIDEBAR,
        hasLayoutsPermission: true,
      }),
    );

    expect(
      screen.getByRole('button', { name: 'Edit navigation' }),
    ).toBeInTheDocument();
    expect(getLinkLabels()).toEqual(['Companies']);
  });
});
