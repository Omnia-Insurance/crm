import { useAuth } from '@/auth/hooks/useAuth';
import { useHasAccessTokenPair } from '@/auth/hooks/useHasAccessTokenPair';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isDefined, isExternalRedirectTrusted } from 'twenty-shared/utils';

export const SignInUpGlobalScopeFormEffect = () => {
  const signInUpStep = useAtomStateValue(signInUpStepState);
  const [searchParams, setSearchParams] = useSearchParams();
  const { setAuthTokens, navigateAfterMultiWorkspaceSignInUp } = useAuth();
  const { loadCurrentUser } = useLoadCurrentUser();
  const hasAccessTokenPair = useHasAccessTokenPair();

  useEffect(() => {
    const resumeOnCentralDomain = async () => {
      const { user } = await loadCurrentUser();
      await navigateAfterMultiWorkspaceSignInUp(
        user.availableWorkspaces,
        user.email,
      );
    };

    const tokenPairFromUrl = searchParams.get('tokenPair');
    if (isDefined(tokenPairFromUrl)) {
      setAuthTokens(JSON.parse(tokenPairFromUrl));

      // OMNIA-CUSTOM: if a trusted absolute returnToPath was carried through
      // the sign-in flow, the cookie is now set on the shared parent domain;
      // send the user back to their original destination instead of continuing
      // into Twenty's workspace selection. postSignInRedirect remains an
      // input-only compatibility fallback.
      const returnToPath =
        searchParams.get('returnToPath') ??
        searchParams.get('postSignInRedirect');
      if (
        isDefined(returnToPath) &&
        isExternalRedirectTrusted(returnToPath, window.location.origin)
      ) {
        window.location.href = returnToPath;
        return;
      }

      searchParams.delete('tokenPair');
      setSearchParams(searchParams);
      void resumeOnCentralDomain();
      return;
    }

    if (signInUpStep !== SignInUpStep.Init) return;
    if (!hasAccessTokenPair) return;

    void resumeOnCentralDomain();
  }, [
    searchParams,
    setSearchParams,
    loadCurrentUser,
    setAuthTokens,
    signInUpStep,
    hasAccessTokenPair,
    navigateAfterMultiWorkspaceSignInUp,
  ]);

  return <></>;
};
