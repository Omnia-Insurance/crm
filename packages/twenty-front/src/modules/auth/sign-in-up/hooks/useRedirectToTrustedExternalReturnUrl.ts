import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { useRefreshOmniaSiblingSession } from '@/auth/hooks/useRefreshOmniaSiblingSession';
import { isTrustedExternalRedirectInProgressState } from '@/auth/sign-in-up/states/isTrustedExternalRedirectInProgressState';
import { assignWindowLocation } from '@/auth/sign-in-up/utils/assignWindowLocation';
import { getTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/getTrustedExternalReturnUrl';
import { isTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/isTrustedExternalReturnUrl';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { useNavigateApp } from '~/hooks/useNavigateApp';

const LAST_REDIRECT_AT_SESSION_STORAGE_KEY = 'omnia.trustedExternalRedirectAt';
// A sibling app that rejects the fresh cookie sends the user straight back; leave once per window.
const REDIRECT_LOOP_WINDOW_MS = 30_000;

const hasRedirectedWithinLoopWindow = (): boolean => {
  try {
    const lastRedirectAt = Number(
      sessionStorage.getItem(LAST_REDIRECT_AT_SESSION_STORAGE_KEY),
    );

    return Date.now() - lastRedirectAt < REDIRECT_LOOP_WINDOW_MS;
  } catch {
    return false;
  }
};

const recordRedirect = () => {
  try {
    sessionStorage.setItem(
      LAST_REDIRECT_AT_SESSION_STORAGE_KEY,
      String(Date.now()),
    );
  } catch {}
};

// Call once a session is confirmed. Resolves true when the page is leaving for the sibling URL.
export const useRedirectToTrustedExternalReturnUrl = () => {
  const store = useStore();
  const { refreshOmniaSiblingSession } = useRefreshOmniaSiblingSession();
  const { enqueueToast } = useToast();
  const navigate = useNavigateApp();
  const { t } = useLingui();

  const redirectToTrustedExternalReturnUrl = useCallback(
    async (
      trustedExternalReturnUrl: string | null = getTrustedExternalReturnUrl(),
    ): Promise<boolean> => {
      if (
        !isNonEmptyString(trustedExternalReturnUrl) ||
        !isTrustedExternalReturnUrl(trustedExternalReturnUrl) ||
        !store.get(isCookieAuthActiveState.atom) ||
        store.get(isTrustedExternalRedirectInProgressState.atom)
      ) {
        return false;
      }

      store.set(isTrustedExternalRedirectInProgressState.atom, true);

      // Leaving with a stale sibling cookie would bounce the user straight back here.
      const isRefreshed =
        !hasRedirectedWithinLoopWindow() &&
        (await refreshOmniaSiblingSession());

      if (isRefreshed) {
        recordRedirect();
        assignWindowLocation(trustedExternalReturnUrl);

        return true;
      }

      store.set(isTrustedExternalRedirectInProgressState.atom, false);

      // The persisted session was stale and is now signed out: the next sign-in retries.
      if (!store.get(isCookieAuthActiveState.atom)) {
        return false;
      }

      const targetHostname = new URL(trustedExternalReturnUrl).hostname;

      enqueueToast({
        status: 'error',
        children: t`Sign-in to ${targetHostname} failed`,
      });

      // The landing redirect waits while the query holds a trusted sibling URL.
      if (isDefined(getTrustedExternalReturnUrl())) {
        navigate(AppPath.Index, undefined, undefined, { replace: true });
      }

      return false;
    },
    [store, refreshOmniaSiblingSession, enqueueToast, navigate, t],
  );

  return { redirectToTrustedExternalReturnUrl };
};
