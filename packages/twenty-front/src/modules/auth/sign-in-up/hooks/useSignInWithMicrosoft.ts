import { useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '@/auth/hooks/useAuth';
import { billingCheckoutSessionState } from '@/auth/states/billingCheckoutSessionState';
import { type SocialSSOSignInUpActionType } from '@/auth/types/socialSSOSignInUp.type';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useSignInWithMicrosoft = () => {
  const workspaceInviteHash = useParams().workspaceInviteHash;
  const [searchParams] = useSearchParams();
  const workspacePersonalInviteToken =
    searchParams.get('inviteToken') ?? undefined;
  // OMNIA-CUSTOM: returnToPath can carry trusted absolute URLs. Keep
  // postSignInRedirect as an input-only compatibility fallback.
  const returnToPath =
    searchParams.get('returnToPath') ??
    searchParams.get('postSignInRedirect') ??
    undefined;
  const billingCheckoutSession = useAtomStateValue(billingCheckoutSessionState);

  const { signInWithMicrosoft } = useAuth();
  return {
    signInWithMicrosoft: ({
      action,
    }: {
      action: SocialSSOSignInUpActionType;
    }) =>
      signInWithMicrosoft({
        workspaceInviteHash,
        workspacePersonalInviteToken,
        billingCheckoutSession,
        action,
        returnToPath,
      }),
  };
};
