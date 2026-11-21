import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { AppPath } from 'twenty-shared/types';
import { SOURCE_LOCALE } from 'twenty-shared/translations';

import { useRefreshOmniaSiblingSession } from '@/auth/hooks/useRefreshOmniaSiblingSession';
import { useRedirectToTrustedExternalReturnUrl } from '@/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl';
import { assignWindowLocation } from '@/auth/sign-in-up/utils/assignWindowLocation';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

jest.mock('@/auth/hooks/useRefreshOmniaSiblingSession', () => ({
  useRefreshOmniaSiblingSession: jest.fn(),
}));

jest.mock('@/auth/sign-in-up/utils/assignWindowLocation', () => ({
  assignWindowLocation: jest.fn(),
}));

const mockNavigate = jest.fn();

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));

const mockEnqueueToast = jest.fn();

jest.mock('twenty-ui/components/feedback', () => ({
  ...jest.requireActual('twenty-ui/components/feedback'),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

dynamicActivate(SOURCE_LOCALE);

// jsdom serves the page from http://localhost, so a trusted https sibling is https://localhost.
const DASHBOARD_URL = 'https://localhost/retention?agent=1';

const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={jotaiStore}>
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  </JotaiProvider>
);

const renderRedirectHook = () =>
  renderHook(() => useRedirectToTrustedExternalReturnUrl(), {
    wrapper: Wrapper,
  });

const createDeferred = <TValue,>() => {
  let resolve: (value: TValue) => void = () => {};
  const promise = new Promise<TValue>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

describe('useRedirectToTrustedExternalReturnUrl', () => {
  const refreshOmniaSiblingSession = jest.fn<Promise<boolean>, []>();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    resetJotaiStore();
    jotaiStore.set(isCookieAuthActiveState.atom, true);
    refreshOmniaSiblingSession.mockResolvedValue(true);
    jest
      .mocked(useRefreshOmniaSiblingSession)
      .mockReturnValue({ refreshOmniaSiblingSession });
    window.history.replaceState({}, '', '/');
  });

  it('refreshes the sibling session before leaving for the trusted URL', async () => {
    const refresh = createDeferred<boolean>();

    refreshOmniaSiblingSession.mockReturnValueOnce(refresh.promise);

    const { result } = renderRedirectHook();

    let redirectPromise: Promise<boolean> = Promise.resolve(false);

    act(() => {
      redirectPromise =
        result.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL);
    });

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
    expect(assignWindowLocation).not.toHaveBeenCalled();

    await act(async () => {
      refresh.resolve(true);
      await expect(redirectPromise).resolves.toBe(true);
    });

    expect(assignWindowLocation).toHaveBeenCalledWith(DASHBOARD_URL);
  });

  it('reads the trusted URL from the query when none is passed', async () => {
    window.history.replaceState(
      {},
      '',
      `/welcome?postSignInRedirect=${encodeURIComponent(DASHBOARD_URL)}`,
    );

    const { result } = renderRedirectHook();

    await act(async () => {
      await result.current.redirectToTrustedExternalReturnUrl();
    });

    expect(assignWindowLocation).toHaveBeenCalledWith(DASHBOARD_URL);
  });

  it('stays in the CRM with an error when the refresh fails', async () => {
    refreshOmniaSiblingSession.mockResolvedValueOnce(false);
    window.history.replaceState(
      {},
      '',
      `/welcome?returnToPath=${encodeURIComponent(DASHBOARD_URL)}`,
    );

    const { result } = renderRedirectHook();

    await act(async () => {
      await expect(
        result.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL),
      ).resolves.toBe(false);
    });

    expect(assignWindowLocation).not.toHaveBeenCalled();
    expect(mockEnqueueToast).toHaveBeenCalledWith({
      status: 'error',
      children: 'Sign-in to localhost failed',
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      AppPath.Index,
      undefined,
      undefined,
      { replace: true },
    );
  });

  it('runs one redirect at a time across callers', async () => {
    const refresh = createDeferred<boolean>();

    refreshOmniaSiblingSession.mockReturnValueOnce(refresh.promise);

    const { result: firstCaller } = renderRedirectHook();
    const { result: secondCaller } = renderRedirectHook();

    let firstRedirect: Promise<boolean> = Promise.resolve(false);

    act(() => {
      firstRedirect =
        firstCaller.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL);
    });

    await act(async () => {
      await expect(
        secondCaller.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL),
      ).resolves.toBe(false);
    });

    await act(async () => {
      refresh.resolve(true);
      await firstRedirect;
    });

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
    expect(assignWindowLocation).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a session', async () => {
    jotaiStore.set(isCookieAuthActiveState.atom, false);

    const { result } = renderRedirectHook();

    await act(async () => {
      await expect(
        result.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL),
      ).resolves.toBe(false);
    });

    expect(refreshOmniaSiblingSession).not.toHaveBeenCalled();
    expect(assignWindowLocation).not.toHaveBeenCalled();
  });

  it.each([
    ['an http URL', 'http://localhost/retention'],
    ['an untrusted host', 'https://evil.example.com/retention'],
    // oxlint-disable-next-line no-script-url
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('never leaves for %s', async (_description, returnUrl) => {
    const { result } = renderRedirectHook();

    await act(async () => {
      await result.current.redirectToTrustedExternalReturnUrl(returnUrl);
    });

    expect(refreshOmniaSiblingSession).not.toHaveBeenCalled();
    expect(assignWindowLocation).not.toHaveBeenCalled();
  });

  it('keeps the user in the CRM when the sibling app sends them straight back', async () => {
    const { result: firstPage } = renderRedirectHook();

    await act(async () => {
      await firstPage.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL);
    });

    expect(assignWindowLocation).toHaveBeenCalledTimes(1);

    resetJotaiStore();
    jotaiStore.set(isCookieAuthActiveState.atom, true);

    const { result: pageAfterBounce } = renderRedirectHook();

    await act(async () => {
      await expect(
        pageAfterBounce.current.redirectToTrustedExternalReturnUrl(
          DASHBOARD_URL,
        ),
      ).resolves.toBe(false);
    });

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(1);
    expect(assignWindowLocation).toHaveBeenCalledTimes(1);
    expect(mockEnqueueToast).toHaveBeenCalledWith({
      status: 'error',
      children: 'Sign-in to localhost failed',
    });
  });

  it('retries after a stale persisted session is signed out', async () => {
    refreshOmniaSiblingSession.mockImplementationOnce(async () => {
      jotaiStore.set(isCookieAuthActiveState.atom, false);

      return false;
    });

    const { result } = renderRedirectHook();

    await act(async () => {
      await result.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL);
    });

    expect(mockEnqueueToast).not.toHaveBeenCalled();
    expect(assignWindowLocation).not.toHaveBeenCalled();

    jotaiStore.set(isCookieAuthActiveState.atom, true);

    await act(async () => {
      await result.current.redirectToTrustedExternalReturnUrl(DASHBOARD_URL);
    });

    expect(refreshOmniaSiblingSession).toHaveBeenCalledTimes(2);
    expect(assignWindowLocation).toHaveBeenCalledWith(DASHBOARD_URL);
  });
});
