import { isNull } from '@sniptt/guards';
import { useEffect } from 'react';
import {
  deriveTrustedParentDomain,
  isDefined,
  isPlainObject,
} from 'twenty-shared/utils';

import { safeRemoveLocalStorageItems } from '@/auth/utils/safeRemoveLocalStorageItems';
import { cookieStorage } from '~/utils/cookie-storage';

const LEGACY_TOKEN_PAIR_COOKIE_KEY = 'tokenPair';

const LEGACY_TOKEN_PAIR_LOCAL_STORAGE_KEYS = ['tokenPair', 'tokenPairState'];

// Reused by v2.58 for a returnPath only; v2.6 also parked the admin's full token pair in it.
const IMPERSONATION_SESSION_STORAGE_KEY = 'impersonation_original_session';

const removeLegacyImpersonationTokenPair = () => {
  try {
    const storedSession = sessionStorage.getItem(
      IMPERSONATION_SESSION_STORAGE_KEY,
    );

    if (isNull(storedSession)) {
      return;
    }

    const parsedSession: unknown = JSON.parse(storedSession);

    if (isPlainObject(parsedSession) && isDefined(parsedSession.tokenPair)) {
      sessionStorage.removeItem(IMPERSONATION_SESSION_STORAGE_KEY);
    }
  } catch {}
};

// The legacy JS-readable tokenPair cookie holds a 60-day refresh token. JS cannot
// touch the server's httpOnly tokenPair sibling cookie, so dashboard SSO is unaffected.
const removeLegacyTokenPairCredentials = () => {
  try {
    const parentDomain = deriveTrustedParentDomain(window.location.origin);

    if (isDefined(parentDomain)) {
      cookieStorage.removeItem(LEGACY_TOKEN_PAIR_COOKIE_KEY, {
        domain: parentDomain,
        path: '/',
      });
    }
  } catch {}

  try {
    cookieStorage.removeItem(LEGACY_TOKEN_PAIR_COOKIE_KEY);
  } catch {}

  safeRemoveLocalStorageItems(LEGACY_TOKEN_PAIR_LOCAL_STORAGE_KEYS);
  removeLegacyImpersonationTokenPair();
};

export const LegacyTokenPairCookieCleanupEffect = () => {
  useEffect(() => {
    removeLegacyTokenPairCredentials();
  }, []);

  return null;
};
