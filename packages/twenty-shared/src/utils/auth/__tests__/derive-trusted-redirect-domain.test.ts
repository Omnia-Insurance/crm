import {
  deriveTrustedParentDomain,
  isExternalRedirectTrusted,
} from '@/utils/auth/derive-trusted-redirect-domain';

const FRONTEND_URL = 'https://crm.omniaagent.com';

describe('deriveTrustedParentDomain', () => {
  it('should strip the leftmost label', () => {
    expect(deriveTrustedParentDomain(FRONTEND_URL)).toBe('omniaagent.com');
  });

  it('should return null when there is no subdomain to strip', () => {
    expect(deriveTrustedParentDomain('https://omniaagent.com')).toBeNull();
    expect(deriveTrustedParentDomain('http://localhost:3001')).toBeNull();
    expect(deriveTrustedParentDomain('http://10.0.0.12:3001')).toBeNull();
    expect(deriveTrustedParentDomain('not a url')).toBeNull();
  });
});

describe('isExternalRedirectTrusted', () => {
  it('should trust https URLs on the frontend host or a sibling subdomain', () => {
    expect(
      isExternalRedirectTrusted('https://crm.omniaagent.com/x', FRONTEND_URL),
    ).toBe(true);
    expect(
      isExternalRedirectTrusted(
        'https://omniaagent.com/retention',
        FRONTEND_URL,
      ),
    ).toBe(true);
    expect(
      isExternalRedirectTrusted('https://dash.omniaagent.com/', FRONTEND_URL),
    ).toBe(true);
  });

  it('should reject non-https URLs even on a trusted host', () => {
    expect(
      isExternalRedirectTrusted('http://dash.omniaagent.com/', FRONTEND_URL),
    ).toBe(false);
    expect(
      isExternalRedirectTrusted(
        'javascript://crm.omniaagent.com/%0aalert(1)',
        FRONTEND_URL,
      ),
    ).toBe(false);
  });

  it('should reject other domains and lookalike suffixes', () => {
    expect(isExternalRedirectTrusted('https://evil.com/', FRONTEND_URL)).toBe(
      false,
    );
    expect(
      isExternalRedirectTrusted('https://evilomniaagent.com/', FRONTEND_URL),
    ).toBe(false);
    expect(
      isExternalRedirectTrusted(
        'https://crm.omniaagent.com.evil.com/',
        FRONTEND_URL,
      ),
    ).toBe(false);
    expect(isExternalRedirectTrusted('/relative/path', FRONTEND_URL)).toBe(
      false,
    );
  });

  it('should allow http and https between localhost ports only', () => {
    expect(
      isExternalRedirectTrusted(
        'http://localhost:3000/',
        'http://localhost:3001',
      ),
    ).toBe(true);
    expect(
      isExternalRedirectTrusted(
        'javascript://localhost/%0aalert(1)',
        'http://localhost:3001',
      ),
    ).toBe(false);
  });
});
