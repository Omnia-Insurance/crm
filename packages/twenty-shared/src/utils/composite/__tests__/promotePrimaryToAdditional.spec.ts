import {
  promotePrimaryEmailToAdditional,
  promotePrimaryPhoneToAdditional,
} from '../promotePrimaryToAdditional';

describe('promotePrimaryPhoneToAdditional', () => {
  it('pushes the old primary into additionalPhones', () => {
    const result = promotePrimaryPhoneToAdditional(
      {
        primaryPhoneNumber: '+13346657717',
        primaryPhoneCountryCode: 'US',
        primaryPhoneCallingCode: '1',
        additionalPhones: null,
      },
      '+12206950186',
    );

    expect(result.primaryPhoneNumber).toBe('+12206950186');
    expect(result.additionalPhones).toEqual([
      { number: '+13346657717', countryCode: 'US', callingCode: '1' },
    ]);
  });

  it('preserves existing additionals and appends old primary', () => {
    const result = promotePrimaryPhoneToAdditional(
      {
        primaryPhoneNumber: '+13346657717',
        primaryPhoneCountryCode: 'US',
        primaryPhoneCallingCode: '1',
        additionalPhones: [
          { number: '+12206951188', countryCode: 'US', callingCode: '1' },
        ],
      },
      '+12206950186',
    );

    expect(result.primaryPhoneNumber).toBe('+12206950186');
    expect(result.additionalPhones).toEqual([
      { number: '+12206951188', countryCode: 'US', callingCode: '1' },
      { number: '+13346657717', countryCode: 'US', callingCode: '1' },
    ]);
  });

  it('does not duplicate when old primary already in additionals', () => {
    const result = promotePrimaryPhoneToAdditional(
      {
        primaryPhoneNumber: '+13346657717',
        primaryPhoneCountryCode: 'US',
        primaryPhoneCallingCode: '1',
        additionalPhones: [
          { number: '+13346657717', countryCode: 'US', callingCode: '1' },
        ],
      },
      '+12206950186',
    );

    expect(result.additionalPhones).toEqual([
      { number: '+13346657717', countryCode: 'US', callingCode: '1' },
    ]);
  });

  it('removes the new primary from additionals to avoid self-dupe', () => {
    const result = promotePrimaryPhoneToAdditional(
      {
        primaryPhoneNumber: '+13346657717',
        primaryPhoneCountryCode: 'US',
        primaryPhoneCallingCode: '1',
        additionalPhones: [
          { number: '+12206950186', countryCode: 'US', callingCode: '1' },
        ],
      },
      '+12206950186',
    );

    expect(result.primaryPhoneNumber).toBe('+12206950186');
    expect(result.additionalPhones).toEqual([
      { number: '+13346657717', countryCode: 'US', callingCode: '1' },
    ]);
  });

  it('is a no-op when primary is unchanged', () => {
    const existing = {
      primaryPhoneNumber: '+13346657717',
      primaryPhoneCountryCode: 'US',
      primaryPhoneCallingCode: '1',
      additionalPhones: [
        {
          number: '+12206951188',
          countryCode: 'US' as const,
          callingCode: '1',
        },
      ],
    };
    const result = promotePrimaryPhoneToAdditional(existing, '+13346657717');

    expect(result.primaryPhoneNumber).toBe('+13346657717');
    expect(result.additionalPhones).toEqual(existing.additionalPhones);
  });

  it('does not push when existing primary is empty', () => {
    const result = promotePrimaryPhoneToAdditional(
      {
        primaryPhoneNumber: '',
        primaryPhoneCountryCode: '',
        primaryPhoneCallingCode: '',
        additionalPhones: null,
      },
      '+12206950186',
    );

    expect(result.primaryPhoneNumber).toBe('+12206950186');
    expect(result.additionalPhones).toBeNull();
  });

  it('handles null/undefined existing composite', () => {
    const result = promotePrimaryPhoneToAdditional(null, '+12206950186');

    expect(result.primaryPhoneNumber).toBe('+12206950186');
    expect(result.additionalPhones).toBeNull();
  });

  // Accept then Undo — verify the helper preserves all known numbers and
  // never lets the primary appear in additionalPhones.
  it('Accept→Undo cycle keeps both values reachable, no duplicates', () => {
    const initial = {
      primaryPhoneNumber: '+13346657717',
      primaryPhoneCountryCode: 'US' as const,
      primaryPhoneCallingCode: '1',
      additionalPhones: [
        {
          number: '+12206951188',
          countryCode: 'US' as const,
          callingCode: '1',
        },
      ],
    };

    // Accept the BOB value.
    const afterAccept = promotePrimaryPhoneToAdditional(
      initial,
      '+12206950186',
    );
    expect(afterAccept.primaryPhoneNumber).toBe('+12206950186');
    expect(afterAccept.additionalPhones).toEqual([
      { number: '+12206951188', countryCode: 'US', callingCode: '1' },
      { number: '+13346657717', countryCode: 'US', callingCode: '1' },
    ]);

    // Undo back to the original primary.
    const afterUndo = promotePrimaryPhoneToAdditional(
      afterAccept,
      '+13346657717',
    );
    expect(afterUndo.primaryPhoneNumber).toBe('+13346657717');
    expect(afterUndo.additionalPhones).toEqual([
      { number: '+12206951188', countryCode: 'US', callingCode: '1' },
      { number: '+12206950186', countryCode: 'US', callingCode: '1' },
    ]);
    // Primary is never simultaneously in additional.
    expect(
      afterUndo.additionalPhones?.some(
        (p) => p.number === afterUndo.primaryPhoneNumber,
      ),
    ).toBe(false);
  });
});

describe('promotePrimaryEmailToAdditional', () => {
  it('pushes the old primary into additionalEmails', () => {
    const result = promotePrimaryEmailToAdditional(
      { primaryEmail: 'old@example.com', additionalEmails: null },
      'new@example.com',
    );

    expect(result.primaryEmail).toBe('new@example.com');
    expect(result.additionalEmails).toEqual(['old@example.com']);
  });

  it('preserves existing additionals and appends old primary', () => {
    const result = promotePrimaryEmailToAdditional(
      {
        primaryEmail: 'old@example.com',
        additionalEmails: ['other@example.com'],
      },
      'new@example.com',
    );

    expect(result.additionalEmails).toEqual([
      'other@example.com',
      'old@example.com',
    ]);
  });

  it('does not duplicate when old primary already in additionals', () => {
    const result = promotePrimaryEmailToAdditional(
      {
        primaryEmail: 'old@example.com',
        additionalEmails: ['old@example.com'],
      },
      'new@example.com',
    );

    expect(result.additionalEmails).toEqual(['old@example.com']);
  });

  it('removes the new primary from additionals to avoid self-dupe', () => {
    const result = promotePrimaryEmailToAdditional(
      {
        primaryEmail: 'old@example.com',
        additionalEmails: ['new@example.com'],
      },
      'new@example.com',
    );

    expect(result.primaryEmail).toBe('new@example.com');
    expect(result.additionalEmails).toEqual(['old@example.com']);
  });

  it('is a no-op when primary is unchanged', () => {
    const result = promotePrimaryEmailToAdditional(
      {
        primaryEmail: 'old@example.com',
        additionalEmails: ['other@example.com'],
      },
      'old@example.com',
    );

    expect(result.primaryEmail).toBe('old@example.com');
    expect(result.additionalEmails).toEqual(['other@example.com']);
  });

  it('does not push when existing primary is empty', () => {
    const result = promotePrimaryEmailToAdditional(
      { primaryEmail: '', additionalEmails: null },
      'new@example.com',
    );

    expect(result.primaryEmail).toBe('new@example.com');
    expect(result.additionalEmails).toBeNull();
  });

  it('handles null existing composite', () => {
    const result = promotePrimaryEmailToAdditional(null, 'new@example.com');
    expect(result.primaryEmail).toBe('new@example.com');
    expect(result.additionalEmails).toBeNull();
  });
});
