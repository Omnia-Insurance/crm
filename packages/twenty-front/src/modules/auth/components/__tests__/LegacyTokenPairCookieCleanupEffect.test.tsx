/**
 * @jest-environment-options {"url": "https://crm.omniaagent.com/"}
 */
import { render } from '@testing-library/react';

import { LegacyTokenPairCookieCleanupEffect } from '@/auth/components/LegacyTokenPairCookieCleanupEffect';
import { cookieStorage } from '~/utils/cookie-storage';

const mockDeriveTrustedParentDomain = jest.fn();

jest.mock('twenty-shared/utils', () => {
  const actual = jest.requireActual('twenty-shared/utils');

  return {
    ...actual,
    deriveTrustedParentDomain: (frontendUrl: string) =>
      mockDeriveTrustedParentDomain(frontendUrl),
  };
});

const EXPIRED = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';

// Written exactly as the v2.6 bundle stored the token pair.
const seedLegacyTokenPairCookies = () => {
  document.cookie =
    'tokenPair=parent-domain; domain=.omniaagent.com; path=/; secure';
  document.cookie = 'tokenPair=host-only; path=/; secure';
};

const expireCookies = () => {
  document.cookie = `tokenPair=; domain=.omniaagent.com; path=/; ${EXPIRED}`;
  document.cookie = `tokenPair=; path=/; ${EXPIRED}`;
  document.cookie = `partner=; path=/; ${EXPIRED}`;
};

describe('LegacyTokenPairCookieCleanupEffect', () => {
  beforeEach(() => {
    const { deriveTrustedParentDomain } = jest.requireActual(
      'twenty-shared/utils',
    );

    mockDeriveTrustedParentDomain.mockImplementation(deriveTrustedParentDomain);
    expireCookies();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should remove the parent-domain and host-only tokenPair cookies', () => {
    seedLegacyTokenPairCookies();
    document.cookie = 'partner=affiliate; path=/';

    expect(document.cookie).toContain('tokenPair=parent-domain');
    expect(document.cookie).toContain('tokenPair=host-only');

    render(<LegacyTokenPairCookieCleanupEffect />);

    expect(document.cookie).not.toContain('tokenPair');
    expect(document.cookie).toContain('partner=affiliate');
  });

  it('should remove the legacy token pair from localStorage', () => {
    localStorage.setItem('tokenPair', '{"refreshToken":{}}');
    localStorage.setItem('tokenPairState', '{"refreshToken":{}}');
    localStorage.setItem('locale', '"en"');

    render(<LegacyTokenPairCookieCleanupEffect />);

    expect(localStorage.getItem('tokenPair')).toBeNull();
    expect(localStorage.getItem('tokenPairState')).toBeNull();
    expect(localStorage.getItem('locale')).toBe('"en"');
  });

  it('should remove the admin token pair a v2.6 impersonating tab parked in sessionStorage', () => {
    sessionStorage.setItem(
      'impersonation_original_session',
      JSON.stringify({
        tokenPair: {
          accessOrWorkspaceAgnosticToken: { token: 'admin-access-token' },
          refreshToken: { token: 'admin-refresh-token' },
        },
        returnPath: '/objects/leads',
      }),
    );

    render(<LegacyTokenPairCookieCleanupEffect />);

    expect(sessionStorage.getItem('impersonation_original_session')).toBeNull();
  });

  it('should keep the return path a v2.58 impersonation stores', () => {
    const storedSession = JSON.stringify({ returnPath: '/objects/leads' });

    sessionStorage.setItem('impersonation_original_session', storedSession);

    render(<LegacyTokenPairCookieCleanupEffect />);

    expect(sessionStorage.getItem('impersonation_original_session')).toBe(
      storedSession,
    );
  });

  it('should only remove the host-only cookie without a parent domain (localhost, IPs, apex)', () => {
    mockDeriveTrustedParentDomain.mockReturnValue(null);
    const removeItemSpy = jest.spyOn(cookieStorage, 'removeItem');

    seedLegacyTokenPairCookies();

    render(<LegacyTokenPairCookieCleanupEffect />);

    expect(removeItemSpy).toHaveBeenCalledTimes(1);
    expect(removeItemSpy).toHaveBeenCalledWith('tokenPair');
    expect(document.cookie).toContain('tokenPair=parent-domain');
    expect(document.cookie).not.toContain('tokenPair=host-only');
  });

  it('should never throw when cookies and storage are unavailable', () => {
    jest.spyOn(cookieStorage, 'removeItem').mockImplementation(() => {
      throw new Error('Cookies are unavailable');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage is unavailable');
    });
    sessionStorage.setItem(
      'impersonation_original_session',
      JSON.stringify({ tokenPair: {}, returnPath: '/' }),
    );

    expect(() => render(<LegacyTokenPairCookieCleanupEffect />)).not.toThrow();
  });
});
