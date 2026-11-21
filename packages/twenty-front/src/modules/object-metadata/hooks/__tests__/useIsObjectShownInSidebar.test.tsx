import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import {
  type CurrentUserWorkspace,
  currentUserWorkspaceState,
} from '@/auth/states/currentUserWorkspaceState';
import { useIsObjectShownInSidebar } from '@/object-metadata/hooks/useIsObjectShownInSidebar';

const COMPANY_OBJECT_METADATA_ID = 'company-object-metadata-id';

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

const renderIsCompanyShownInSidebar = (
  currentUserWorkspace: CurrentUserWorkspace | null,
) => {
  const store = createStore();

  store.set(currentUserWorkspaceState.atom, currentUserWorkspace);

  const { result } = renderHook(
    () => useIsObjectShownInSidebar(COMPANY_OBJECT_METADATA_ID),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    },
  );

  return { result, store };
};

describe('useIsObjectShownInSidebar', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('should show an object whose entry is true', () => {
    const { result } = renderIsCompanyShownInSidebar(
      buildCurrentUserWorkspace([
        { objectMetadataId: COMPANY_OBJECT_METADATA_ID, showInSidebar: true },
      ]),
    );

    expect(result.current).toBe(true);
  });

  it('should hide an object whose entry is false', () => {
    const { result } = renderIsCompanyShownInSidebar(
      buildCurrentUserWorkspace([
        { objectMetadataId: COMPANY_OBJECT_METADATA_ID, showInSidebar: false },
      ]),
    );

    expect(result.current).toBe(false);
  });

  it('should hide an object that has no entry', () => {
    const { result } = renderIsCompanyShownInSidebar(
      buildCurrentUserWorkspace([
        { objectMetadataId: 'person-object-metadata-id', showInSidebar: true },
      ]),
    );

    expect(result.current).toBe(false);
  });

  it('should hide the object while the current user workspace is not loaded', () => {
    const { result } = renderIsCompanyShownInSidebar(null);

    expect(result.current).toBe(false);
  });

  it('should hide the object when the current user workspace was persisted without the sidebar visibility', () => {
    const { result } = renderIsCompanyShownInSidebar(
      CURRENT_USER_WORKSPACE_WITHOUT_SIDEBAR_VISIBILITY,
    );

    expect(result.current).toBe(false);
  });

  it('should show the object once the sidebar visibility loads', () => {
    const { result, store } = renderIsCompanyShownInSidebar(
      CURRENT_USER_WORKSPACE_WITHOUT_SIDEBAR_VISIBILITY,
    );

    act(() => {
      store.set(
        currentUserWorkspaceState.atom,
        buildCurrentUserWorkspace([
          { objectMetadataId: COMPANY_OBJECT_METADATA_ID, showInSidebar: true },
        ]),
      );
    });

    expect(result.current).toBe(true);
  });
});
