// OMNIA-CUSTOM: tests for the config-driven client status fallback (OMN-12
// tuning depth — multi-carrier audit 2026-06-11 §"Config-driven client status
// fallback for the create-policy flow"). Contract under test:
//   - omitting statusConfig reproduces the legacy hardcoded behavior
//     bit-for-bit (threshold 30, legacy Ambetter snapshot keys);
//   - statusConfig.placedThresholdDays replaces the hardcoded 30;
//   - statusConfig.fieldMapping (status-engine role → row key) resolves the
//     engine inputs ahead of the crmField/legacy path, with present-in-
//     snapshot precedence so pre-mapping snapshots fall through unchanged.

import {
  buildSyntheticPolicyRecord,
  deriveStatusFromBob,
} from '@/reconciliation/utils/buildSyntheticPolicyRecord';

// Frozen clock: 2026-06-15 → current month end is 2026-06-30 (the month-ahead
// payment-error boundary used by rules 5+).
const NOW = new Date('2026-06-15T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('deriveStatusFromBob', () => {
  describe('legacy parity (no statusConfig — bit-for-bit the old behavior)', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      [
        'eligible=false → CANCELED',
        { eligible_for_commission: false },
        'CANCELED',
      ],
      [
        'past term date → CANCELED',
        { policy_term_date: '2026-01-31' },
        'CANCELED',
      ],
      [
        'future effective → ACTIVE_APPROVED',
        { policy_effective_date: '2026-09-01' },
        'ACTIVE_APPROVED',
      ],
      ['missing effective anchor → ACTIVE_APPROVED', {}, 'ACTIVE_APPROVED'],
      [
        'placed + paid current → ACTIVE_PLACED',
        {
          policy_effective_date: '2026-01-01',
          paid_through_date: '2026-06-30',
        },
        'ACTIVE_PLACED',
      ],
      [
        'placed + payment error → PAYMENT_ERROR_ACTIVE_PLACED',
        {
          policy_effective_date: '2026-01-01',
          paid_through_date: '2026-05-31',
        },
        'PAYMENT_ERROR_ACTIVE_PLACED',
      ],
      [
        '15 days paid, no full month → PAYMENT_ERROR_ACTIVE_APPROVED (threshold 30)',
        {
          policy_effective_date: '2026-06-10',
          paid_through_date: '2026-06-25',
        },
        'PAYMENT_ERROR_ACTIVE_APPROVED',
      ],
    ];

    it.each(cases)('%s', (_label, snapshot, expected) => {
      expect(deriveStatusFromBob(snapshot)).toBe(expected);
    });

    it.each(cases)(
      'an empty statusConfig is bit-for-bit the implicit default: %s',
      (_label, snapshot, expected) => {
        expect(deriveStatusFromBob(snapshot, undefined, {})).toBe(expected);
        expect(deriveStatusFromBob(snapshot, undefined, null)).toBe(expected);
      },
    );
  });

  describe('statusConfig.placedThresholdDays (replaces the hardcoded 30)', () => {
    const snapshot = {
      policy_effective_date: '2026-06-10',
      paid_through_date: '2026-06-25', // 15 days, no full effective month
    };

    it('stays APPROVED under the default threshold', () => {
      expect(deriveStatusFromBob(snapshot)).toBe(
        'PAYMENT_ERROR_ACTIVE_APPROVED',
      );
    });

    it('a lower per-carrier threshold places the policy', () => {
      expect(
        deriveStatusFromBob(snapshot, undefined, { placedThresholdDays: 10 }),
      ).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
    });

    it('ignores a non-numeric threshold (admin-editable JSON)', () => {
      expect(
        deriveStatusFromBob(snapshot, undefined, {
          placedThresholdDays: '10' as unknown as number,
        }),
      ).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
    });
  });

  describe('statusConfig.fieldMapping (role → row key resolution)', () => {
    it('resolves a carrier-specific eligible column the legacy literal can never find', () => {
      // UHO-style snapshot: no 'eligible_for_commission' key at all.
      const snapshot = {
        'Commission Eligible': false,
        'Coverage Start': '2026-01-01',
        'Paid To': '2026-06-30',
      };

      // Without the mapping the cancel signal is invisible and the missing
      // effective anchor defaults the row → the pre-fix failure mode.
      expect(deriveStatusFromBob(snapshot)).toBe('ACTIVE_APPROVED');

      expect(
        deriveStatusFromBob(snapshot, undefined, {
          fieldMapping: {
            eligibleForCommission: 'Commission Eligible',
            effectiveDate: 'Coverage Start',
            paidThroughDate: 'Paid To',
          },
        }),
      ).toBe('CANCELED');
    });

    it('resolves date roles for an eligible row (full status derivation)', () => {
      const snapshot = {
        'Coverage Start': '2026-01-01',
        'Paid To': '2026-06-30',
      };

      expect(
        deriveStatusFromBob(snapshot, undefined, {
          fieldMapping: {
            effectiveDate: 'Coverage Start',
            paidThroughDate: 'Paid To',
          },
        }),
      ).toBe('ACTIVE_PLACED');
    });

    it('handles the string "false" eligible value like the legacy path did', () => {
      expect(
        deriveStatusFromBob({ 'Commission Eligible': 'false' }, undefined, {
          fieldMapping: { eligibleForCommission: 'Commission Eligible' },
        }),
      ).toBe('CANCELED');
    });

    it('falls through to the legacy literals when the mapped key is absent (pre-mapping snapshots)', () => {
      // Old Ambetter snapshot keyed by the legacy literals; the carrier
      // config has since mapped the role to a header this snapshot predates.
      const legacySnapshot = {
        eligible_for_commission: false,
        policy_effective_date: '2026-01-01',
      };

      expect(
        deriveStatusFromBob(legacySnapshot, undefined, {
          fieldMapping: { eligibleForCommission: 'Commission Eligible' },
        }),
      ).toBe('CANCELED');
    });

    it('resolves the title-case Ambetter XLSX eligible header (server-parity correction)', () => {
      // Pinned per the audit judge's caveat: title-case snapshots carrying
      // 'Eligible for Commission' = false were invisible to the legacy
      // literal (only 'eligible_for_commission' was read), deriving an
      // active status where the server engine derives CANCELED. With the
      // role mapped, the client now agrees with the server.
      const titleCaseSnapshot = {
        'Eligible for Commission': false,
        'Policy Effective Date': '2026-01-01',
      };

      expect(deriveStatusFromBob(titleCaseSnapshot)).toBe('ACTIVE_APPROVED');

      expect(
        deriveStatusFromBob(titleCaseSnapshot, undefined, {
          fieldMapping: { eligibleForCommission: 'Eligible for Commission' },
        }),
      ).toBe('CANCELED');
    });
  });
});

describe('buildSyntheticPolicyRecord statusConfig threading', () => {
  const baseInput = {
    bobSnapshot: {
      policy_number: 'U94692964',
      policy_effective_date: '2026-06-10',
      paid_through_date: '2026-06-25',
    },
    columnMapping: null,
    resolvedRelations: { product: null, carrier: null, agent: null },
    derivedStatus: null,
    ltvAmountMicros: null,
    tempPolicyId: 'preview-policy',
    tempLeadId: 'preview-lead',
  };

  it('derives the fallback status with the per-carrier threshold', () => {
    const withoutConfig = buildSyntheticPolicyRecord(baseInput);

    expect(withoutConfig.policy.status).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');

    const withConfig = buildSyntheticPolicyRecord({
      ...baseInput,
      statusConfig: { placedThresholdDays: 10 },
    });

    expect(withConfig.policy.status).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
  });

  it('a server-derived status still wins over the client fallback', () => {
    const { policy } = buildSyntheticPolicyRecord({
      ...baseInput,
      derivedStatus: 'CANCELED',
      statusConfig: { placedThresholdDays: 10 },
    });

    expect(policy.status).toBe('CANCELED');
  });
});
