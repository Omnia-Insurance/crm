import { isTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/isTrustedExternalReturnUrl';

describe('isTrustedExternalReturnUrl', () => {
  it('accepts an https sibling of the CRM host', () => {
    expect(
      isTrustedExternalReturnUrl(
        'https://omniaagent.com/retention',
        'https://crm.omniaagent.com',
      ),
    ).toBe(true);
  });

  // The shared helper allows http between localhost hosts; the CRM never leaves over http.
  it('rejects http even between localhost hosts', () => {
    expect(
      isTrustedExternalReturnUrl(
        'http://localhost:3001/retention',
        'http://localhost:3001',
      ),
    ).toBe(false);
  });

  it('rejects a value that is not a URL', () => {
    expect(
      isTrustedExternalReturnUrl('not a url', 'https://crm.omniaagent.com'),
    ).toBe(false);
  });
});
