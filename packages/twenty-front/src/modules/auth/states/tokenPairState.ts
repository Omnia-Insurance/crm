import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
import { type AuthTokenPair } from '~/generated-metadata/graphql';

export const TOKEN_PAIR_LOCAL_STORAGE_KEY = 'tokenPairState';

// OMNIA-CUSTOM: scope auth cookie to the parent of the current hostname so it
// can be shared with sibling subdomains (e.g. omniaagent.com dashboard reading
// the cookie set by crm.omniaagent.com). Falls back to undefined (current host)
// on localhost, IPs, and apex domains with no subdomain to strip.
// NOTE: upstream moved tokenPair to localStorage (#21507); we intentionally keep
// the cookie because localStorage is origin-scoped and would break cross-subdomain auth.
const IP_HOSTNAME_REGEX = /^[\d.]+$/;

const deriveCookieDomain = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const { hostname } = window.location;
  if (hostname === 'localhost' || IP_HOSTNAME_REGEX.test(hostname))
    return undefined;
  const parts = hostname.split('.');
  if (parts.length < 3) return undefined;
  return '.' + parts.slice(1).join('.');
};

const cookieDomain = deriveCookieDomain();

export const tokenPairState = createAtomState<AuthTokenPair | null>({
  key: TOKEN_PAIR_LOCAL_STORAGE_KEY,
  defaultValue: null,
  useCookieStorage: {
    cookieKey: 'tokenPair',
    attributes: cookieDomain
      ? {
          domain: cookieDomain,
          secure: window.location.protocol === 'https:',
        }
      : undefined,
    legacyAttributesToRemove: cookieDomain ? [{}] : undefined,
    validateInitFn: (payload: AuthTokenPair) =>
      Boolean(payload['accessOrWorkspaceAgnosticToken']),
  },
});
