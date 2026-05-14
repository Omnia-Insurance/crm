import { type APP_LOCALES } from 'twenty-shared/translations';

import { type SocialSSOSignInUpActionType } from 'src/engine/core-modules/auth/types/signInUp.type';

export type SocialSSOState = {
  workspaceInviteHash?: string;
  workspaceId?: string;
  billingCheckoutSessionState?: string;
  workspacePersonalInviteToken?: string;
  action?: SocialSSOSignInUpActionType;
  locale?: keyof typeof APP_LOCALES;
  // OMNIA-CUSTOM: carries a trusted external redirect target through the
  // OAuth round-trip so sibling-subdomain apps (e.g. omniaagent.com) can
  // bounce users back home after signing in at crm.omniaagent.com.
  postSignInRedirect?: string;
};
