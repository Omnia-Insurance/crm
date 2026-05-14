import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useHasAccessTokenPair } from '@/auth/hooks/useHasAccessTokenPair';
import { useVerifyLogin } from '@/auth/hooks/useVerifyLogin';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { AppPath } from 'twenty-shared/types';
import { isDefined, isExternalRedirectTrusted } from 'twenty-shared/utils';
import { useNavigateApp } from '~/hooks/useNavigateApp';

export const VerifyLoginTokenEffect = () => {
  const [searchParams] = useSearchParams();
  const loginToken = searchParams.get('loginToken');
  // OMNIA-CUSTOM: trusted external destination carried through OAuth → /verify
  const postSignInRedirect = searchParams.get('postSignInRedirect');

  const hasAccessTokenPair = useHasAccessTokenPair();
  const navigate = useNavigateApp();
  const { verifyLoginToken } = useVerifyLogin();

  const { isSaved: clientConfigLoaded } = useAtomStateValue(
    clientConfigApiStatusState,
  );

  useEffect(() => {
    if (!clientConfigLoaded) {
      return;
    }

    if (isDefined(loginToken)) {
      verifyLoginToken(loginToken);
    } else if (!hasAccessTokenPair) {
      navigate(AppPath.SignInUp);
    }
    // Verify only needs to run once at mount
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [clientConfigLoaded]);

  // OMNIA-CUSTOM: once verifyLoginToken has actually set the cookie (cookie
  // state goes from absent → present), bounce to a trusted external
  // postSignInRedirect if one was carried through. Gating on the reactive
  // cookie state means failed verifications never trigger the redirect.
  useEffect(() => {
    if (
      hasAccessTokenPair &&
      isDefined(postSignInRedirect) &&
      isExternalRedirectTrusted(postSignInRedirect, window.location.origin)
    ) {
      window.location.href = postSignInRedirect;
    }
  }, [hasAccessTokenPair, postSignInRedirect]);

  return <></>;
};
