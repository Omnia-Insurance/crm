const IP_HOSTNAME_REGEX = /^[\d.]+$/;

/**
 * Derives the "trusted parent domain" from a Twenty frontend URL using the
 * same strip-leftmost-subdomain approach used elsewhere for shared cookies.
 * Returns null for hosts without a meaningful subdomain to strip (localhost,
 * IPs, apex domains).
 */
export const deriveTrustedParentDomain = (
  frontendUrl: string,
): string | null => {
  try {
    const { hostname } = new URL(frontendUrl);
    if (hostname === 'localhost' || IP_HOSTNAME_REGEX.test(hostname))
      return null;
    const parts = hostname.split('.');
    if (parts.length < 3) return null;
    return parts.slice(1).join('.');
  } catch {
    return null;
  }
};

/**
 * Returns true if `candidateUrl` is safe to redirect to from a Twenty frontend
 * deployed at `frontendUrl`. Allowed:
 *   - Same host as frontendUrl
 *   - localhost ↔ localhost (any ports; cookies cross ports on localhost)
 *   - Any subdomain of the derived trusted parent (e.g. omniaagent.com from
 *     crm.omniaagent.com)
 */
export const isExternalRedirectTrusted = (
  candidateUrl: string,
  frontendUrl: string,
): boolean => {
  try {
    const candidate = new URL(candidateUrl);
    const frontend = new URL(frontendUrl);
    if (candidate.host === frontend.host) return true;
    if (
      frontend.hostname === 'localhost' &&
      candidate.hostname === 'localhost'
    ) {
      return true;
    }
    const trustedParent = deriveTrustedParentDomain(frontendUrl);
    if (trustedParent === null) return false;
    return (
      candidate.hostname === trustedParent ||
      candidate.hostname.endsWith('.' + trustedParent)
    );
  } catch {
    return false;
  }
};
