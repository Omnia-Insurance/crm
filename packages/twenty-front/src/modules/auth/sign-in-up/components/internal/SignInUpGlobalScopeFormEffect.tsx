import { useAuth } from '@/auth/hooks/useAuth';
import { useHasAccessTokenPair } from '@/auth/hooks/useHasAccessTokenPair';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isDefined, isExternalRedirectTrusted } from 'twenty-shared/utils';

export const SignInUpGlobalScopeFormEffect = () => {
  const setSignInUpStep = useSetAtomState(signInUpStepState);
  const signInUpStep = useAtomStateValue(signInUpStepState);
  const [searchParams, setSearchParams] = useSearchParams();
  const { setAuthTokens } = useAuth();
  const { loadCurrentUser } = useLoadCurrentUser();
  const hasAccessTokenPair = useHasAccessTokenPair();

  useEffect(() => {
    // Path 1: user just bounced back from social SSO with a workspace-agnostic
    // tokenPair in the URL. Honor it unconditionally.
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
      loadCurrentUser();
      setSignInUpStep(SignInUpStep.WorkspaceSelection);
      return;
    }

    // Path 2: user revisits /welcome with a still-valid workspace-agnostic
    // tokenPair cookie left over from a prior SSO landing. Resume straight
    // to workspace selection instead of forcing them through the sign-in
    // form again. The step transition gates re-entry; if the cookie is
    // stale, loadCurrentUser triggers Apollo's renewal -> onUnauthenticatedError
    // path which clears the cookie and falls back to the normal form.
    if (signInUpStep !== SignInUpStep.Init) return;
    if (!hasAccessTokenPair) return;

    loadCurrentUser();
    setSignInUpStep(SignInUpStep.WorkspaceSelection);
  }, [
    searchParams,
    setSearchParams,
    setSignInUpStep,
    loadCurrentUser,
    setAuthTokens,
    signInUpStep,
    hasAccessTokenPair,
  ]);

  return <></>;
};
