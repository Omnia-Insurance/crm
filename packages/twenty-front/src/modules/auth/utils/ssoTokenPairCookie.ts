import { isDefined } from 'twenty-shared/utils';

import { deriveCookieDomain } from '@/auth/states/tokenPairState';
import { type AuthTokenPair } from '~/generated-metadata/graphql';
import { cookieStorage } from '~/utils/cookie-storage';

// OMNIA-CUSTOM: cross-app SSO transport. Mirror the auth token into a
// parent-domain 'tokenPair' cookie so the sibling omniaagent.com dashboard can
// bootstrap its session from it. This mirror is WRITE-ONLY: CRM core auth keeps
// reading the token exclusively from localStorage (apollo/utils/getTokenPair) —
// this cookie is never a read source. It is written on login AND on every silent
// token refresh (apollo onTokenPairChange) so the sibling never verifies a
// stale/expired token, and cleared on logout and unauthenticated errors. It only
// writes on real *.omniaagent.com hosts (deriveCookieDomain returns a parent
// domain) and no-ops on localhost/IPs/apex, so local dev and core auth are
// unaffected.
export const SSO_TOKEN_PAIR_COOKIE_KEY = 'tokenPair';

export const writeSsoTokenPairCookie = (tokens: AuthTokenPair) => {
  const cookieDomain = deriveCookieDomain();
  if (!isDefined(cookieDomain)) return;

  cookieStorage.setItem(SSO_TOKEN_PAIR_COOKIE_KEY, JSON.stringify(tokens), {
    domain: cookieDomain,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
};

export const clearSsoTokenPairCookie = () => {
  const cookieDomain = deriveCookieDomain();
  if (!isDefined(cookieDomain)) return;

  cookieStorage.removeItem(SSO_TOKEN_PAIR_COOKIE_KEY, {
    domain: cookieDomain,
    path: '/',
  });
};
