import { isExternalRedirectTrusted } from 'twenty-shared/utils';

// isExternalRedirectTrusted lets http through between localhost hosts; only https leaves the CRM.
export const isTrustedExternalReturnUrl = (
  candidateUrl: string,
  frontendOrigin: string = window.location.origin,
): boolean => {
  try {
    return (
      new URL(candidateUrl).protocol === 'https:' &&
      isExternalRedirectTrusted(candidateUrl, frontendOrigin)
    );
  } catch {
    return false;
  }
};
