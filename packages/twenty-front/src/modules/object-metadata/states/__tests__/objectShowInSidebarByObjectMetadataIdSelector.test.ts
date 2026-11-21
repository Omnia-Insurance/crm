import { createStore } from 'jotai';

import {
  type CurrentUserWorkspace,
  currentUserWorkspaceState,
} from '@/auth/states/currentUserWorkspaceState';
import { objectShowInSidebarByObjectMetadataIdSelector } from '@/object-metadata/states/objectShowInSidebarByObjectMetadataIdSelector';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const CURRENT_USER_WORKSPACE_WITHOUT_SIDEBAR_VISIBILITY: CurrentUserWorkspace =
  {
    permissionFlags: [],
    twoFactorAuthenticationMethodSummary: [],
    objectRecordsPermissions: [],
    isImpersonating: false,
  };

const buildCurrentUserWorkspace = (
  objectSidebarVisibility: NonNullable<
    CurrentUserWorkspace['objectSidebarVisibility']
  >,
): CurrentUserWorkspace => ({
  ...CURRENT_USER_WORKSPACE_WITHOUT_SIDEBAR_VISIBILITY,
  objectSidebarVisibility,
});

describe('objectShowInSidebarByObjectMetadataIdSelector', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('should be undefined while the current user workspace is not loaded', () => {
    const store = createStore();

    store.set(currentUserWorkspaceState.atom, null);

    expect(
      store.get(objectShowInSidebarByObjectMetadataIdSelector.atom),
    ).toBeUndefined();
  });

  it('should be undefined when the current user workspace was persisted without the sidebar visibility', () => {
    const store = createStore();

    store.set(
      currentUserWorkspaceState.atom,
      CURRENT_USER_WORKSPACE_WITHOUT_SIDEBAR_VISIBILITY,
    );

    expect(
      store.get(objectShowInSidebarByObjectMetadataIdSelector.atom),
    ).toBeUndefined();
  });

  it('should index the sidebar visibility of the current user by object metadata id', () => {
    const store = createStore();

    store.set(
      currentUserWorkspaceState.atom,
      buildCurrentUserWorkspace([
        { objectMetadataId: 'company-object-metadata-id', showInSidebar: true },
        { objectMetadataId: 'person-object-metadata-id', showInSidebar: false },
      ]),
    );

    expect(
      store.get(objectShowInSidebarByObjectMetadataIdSelector.atom),
    ).toEqual({
      'company-object-metadata-id': true,
      'person-object-metadata-id': false,
    });
  });

  it('should be an empty map once loaded without any object', () => {
    const store = createStore();

    store.set(currentUserWorkspaceState.atom, buildCurrentUserWorkspace([]));

    expect(
      store.get(objectShowInSidebarByObjectMetadataIdSelector.atom),
    ).toEqual({});
  });

  it('should keep the same map when only the permission flags change', () => {
    const store = createStore();

    store.set(
      currentUserWorkspaceState.atom,
      buildCurrentUserWorkspace([
        { objectMetadataId: 'company-object-metadata-id', showInSidebar: true },
      ]),
    );

    const initialObjectShowInSidebarByObjectMetadataId = store.get(
      objectShowInSidebarByObjectMetadataIdSelector.atom,
    );

    store.set(currentUserWorkspaceState.atom, {
      ...buildCurrentUserWorkspace([
        { objectMetadataId: 'company-object-metadata-id', showInSidebar: true },
      ]),
      permissionFlags: [PermissionFlagType.DATA_MODEL],
    });

    expect(store.get(objectShowInSidebarByObjectMetadataIdSelector.atom)).toBe(
      initialObjectShowInSidebarByObjectMetadataId,
    );
  });
});
