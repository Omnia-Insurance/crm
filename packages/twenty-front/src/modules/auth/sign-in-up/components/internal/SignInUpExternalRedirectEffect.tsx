import { useStore } from 'jotai';
import { useEffect } from 'react';

import { useAuth } from '@/auth/hooks/useAuth';
import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useRedirectToTrustedExternalReturnUrl } from '@/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl';
import { consumeTrustedSiblingSignOutRequest } from '@/auth/sign-in-up/utils/consumeTrustedSiblingSignOutRequest';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';

// The omniaagent.com dashboard sends users here when its cookie expires; a signed-in user goes straight back.
// Its Sign out lands here too, flagged: only the CRM can revoke the session, so that ends it (single logout).
export const SignInUpExternalRedirectEffect = () => {
  const store = useStore();
  const isLogged = useIsLogged();
  const { signOut } = useAuth();
  const { redirectToTrustedExternalReturnUrl } =
    useRedirectToTrustedExternalReturnUrl();

  useEffect(() => {
    // Even when the CRM shows signed out: the server may still hold a session for this browser.
    if (consumeTrustedSiblingSignOutRequest()) {
      void signOut();

      return;
    }

    // signOut raises this synchronously; leaving for the sibling app now would race it.
    if (!isLogged || store.get(isPendingServerSignOutState.atom)) {
      return;
    }

    void redirectToTrustedExternalReturnUrl();
  }, [isLogged, redirectToTrustedExternalReturnUrl, signOut, store]);

  return <></>;
};
