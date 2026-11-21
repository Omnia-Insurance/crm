import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { objectShowInSidebarByObjectMetadataIdSelector } from '@/object-metadata/states/objectShowInSidebarByObjectMetadataIdSelector';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { mockedUserData } from '~/testing/mock-data/users';

const mockQuery = jest.fn();

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useApolloClient: () => ({ query: mockQuery }),
}));

const renderLoadCurrentUser = () => {
  const store = createStore();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  const { result } = renderHook(() => useLoadCurrentUser(), {
    wrapper: Wrapper,
  });

  return { result, store };
};

describe('useLoadCurrentUser', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('stores the sidebar visibility of the current user (contract C4)', async () => {
    const objectSidebarVisibility = [
      { objectMetadataId: 'policy-object-id', showInSidebar: true },
      { objectMetadataId: 'company-object-id', showInSidebar: false },
    ];

    mockQuery.mockResolvedValue({
      data: {
        currentUser: {
          ...mockedUserData,
          currentUserWorkspace: {
            ...mockedUserData.currentUserWorkspace,
            objectSidebarVisibility,
          },
        },
      },
    });

    const { result, store } = renderLoadCurrentUser();

    await act(async () => {
      await result.current.loadCurrentUser();
    });

    expect(
      store.get(objectShowInSidebarByObjectMetadataIdSelector.atom),
    ).toEqual({ 'policy-object-id': true, 'company-object-id': false });
  });
});
