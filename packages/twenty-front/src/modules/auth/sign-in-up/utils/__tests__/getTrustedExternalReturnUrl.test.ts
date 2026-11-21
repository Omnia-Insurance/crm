import { getTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/getTrustedExternalReturnUrl';

const CRM_ORIGIN = 'https://crm.omniaagent.com';

const readReturnUrl = (searchParams: Record<string, string>) =>
  getTrustedExternalReturnUrl({
    origin: CRM_ORIGIN,
    search: `?${new URLSearchParams(searchParams).toString()}`,
  });

describe('getTrustedExternalReturnUrl', () => {
  it('returns an https URL on the CRM parent domain', () => {
    expect(
      readReturnUrl({ returnToPath: 'https://omniaagent.com/retention' }),
    ).toBe('https://omniaagent.com/retention');
  });

  it('returns an https URL on a sibling subdomain', () => {
    expect(
      readReturnUrl({ returnToPath: 'https://dash.omniaagent.com/calls?x=1' }),
    ).toBe('https://dash.omniaagent.com/calls?x=1');
  });

  it('reads the legacy postSignInRedirect parameter', () => {
    expect(
      readReturnUrl({ postSignInRedirect: 'https://omniaagent.com/retention' }),
    ).toBe('https://omniaagent.com/retention');
  });

  it.each([
    ['http on a trusted host', 'http://omniaagent.com/retention'],
    [
      'a javascript: URL naming a trusted host',
      // oxlint-disable-next-line no-script-url
      'javascript://omniaagent.com/%0aalert(1)',
    ],
    ['a protocol-relative URL', '//omniaagent.com/retention'],
    ['an untrusted host', 'https://evil.example.com/retention'],
    ['a look-alike host', 'https://omniaagent.com.evil.example.com/retention'],
    [
      'a host that only ends with the parent name',
      'https://xomniaagent.com/retention',
    ],
    ['a malformed URL', 'https://'],
    ['an app path', '/objects/leads'],
  ])('rejects %s', (_description, returnToPath) => {
    expect(readReturnUrl({ returnToPath })).toBeNull();
    expect(readReturnUrl({ postSignInRedirect: returnToPath })).toBeNull();
  });

  it('returns null when the query carries no return URL', () => {
    expect(readReturnUrl({ email: 'agent@omniaagent.com' })).toBeNull();
  });

  it('reads window.location by default', () => {
    window.history.replaceState(
      {},
      '',
      `/welcome?postSignInRedirect=${encodeURIComponent('https://localhost/retention')}`,
    );

    expect(getTrustedExternalReturnUrl()).toBe('https://localhost/retention');

    window.history.replaceState({}, '', '/');
  });
});
