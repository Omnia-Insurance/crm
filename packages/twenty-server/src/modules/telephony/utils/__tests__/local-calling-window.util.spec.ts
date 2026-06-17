import {
  isWithinAllowedCallingWindow,
  resolveLeadTimeZone,
} from 'src/modules/telephony/utils/local-calling-window.util';

describe('local calling window utils', () => {
  it('allows calls during the default 9am-8pm lead-local window', () => {
    const result = isWithinAllowedCallingWindow({
      lead: { addressCustom: { addressState: 'MI' } },
      campaign: {},
      now: new Date('2026-01-01T15:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.timeZone).toBe('America/Detroit');
  });

  it('blocks calls outside the default lead-local window', () => {
    const result = isWithinAllowedCallingWindow({
      lead: { addressCustom: { addressState: 'MI' } },
      campaign: {},
      now: new Date('2026-01-02T02:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    expect(result.timeZone).toBe('America/Detroit');
  });

  it('uses campaign-level hours and default time zone when lead state is absent', () => {
    const result = isWithinAllowedCallingWindow({
      lead: {},
      campaign: {
        allowedStartLocalTime: '11:00',
        allowedEndLocalTime: '12:00',
        defaultTimeZone: 'America/Los_Angeles',
      },
      now: new Date('2026-01-01T19:30:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.timeZone).toBe('America/Los_Angeles');
  });

  it('resolves lead time zone from address state before campaign default', () => {
    expect(
      resolveLeadTimeZone({
        lead: { addressCustom: { addressState: 'CA' } },
        campaign: { defaultTimeZone: 'America/New_York' },
      }),
    ).toBe('America/Los_Angeles');
  });
});
