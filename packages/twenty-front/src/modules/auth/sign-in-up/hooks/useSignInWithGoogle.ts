import { useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '@/auth/hooks/useAuth';
import { getTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/getTrustedExternalReturnUrl';
import { type SocialSsoSignInUpActionType } from '@/auth/types/SocialSsoSignInUpActionType';
import { BILLING_CHECKOUT_SESSION_DEFAULT_VALUE } from '@/settings/billing/constants/BillingCheckoutSessionDefaultValue';

export const useSignInWithGoogle = () => {
  const workspaceInviteHash = useParams().workspaceInviteHash;
  const [searchParams] = useSearchParams();
  const workspacePersonalInviteToken =
    searchParams.get('inviteToken') ?? undefined;

  const { signInWithGoogle } = useAuth();

  return {
    signInWithGoogle: ({ action }: { action: SocialSsoSignInUpActionType }) =>
      signInWithGoogle({
        workspaceInviteHash,
        workspacePersonalInviteToken,
        billingCheckoutSession: BILLING_CHECKOUT_SESSION_DEFAULT_VALUE,
        action,
        // OMNIA-CUSTOM: carries a trusted sibling URL (omniaagent.com dashboard) through SSO
        returnToPath: getTrustedExternalReturnUrl() ?? undefined,
      }),
  };
};
