import { useStore } from 'jotai';
import { useEffect } from 'react';

import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useRefreshOmniaSiblingSession } from '@/auth/hooks/useRefreshOmniaSiblingSession';
import { isTrustedSiblingSignOutRequest } from '@/auth/sign-in-up/utils/isTrustedSiblingSignOutRequest';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';

// Well inside the 30-minute token the dashboard cookie carries (OMNIA_SIBLING_SESSION_TOKEN_LIFETIME on the server).
const OMNIA_SIBLING_SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export const OmniaSiblingSessionRefreshEffect = () => {
  const store = useStore();
  const isLogged = useIsLogged();
  const { refreshOmniaSiblingSession } = useRefreshOmniaSiblingSession();

  useEffect(() => {
    if (!isLogged) {
      return;
    }

    let lastRefreshedAt = 0;

    const refresh = () => {
      // A refresh answered after the sign-out would re-create the cookie the sign-out cleared.
      if (
        store.get(isPendingServerSignOutState.atom) ||
        isTrustedSiblingSignOutRequest()
      ) {
        return;
      }

      lastRefreshedAt = Date.now();
      void refreshOmniaSiblingSession();
    };

    refresh();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }, OMNIA_SIBLING_SESSION_REFRESH_INTERVAL_MS);

    const refreshWhenVisibleAndStale = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastRefreshedAt >=
          OMNIA_SIBLING_SESSION_REFRESH_INTERVAL_MS
      ) {
        refresh();
      }
    };

    document.addEventListener('visibilitychange', refreshWhenVisibleAndStale);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(
        'visibilitychange',
        refreshWhenVisibleAndStale,
      );
    };
  }, [isLogged, refreshOmniaSiblingSession, store]);

  return null;
};
