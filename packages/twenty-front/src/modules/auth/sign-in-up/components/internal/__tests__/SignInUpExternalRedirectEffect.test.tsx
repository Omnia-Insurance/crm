import { render } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import { StrictMode } from 'react';

import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { SignInUpExternalRedirectEffect } from '@/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect';
import { useRedirectToTrustedExternalReturnUrl } from '@/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';

const mockSignOut = jest.fn();

jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

jest.mock('@/auth/hooks/useIsLogged', () => ({
  useIsLogged: jest.fn(),
}));

jest.mock(
  '@/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl',
  () => ({
    useRedirectToTrustedExternalReturnUrl: jest.fn(),
  }),
);

// jsdom serves the page from http://localhost, so a trusted https sibling is https://localhost.
const DASHBOARD_URL = 'https://localhost/retention';

const visitWelcome = (searchParams: Record<string, string>) => {
  window.history.replaceState(
    {},
    '',
    `/welcome?${new URLSearchParams(searchParams).toString()}`,
  );
};

const openedFrom = (referrer: string) => {
  Object.defineProperty(document, 'referrer', {
    value: referrer,
    configurable: true,
  });
};

describe('SignInUpExternalRedirectEffect', () => {
  const redirectToTrustedExternalReturnUrl = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getDefaultStore().set(isPendingServerSignOutState.atom, false);
    openedFrom('https://localhost/');
    visitWelcome({ postSignInRedirect: DASHBOARD_URL });
    redirectToTrustedExternalReturnUrl.mockResolvedValue(false);
    // As useAuth's signOut does before its first await.
    mockSignOut.mockImplementation(async () => {
      getDefaultStore().set(isPendingServerSignOutState.atom, true);
    });
    jest
      .mocked(useRedirectToTrustedExternalReturnUrl)
      .mockReturnValue({ redirectToTrustedExternalReturnUrl });
  });

  afterAll(() => {
    getDefaultStore().set(isPendingServerSignOutState.atom, false);
    window.history.replaceState({}, '', '/');
    Reflect.deleteProperty(document, 'referrer');
  });

  it('sends a signed-in user on to the trusted URL', () => {
    jest.mocked(useIsLogged).mockReturnValue(true);

    render(<SignInUpExternalRedirectEffect />);

    expect(redirectToTrustedExternalReturnUrl).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('waits for sign-in before redirecting', () => {
    jest.mocked(useIsLogged).mockReturnValue(false);

    const { rerender } = render(<SignInUpExternalRedirectEffect />);

    expect(redirectToTrustedExternalReturnUrl).not.toHaveBeenCalled();

    jest.mocked(useIsLogged).mockReturnValue(true);
    rerender(<SignInUpExternalRedirectEffect />);

    expect(redirectToTrustedExternalReturnUrl).toHaveBeenCalledTimes(1);
  });

  it('ends the CRM session once, without going back, when the dashboard signs out', () => {
    visitWelcome({ omniaSignOut: '1', postSignInRedirect: DASHBOARD_URL });
    jest.mocked(useIsLogged).mockReturnValue(true);

    // StrictMode runs the effect twice, as the app does in development.
    render(
      <StrictMode>
        <SignInUpExternalRedirectEffect />
      </StrictMode>,
    );

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(redirectToTrustedExternalReturnUrl).not.toHaveBeenCalled();
    expect(window.location.search).toBe(
      `?${new URLSearchParams({ postSignInRedirect: DASHBOARD_URL }).toString()}`,
    );
  });

  it('signs out once even when the page remounts', () => {
    visitWelcome({ omniaSignOut: '1', postSignInRedirect: DASHBOARD_URL });
    jest.mocked(useIsLogged).mockReturnValue(true);

    const { unmount } = render(<SignInUpExternalRedirectEffect />);

    unmount();
    render(<SignInUpExternalRedirectEffect />);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('still asks the server to end its session when the CRM shows signed out', () => {
    visitWelcome({ omniaSignOut: '1', postSignInRedirect: DASHBOARD_URL });
    jest.mocked(useIsLogged).mockReturnValue(false);

    render(<SignInUpExternalRedirectEffect />);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when a link from another site carries the sign-out flag', () => {
    openedFrom('https://evil.example.com/');
    visitWelcome({ omniaSignOut: '1', postSignInRedirect: DASHBOARD_URL });
    jest.mocked(useIsLogged).mockReturnValue(true);

    render(<SignInUpExternalRedirectEffect />);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(redirectToTrustedExternalReturnUrl).toHaveBeenCalledTimes(1);
  });

  it('ignores the sign-out flag without a trusted return URL', () => {
    visitWelcome({ omniaSignOut: '1' });
    jest.mocked(useIsLogged).mockReturnValue(true);

    render(<SignInUpExternalRedirectEffect />);

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('does not leave for the sibling app while a sign-out is under way', () => {
    getDefaultStore().set(isPendingServerSignOutState.atom, true);
    jest.mocked(useIsLogged).mockReturnValue(true);

    render(<SignInUpExternalRedirectEffect />);

    expect(redirectToTrustedExternalReturnUrl).not.toHaveBeenCalled();
  });
});
