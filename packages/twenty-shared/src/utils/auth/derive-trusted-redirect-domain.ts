import { isDefined } from '@/utils/validation/isDefined';

const IP_HOSTNAME_REGEX = /^[\d.]+$/;

// crm.omniaagent.com -> omniaagent.com. Null when there is no subdomain to
// strip (localhost, IPs, apex domains), so nothing beyond the host is trusted.
export const deriveTrustedParentDomain = (
  frontendUrl: string,
): string | null => {
  try {
    const { hostname } = new URL(frontendUrl);

    if (hostname === 'localhost' || IP_HOSTNAME_REGEX.test(hostname)) {
      return null;
    }

    const hostnameLabels = hostname.split('.');

    if (hostnameLabels.length < 3) {
      return null;
    }

    return hostnameLabels.slice(1).join('.');
  } catch {
    return null;
  }
};

// https is required: a javascript: URL can carry a trusted host and would run
// script once assigned to window.location.
export const isExternalRedirectTrusted = (
  candidateUrl: string,
  frontendUrl: string,
): boolean => {
  try {
    const candidate = new URL(candidateUrl);
    const frontend = new URL(frontendUrl);

    if (
      frontend.hostname === 'localhost' &&
      candidate.hostname === 'localhost'
    ) {
      return candidate.protocol === 'http:' || candidate.protocol === 'https:';
    }

    if (candidate.protocol !== 'https:') {
      return false;
    }

    if (candidate.host === frontend.host) {
      return true;
    }

    const trustedParentDomain = deriveTrustedParentDomain(frontendUrl);

    if (!isDefined(trustedParentDomain)) {
      return false;
    }

    return (
      candidate.hostname === trustedParentDomain ||
      candidate.hostname.endsWith(`.${trustedParentDomain}`)
    );
  } catch {
    return false;
  }
};
