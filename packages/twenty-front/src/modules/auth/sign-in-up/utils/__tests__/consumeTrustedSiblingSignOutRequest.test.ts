import { consumeTrustedSiblingSignOutRequest } from '@/auth/sign-in-up/utils/consumeTrustedSiblingSignOutRequest';

// jsdom serves the page from http://localhost, so a trusted https sibling is https://localhost.
const DASHBOARD_URL = 'https://localhost/retention';

const visitWelcome = (search: string) => {
  window.history.replaceState({ key: 'router-state' }, '', `/welcome${search}`);
};

const openedFrom = (referrer: string) => {
  Object.defineProperty(document, 'referrer', {
    value: referrer,
    configurable: true,
  });
};

describe('consumeTrustedSiblingSignOutRequest', () => {
  beforeEach(() => {
    openedFrom('https://localhost/');
  });

  afterAll(() => {
    window.history.replaceState({}, '', '/');
    Reflect.deleteProperty(document, 'referrer');
  });

  it('consumes the flag once and keeps the rest of the URL', () => {
    visitWelcome(
      `?omniaSignOut=1&postSignInRedirect=${encodeURIComponent(DASHBOARD_URL)}#section`,
    );

    expect(consumeTrustedSiblingSignOutRequest()).toBe(true);
    expect(window.location.pathname).toBe('/welcome');
    expect(
      new URLSearchParams(window.location.search).has('omniaSignOut'),
    ).toBe(false);
    expect(
      new URLSearchParams(window.location.search).get('postSignInRedirect'),
    ).toBe(DASHBOARD_URL);
    expect(window.location.hash).toBe('#section');
    expect(window.history.state).toEqual({ key: 'router-state' });

    expect(consumeTrustedSiblingSignOutRequest()).toBe(false);
  });

  it('leaves a URL without a trusted sign-out request untouched', () => {
    visitWelcome('?omniaSignOut=1');

    expect(consumeTrustedSiblingSignOutRequest()).toBe(false);
    expect(window.location.search).toBe('?omniaSignOut=1');
  });

  it('keeps a session that a link from another site tries to end', () => {
    openedFrom('https://evil.example.com/');
    visitWelcome(
      `?omniaSignOut=1&postSignInRedirect=${encodeURIComponent(DASHBOARD_URL)}`,
    );

    expect(consumeTrustedSiblingSignOutRequest()).toBe(false);
    expect(
      new URLSearchParams(window.location.search).get('omniaSignOut'),
    ).toBe('1');
  });
});
