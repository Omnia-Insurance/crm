import { act, render, renderHook } from '@testing-library/react';
import { getDefaultStore } from 'jotai';

import { OmniaSiblingSessionRefreshEffect } from '@/auth/effect-components/OmniaSiblingSessionRefreshEffect';
import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useRefreshOmniaSiblingSession } from '@/auth/hooks/useRefreshOmniaSiblingSession';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';

const mockRefreshOmniaSiblingSessionMutation = jest.fn();

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: () => [mockRefreshOmniaSiblingSessionMutation],
}));

jest.mock('@/auth/hooks/useIsLogged', () => ({
  useIsLogged: jest.fn(),
}));

jest.mock('@/auth/hooks/useRefreshOmniaSiblingSession', () => ({
  useRefreshOmniaSiblingSession: jest.fn(),
}));

const TEN_MINUTES_MS = 10 * 60 * 1000;

let visibilityState: DocumentVisibilityState = 'visible';

const setVisibilityState = (nextVisibilityState: DocumentVisibilityState) => {
  visibilityState = nextVisibilityState;

  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

const advanceTime = (milliseconds: number) => {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
};

describe('OmniaSiblingSessionRefreshEffect', () => {
  const refreshOmniaSiblingSession = jest.fn();

  beforeAll(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    visibilityState = 'visible';
    refreshOmniaSiblingSession.mockResolvedValue(true);
    jest.mocked(useIsLogged).mockReturnValue(true);
    jest
      .mocked(useRefreshOmniaSiblingSession)
      .mockReturnValue({ refreshOmniaSiblingSession });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    getDefaultStore().set(isPendingServerSignOutState.atom, false);
    window.history.replaceState({}, '', '/');
  });

  it('should not refresh while logged out', () => {
    jest.mocked(useIsLogged).mockReturnValue(false);

    render(<OmniaSiblingSessionRefreshEffect />);
    advanceTime(3 * TEN_MINUTES_MS);
    setVisibilityState('visible');

    expect(refreshOmniaSiblingSession).not.toHaveBeenCalled();
  });

  it('should refresh once on mount when logged in', () => {
    render(<OmniaSiblingSessionRefreshEffect />);

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
  });

  it('should refresh on login', () => {
    jest.mocked(useIsLogged).mockReturnValue(false);

    const { rerender } = render(<OmniaSiblingSessionRefreshEffect />);

    expect(refreshOmniaSiblingSession).not.toHaveBeenCalled();

    jest.mocked(useIsLogged).mockReturnValue(true);
    rerender(<OmniaSiblingSessionRefreshEffect />);

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
  });

  it('should refresh every 10 minutes while the tab is visible', () => {
    render(<OmniaSiblingSessionRefreshEffect />);

    advanceTime(TEN_MINUTES_MS - 1);
    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);

    advanceTime(1);
    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(2);

    advanceTime(TEN_MINUTES_MS);
    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(3);
  });

  it('should skip refreshes while hidden and catch up on becoming visible', () => {
    render(<OmniaSiblingSessionRefreshEffect />);

    setVisibilityState('hidden');
    advanceTime(2 * TEN_MINUTES_MS);

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);

    setVisibilityState('visible');

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(2);
  });

  it('should not refresh on becoming visible when the last refresh is recent', () => {
    render(<OmniaSiblingSessionRefreshEffect />);

    setVisibilityState('hidden');
    advanceTime(TEN_MINUTES_MS / 2);
    setVisibilityState('visible');

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
  });

  it('should stop refreshing on logout', () => {
    const { rerender } = render(<OmniaSiblingSessionRefreshEffect />);

    jest.mocked(useIsLogged).mockReturnValue(false);
    rerender(<OmniaSiblingSessionRefreshEffect />);

    advanceTime(3 * TEN_MINUTES_MS);
    setVisibilityState('hidden');
    setVisibilityState('visible');

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
  });

  it('should not refresh while a sign-out may not have reached the server', () => {
    getDefaultStore().set(isPendingServerSignOutState.atom, true);

    render(<OmniaSiblingSessionRefreshEffect />);
    advanceTime(TEN_MINUTES_MS);

    expect(refreshOmniaSiblingSession).not.toHaveBeenCalled();
  });

  // Answered after the sign-out, the refresh would re-create the cookie the sign-out cleared.
  it('should not refresh while the dashboard sign-out is being handled', () => {
    // The dashboard opens the page, so the referrer is the trusted sibling.
    Object.defineProperty(document, 'referrer', {
      value: 'https://localhost/',
      configurable: true,
    });
    window.history.replaceState(
      {},
      '',
      `/welcome?omniaSignOut=1&postSignInRedirect=${encodeURIComponent('https://localhost/retention')}`,
    );

    render(<OmniaSiblingSessionRefreshEffect />);

    expect(refreshOmniaSiblingSession).not.toHaveBeenCalled();

    Reflect.deleteProperty(document, 'referrer');
  });

  it('should stop refreshing on unmount', () => {
    const { unmount } = render(<OmniaSiblingSessionRefreshEffect />);

    unmount();

    advanceTime(3 * TEN_MINUTES_MS);
    setVisibilityState('hidden');
    setVisibilityState('visible');

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
  });
});

describe('useRefreshOmniaSiblingSession', () => {
  const { useRefreshOmniaSiblingSession: useActualRefreshOmniaSiblingSession } =
    jest.requireActual<{
      useRefreshOmniaSiblingSession: typeof useRefreshOmniaSiblingSession;
    }>('@/auth/hooks/useRefreshOmniaSiblingSession');

  const refreshWithMutationOutcome = async (
    mutationOutcome: () => Promise<unknown>,
  ) => {
    mockRefreshOmniaSiblingSessionMutation.mockImplementation(mutationOutcome);

    const { result } = renderHook(() => useActualRefreshOmniaSiblingSession());

    return result.current.refreshOmniaSiblingSession();
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve true when the server set the cookie', async () => {
    await expect(
      refreshWithMutationOutcome(() =>
        Promise.resolve({ data: { refreshOmniaSiblingSession: true } }),
      ),
    ).resolves.toBe(true);
  });

  it('should resolve false when the server did not confirm', async () => {
    await expect(
      refreshWithMutationOutcome(() =>
        Promise.resolve({ data: { refreshOmniaSiblingSession: false } }),
      ),
    ).resolves.toBe(false);

    await expect(
      refreshWithMutationOutcome(() => Promise.resolve({ data: undefined })),
    ).resolves.toBe(false);
  });

  it('should resolve false instead of throwing when the mutation fails', async () => {
    await expect(
      refreshWithMutationOutcome(() =>
        Promise.reject(new Error('Network request failed')),
      ),
    ).resolves.toBe(false);
  });
});
