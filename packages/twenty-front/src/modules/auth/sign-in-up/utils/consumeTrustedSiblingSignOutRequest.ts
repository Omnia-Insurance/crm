import { OMNIA_SIGN_OUT_SEARCH_PARAM } from '@/auth/sign-in-up/constants/OmniaSignOutSearchParam';
import { isTrustedSiblingSignOutRequest } from '@/auth/sign-in-up/utils/isTrustedSiblingSignOutRequest';

// Synchronous strip, as for the SSO exchange token, so a re-run or remounted effect signs out once.
export const consumeTrustedSiblingSignOutRequest = (): boolean => {
  if (!isTrustedSiblingSignOutRequest()) {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);

  searchParams.delete(OMNIA_SIGN_OUT_SEARCH_PARAM);

  const search = searchParams.toString();

  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${search === '' ? '' : `?${search}`}${window.location.hash}`,
  );

  return true;
};
