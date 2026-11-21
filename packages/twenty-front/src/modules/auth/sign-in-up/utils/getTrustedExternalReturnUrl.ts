import { isNonEmptyString } from '@sniptt/guards';

import { isTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/isTrustedExternalReturnUrl';

// Read from the URL itself: returnToPathState and RootDeepLinkRedirect only keep app paths.
// postSignInRedirect is the legacy name the omniaagent.com dashboard sends.
export const getTrustedExternalReturnUrl = (
  location: Pick<Location, 'origin' | 'search'> = window.location,
): string | null => {
  const searchParams = new URLSearchParams(location.search);
  const returnUrl =
    searchParams.get('returnToPath') ?? searchParams.get('postSignInRedirect');

  return isNonEmptyString(returnUrl) &&
    isTrustedExternalReturnUrl(returnUrl, location.origin)
    ? returnUrl
    : null;
};
