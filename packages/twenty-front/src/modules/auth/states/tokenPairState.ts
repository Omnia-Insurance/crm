import { isValidAuthTokenPair } from '@/apollo/utils/isValidAuthTokenPair';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
import { type AuthTokenPair } from '~/generated-metadata/graphql';

export const TOKEN_PAIR_LOCAL_STORAGE_KEY = 'tokenPairState';

// OMNIA-CUSTOM: cross-app SSO transport helper. Derives the shared parent
// domain of the current hostname (e.g. crm.omniaagent.com -> '.omniaagent.com')
// so a sibling app (the omniaagent.com dashboard) can read a WRITE-ONLY mirror
// of the auth token from a parent-domain 'tokenPair' cookie. Returns undefined
// on localhost, IPs, and apex domains with no subdomain to strip, so no
// cross-domain cookie is written there. Core auth still reads ONLY from
// localStorage (apollo/utils/getTokenPair) — this cookie is never a read source.
const IP_HOSTNAME_REGEX = /^[\d.]+$/;

export const deriveCookieDomain = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const { hostname } = window.location;
  if (hostname === 'localhost' || IP_HOSTNAME_REGEX.test(hostname))
    return undefined;
  const parts = hostname.split('.');
  if (parts.length < 3) return undefined;
  return '.' + parts.slice(1).join('.');
};

// NOTE (Omnia): upstream (#21507) moved the auth token from a cross-subdomain
// cookie to localStorage, and the Apollo token reader (apollo/utils/getTokenPair)
// reads localStorage directly. We follow upstream here — a cookie override breaks
// core auth. The omniaagent.com dashboard cross-subdomain SSO that previously
// relied on the shared cookie must be re-solved separately (e.g. mirror the token
// into a shared parent-domain cookie alongside localStorage), NOT by overriding
// upstream's auth flow. See upstream-merge-2026-06-30-followups.md.
export const tokenPairState = createAtomState<AuthTokenPair | null>({
  key: TOKEN_PAIR_LOCAL_STORAGE_KEY,
  defaultValue: null,
  useLocalStorage: true,
  localStorageOptions: { getOnInit: true },
  validateInitFn: (payload) => isValidAuthTokenPair(payload),
});
