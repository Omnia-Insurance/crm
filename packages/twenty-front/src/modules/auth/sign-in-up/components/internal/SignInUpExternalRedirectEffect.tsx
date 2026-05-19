import { useHasAccessTokenPair } from '@/auth/hooks/useHasAccessTokenPair';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isDefined, isExternalRedirectTrusted } from 'twenty-shared/utils';

// OMNIA-CUSTOM: when an already-authed user lands on /welcome with a trusted
// absolute returnToPath (e.g. omniaagent.com bounces them here on token refresh),
// honor the redirect instead of dropping them on Twenty's default landing.
// SignInUpGlobalScopeFormEffect and VerifyLoginTokenEffect only handle the
// fresh-token flow (tokenPair in URL / loginToken exchange); they do not run
// when the user already has a valid refresh-token cookie. Without this effect,
// usePageChangeEffectNavigateLocation ignores the external returnToPath and
// routes them to the default home page.
export const SignInUpExternalRedirectEffect = () => {
  const [searchParams] = useSearchParams();
  const returnToPath =
    searchParams.get('returnToPath') ?? searchParams.get('postSignInRedirect');
  const hasAccessTokenPair = useHasAccessTokenPair();

  useEffect(() => {
    if (
      hasAccessTokenPair &&
      isDefined(returnToPath) &&
      isExternalRedirectTrusted(returnToPath, window.location.origin)
    ) {
      // External destination — bypass react-router. window.location.href is
      // synchronous full-page nav and will preempt any pending navigate() from
      // PageChangeEffect.
      window.location.href = returnToPath;
    }
  }, [hasAccessTokenPair, returnToPath]);

  return <></>;
};
