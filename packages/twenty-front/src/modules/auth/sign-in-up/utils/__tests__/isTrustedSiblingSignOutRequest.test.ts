import { isTrustedSiblingSignOutRequest } from '@/auth/sign-in-up/utils/isTrustedSiblingSignOutRequest';

const CRM_ORIGIN = 'https://crm.omniaagent.com';
const DASHBOARD_ORIGIN = 'https://dash.omniaagent.com';
const DASHBOARD_URL = `${DASHBOARD_ORIGIN}/retention`;

const readSignOutRequest = (
  searchParams: Record<string, string>,
  referrer = `${DASHBOARD_ORIGIN}/`,
) =>
  isTrustedSiblingSignOutRequest(
    {
      origin: CRM_ORIGIN,
      search: `?${new URLSearchParams(searchParams).toString()}`,
    },
    referrer,
  );

describe('isTrustedSiblingSignOutRequest', () => {
  it('accepts the dashboard sign-out with its trusted return URL', () => {
    expect(
      readSignOutRequest({
        omniaSignOut: '1',
        postSignInRedirect: DASHBOARD_URL,
      }),
    ).toBe(true);
    expect(
      readSignOutRequest({ omniaSignOut: '1', returnToPath: DASHBOARD_URL }),
    ).toBe(true);
  });

  it('ignores the flag without a trusted return URL', () => {
    expect(readSignOutRequest({ omniaSignOut: '1' })).toBe(false);
    expect(
      readSignOutRequest({
        omniaSignOut: '1',
        postSignInRedirect: 'https://evil.example.com/retention',
      }),
    ).toBe(false);
  });

  it('ignores a plain dashboard sign-in redirect', () => {
    expect(readSignOutRequest({ postSignInRedirect: DASHBOARD_URL })).toBe(
      false,
    );
  });

  it('only accepts the value the dashboard sends', () => {
    expect(
      readSignOutRequest({
        omniaSignOut: 'true',
        postSignInRedirect: DASHBOARD_URL,
      }),
    ).toBe(false);
  });

  it('ignores a sign-out link that a sibling app did not open', () => {
    const crossSiteSignOut = {
      omniaSignOut: '1',
      postSignInRedirect: `${CRM_ORIGIN}/`,
    };

    expect(readSignOutRequest(crossSiteSignOut, '')).toBe(false);
    expect(
      readSignOutRequest(crossSiteSignOut, 'https://evil.example.com/'),
    ).toBe(false);
    expect(
      readSignOutRequest(crossSiteSignOut, `${CRM_ORIGIN}/objects/notes`),
    ).toBe(false);
    expect(
      readSignOutRequest(crossSiteSignOut, 'http://dash.omniaagent.com/'),
    ).toBe(false);
  });
});
