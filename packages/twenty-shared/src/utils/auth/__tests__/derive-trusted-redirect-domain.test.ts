import { isExternalRedirectTrusted } from '@/utils/auth/derive-trusted-redirect-domain';

const FRONTEND_URL = 'https://crm.example.com';

describe('isExternalRedirectTrusted', () => {
  it('trusts https URLs on the same host or a sibling subdomain', () => {
    expect(
      isExternalRedirectTrusted(
        'https://crm.example.com/objects/people',
        FRONTEND_URL,
      ),
    ).toBe(true);
    expect(
      isExternalRedirectTrusted('https://example.com/dashboard', FRONTEND_URL),
    ).toBe(true);
    expect(
      isExternalRedirectTrusted('https://app.example.com', FRONTEND_URL),
    ).toBe(true);
  });

  it('rejects non-https protocols even when the host is trusted', () => {
    expect(
      isExternalRedirectTrusted('javascript://crm.example.com/', FRONTEND_URL),
    ).toBe(false);
    expect(
      isExternalRedirectTrusted('javascript://example.com/', FRONTEND_URL),
    ).toBe(false);
    expect(isExternalRedirectTrusted('http://example.com', FRONTEND_URL)).toBe(
      false,
    );
    expect(
      isExternalRedirectTrusted('data:text/html,hello', FRONTEND_URL),
    ).toBe(false);
  });

  it('rejects untrusted hosts and invalid URLs', () => {
    expect(
      isExternalRedirectTrusted('https://evil-example.com', FRONTEND_URL),
    ).toBe(false);
    expect(isExternalRedirectTrusted('not a url', FRONTEND_URL)).toBe(false);
  });

  it('allows http and https between localhost ports only', () => {
    expect(
      isExternalRedirectTrusted(
        'http://localhost:3002/',
        'http://localhost:3001',
      ),
    ).toBe(true);
    expect(
      isExternalRedirectTrusted(
        'javascript://localhost/',
        'http://localhost:3001',
      ),
    ).toBe(false);
  });
});
