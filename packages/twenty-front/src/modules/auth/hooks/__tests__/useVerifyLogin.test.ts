import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';

import { useAuth } from '@/auth/hooks/useAuth';
import { useVerifyLogin } from '@/auth/hooks/useVerifyLogin';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { AppPath } from 'twenty-shared/types';
import { useNavigateApp } from '~/hooks/useNavigateApp';

import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

jest.mock('../useAuth', () => ({
  useAuth: jest.fn(),
}));

const mockEnqueueToast = jest.fn();

jest.mock('twenty-ui/components/feedback', () => ({
  ...jest.requireActual('twenty-ui/components/feedback'),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: jest.fn(),
}));

// OMNIA-CUSTOM: trusted sibling redirect after /verify (omniaagent.com dashboard)
const mockRedirectToTrustedExternalReturnUrl = jest.fn();

jest.mock(
  '@/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl',
  () => ({
    useRedirectToTrustedExternalReturnUrl: () => ({
      redirectToTrustedExternalReturnUrl:
        mockRedirectToTrustedExternalReturnUrl,
    }),
  }),
);

dynamicActivate(SOURCE_LOCALE);

const renderHooks = () => {
  const { result } = renderHook(() => useVerifyLogin(), {
    wrapper: ({ children }) =>
      JotaiProvider({
        store: jotaiStore,
        children: I18nProvider({ i18n, children }),
      }),
  });
  return { result };
};

describe('useVerifyLogin', () => {
  const mockGetAuthTokensFromLoginToken = jest.fn();

  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    resetJotaiStore();

    (useAuth as jest.Mock).mockReturnValue({
      getAuthTokensFromLoginToken: mockGetAuthTokensFromLoginToken,
    });

    (useNavigateApp as jest.Mock).mockReturnValue(mockNavigate);
  });

  it('should verify login token', async () => {
    const { result } = renderHooks();

    await result.current.verifyLoginToken('test-token');

    expect(mockGetAuthTokensFromLoginToken).toHaveBeenCalledWith('test-token');
  });

  it('should handle a non-GraphQL verification error', async () => {
    const error = new Error('Verification failed');
    mockGetAuthTokensFromLoginToken.mockRejectedValueOnce(error);

    const { result } = renderHooks();

    await result.current.verifyLoginToken('test-token');

    expect(mockEnqueueToast).toHaveBeenCalledWith({
      status: 'error',
      children: 'Authentication failed',
    });
    expect(mockNavigate).toHaveBeenCalledWith(AppPath.SignInUp);
  });

  it('should display the user-friendly GraphQL verification message', async () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Session could not be created',
          extensions: {
            userFriendlyMessage:
              'Your session has expired. Please sign in again.',
          },
        },
      ],
    });
    mockGetAuthTokensFromLoginToken.mockRejectedValueOnce(error);

    const { result } = renderHooks();

    await result.current.verifyLoginToken('test-token');

    expect(mockEnqueueToast).toHaveBeenCalledWith({
      status: 'error',
      children: 'Your session has expired. Please sign in again.',
    });
    expect(mockNavigate).toHaveBeenCalledWith(AppPath.SignInUp);
  });

  // OMNIA-CUSTOM: trusted sibling redirect after /verify (omniaagent.com dashboard)
  describe('trusted external return URL', () => {
    const dashboardUrl = 'https://localhost/retention';

    beforeEach(() => {
      mockRedirectToTrustedExternalReturnUrl.mockResolvedValue(true);
      window.history.replaceState(
        {},
        '',
        `/verify?loginToken=test-token&returnToPath=${encodeURIComponent(dashboardUrl)}`,
      );
    });

    afterEach(() => {
      window.history.replaceState({}, '', '/');
    });

    it('redirects once the session exists, using the URL read before the swap', async () => {
      mockGetAuthTokensFromLoginToken.mockImplementationOnce(async () => {
        expect(mockRedirectToTrustedExternalReturnUrl).not.toHaveBeenCalled();
        window.history.replaceState({}, '', '/objects/people');
      });

      const { result } = renderHooks();

      await result.current.verifyLoginToken('test-token');

      expect(mockRedirectToTrustedExternalReturnUrl).toHaveBeenCalledWith(
        dashboardUrl,
      );
    });

    it('does not redirect when verification fails', async () => {
      mockGetAuthTokensFromLoginToken.mockRejectedValueOnce(
        new Error('Verification failed'),
      );

      const { result } = renderHooks();

      await result.current.verifyLoginToken('test-token');

      expect(mockRedirectToTrustedExternalReturnUrl).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(AppPath.SignInUp);
    });
  });
});
