import { isDefined } from 'twenty-shared/utils';

import { OMNIA_SIGN_OUT_SEARCH_PARAM } from '@/auth/sign-in-up/constants/OmniaSignOutSearchParam';
import { getTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/getTrustedExternalReturnUrl';
import { isTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/isTrustedExternalReturnUrl';

// A link from any other site, or from inside the CRM, cannot sign the user out: the page must have been
// opened by a trusted sibling app (the dashboard keeps the default referrer policy).
const isOpenedBySiblingApp = (
  referrer: string,
  location: Pick<Location, 'origin'>,
): boolean => {
  try {
    return (
      isTrustedExternalReturnUrl(referrer, location.origin) &&
      new URL(referrer).origin !== location.origin
    );
  } catch {
    return false;
  }
};

// Only alongside a trusted sibling return URL: the landing redirect holds /welcome for that pair alone.
export const isTrustedSiblingSignOutRequest = (
  location: Pick<Location, 'origin' | 'search'> = window.location,
  referrer: string = document.referrer,
): boolean =>
  new URLSearchParams(location.search).get(OMNIA_SIGN_OUT_SEARCH_PARAM) ===
    '1' &&
  isDefined(getTrustedExternalReturnUrl(location)) &&
  isOpenedBySiblingApp(referrer, location);
