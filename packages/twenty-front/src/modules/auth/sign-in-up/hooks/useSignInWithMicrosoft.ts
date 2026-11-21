import { useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '@/auth/hooks/useAuth';
import { getTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/getTrustedExternalReturnUrl';
import { billingCheckoutSessionState } from '@/auth/states/billingCheckoutSessionState';
import { type SocialSsoSignInUpActionType } from '@/auth/types/SocialSsoSignInUpActionType';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useSignInWithMicrosoft = () => {
  const workspaceInviteHash = useParams().workspaceInviteHash;
  const [searchParams] = useSearchParams();
  const workspacePersonalInviteToken =
    searchParams.get('inviteToken') ?? undefined;
  const billingCheckoutSession = useAtomStateValue(billingCheckoutSessionState);

  const { signInWithMicrosoft } = useAuth();
  return {
    signInWithMicrosoft: ({
      action,
    }: {
      action: SocialSsoSignInUpActionType;
    }) =>
      signInWithMicrosoft({
        workspaceInviteHash,
        workspacePersonalInviteToken,
        billingCheckoutSession,
        action,
        // OMNIA-CUSTOM: carries a trusted sibling URL (omniaagent.com dashboard) through SSO
        returnToPath: getTrustedExternalReturnUrl() ?? undefined,
      }),
  };
};
