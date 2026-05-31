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
  // OMNIA-CUSTOM: returnToPath may be a trusted external destination carried
  // through OAuth. postSignInRedirect remains an input-only compatibility
  // fallback.
  const returnToPath =
    searchParams.get('returnToPath') ?? searchParams.get('postSignInRedirect');

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

  // OMNIA-CUSTOM: once verifyLoginToken has actually set the cookie, bounce to
  // a trusted absolute returnToPath if one was carried through. Local
  // returnToPath values are handled by the normal router flow.
  useEffect(() => {
    if (
      hasAccessTokenPair &&
      isDefined(returnToPath) &&
      isExternalRedirectTrusted(returnToPath, window.location.origin)
    ) {
      window.location.href = returnToPath;
    }
  }, [hasAccessTokenPair, returnToPath]);

  return <></>;
};
