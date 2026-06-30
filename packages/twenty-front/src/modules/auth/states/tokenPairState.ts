import { isValidAuthTokenPair } from '@/apollo/utils/isValidAuthTokenPair';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
import { type AuthTokenPair } from '~/generated-metadata/graphql';

export const TOKEN_PAIR_LOCAL_STORAGE_KEY = 'tokenPairState';

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
