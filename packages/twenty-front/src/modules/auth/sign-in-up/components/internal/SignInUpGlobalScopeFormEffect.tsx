import { useAuth } from '@/auth/hooks/useAuth';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { isDefined, isExternalRedirectTrusted } from 'twenty-shared/utils';

export const SignInUpGlobalScopeFormEffect = () => {
  const setSignInUpStep = useSetAtomState(signInUpStepState);
  const [searchParams, setSearchParams] = useSearchParams();
  const { setAuthTokens } = useAuth();
  const { loadCurrentUser } = useLoadCurrentUser();

  useEffect(() => {
    const tokenPair = searchParams.get('tokenPair');
    if (isDefined(tokenPair)) {
      setAuthTokens(JSON.parse(tokenPair));

      // OMNIA-CUSTOM: if a trusted postSignInRedirect was carried through the
      // sign-in flow, the cookie is now set on the shared parent domain — send
      // the user back to their original destination instead of continuing into
      // Twenty's workspace selection. Re-check trust as defense in depth.
      const postSignInRedirect = searchParams.get('postSignInRedirect');
      if (
        isDefined(postSignInRedirect) &&
        isExternalRedirectTrusted(postSignInRedirect, window.location.origin)
      ) {
        window.location.href = postSignInRedirect;
        return;
      }

      searchParams.delete('tokenPair');
      setSearchParams(searchParams);
      loadCurrentUser();
      setSignInUpStep(SignInUpStep.WorkspaceSelection);
    }
  }, [
    searchParams,
    setSearchParams,
    setSignInUpStep,
    loadCurrentUser,
    setAuthTokens,
  ]);

  return <></>;
};
