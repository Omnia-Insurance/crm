import {
  deriveStatus,
  getCancelExpireDate,
  isFullEffectiveMonthPaid,
  DEFAULT_STATUS_ENGINE_CONFIG,
} from 'src/modules/reconciliation/engines/status';
import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';

const today = new Date('2026-04-13');

describe('status engine (ambetter-bob-v1)', () => {
  const parserId = 'ambetter-bob-v1';

  describe('canceled cases', () => {
    it('4.1.1: eligible=false → CANCELED with paid_through as expire', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-03-01',
          termDate: null,
          eligibleForCommission: false,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('CANCELED');
      expect(result?.derivedExpireDate).toBe('2026-03-01');
    });

    it('4.1.1: eligible=false with paid_through before effective → expire=effective', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-02-01',
          paidThroughDate: '2026-01-15',
          termDate: null,
          eligibleForCommission: false,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('CANCELED');
      expect(result?.derivedExpireDate).toBe('2026-02-01');
    });

    it('4.1.2: term date in past → CANCELED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-03-01',
          termDate: '2026-03-15',
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('CANCELED');
    });
  });

  describe('active cases', () => {
    it('4.1.3: effective in future → ACTIVE_APPROVED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-05-01',
          paidThroughDate: null,
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_APPROVED');
    });

    it('4.1.4.3: placed (30+ days) with current payment → ACTIVE_PLACED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-04-10',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('4.1.4.4: approved (<30 days) with current payment → ACTIVE_APPROVED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-04-01',
          paidThroughDate: '2026-04-10',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_APPROVED');
    });

    it('4.1.4.1: placed with payment error → PAYMENT_ERROR_ACTIVE_PLACED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-03-01',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
    });

    it('4.1.4.2: approved with payment error → PAYMENT_ERROR_ACTIVE_APPROVED', () => {
      // effective 2026-03-20, paid through 2026-03-25 → 5 days (< 30 = approved)
      // paid through age = 19 days ago (> 10 = payment error)
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-03-20',
          paidThroughDate: '2026-03-25',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
    });
  });

  describe('previous version cancellation (4.3)', () => {
    it('cancels previous version when newer effective date exists', () => {
      const previousPolicy: CrmPolicy = {
        id: 'old-policy',
        policyNumber: 'U94692964',
        applicationId: null,
        effectiveDate: '2025-01-01',
        expirationDate: null,
        paidThroughDate: null,
        status: 'ACTIVE_PLACED',
        applicantCount: null,
        'lead.name.firstName': 'John',
        'lead.name.lastName': 'Smith',
        'lead.dateOfBirth': null,
        'lead.addressCustom.addressState': null,
        'agent.name': null,
        'agent.npn': null,
        planIdentifier: null,
        'lead.phones.primaryPhoneNumber': null,
        'lead.emails.primaryEmail': null,
        'lead.id': null,
      };

      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-04-10',
          termDate: null,
          eligibleForCommission: true,
        },
        [previousPolicy],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.cancelPreviousPolicyId).toBe('old-policy');
    });
  });

  describe('edge cases', () => {
    it('no effective date → defaults to ACTIVE_APPROVED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: null,
          paidThroughDate: null,
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_APPROVED');
    });

    it('unknown parser returns null', () => {
      const result = deriveStatus(
        'unknown-parser',
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: null,
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result).toBeNull();
    });
  });

  describe('getCancelExpireDate', () => {
    it('returns day before the new effective date', () => {
      expect(getCancelExpireDate('2026-01-01')).toBe('2025-12-31');
      expect(getCancelExpireDate('2026-03-15')).toBe('2026-03-14');
    });
  });

  // Per Jackie's ACA placement rule: commission is paid per calendar
  // month, not per day. A policy effective 2/1 with paid_through 2/28 is
  // "placed" because the full month of February is paid — even though
  // 28 days < the 30-day fallback threshold.
  describe('isFullEffectiveMonthPaid', () => {
    it('true when paid through end of effective month (Feb 28)', () => {
      expect(isFullEffectiveMonthPaid('2026-02-01', '2026-02-28')).toBe(true);
    });

    it('true when paid past end of effective month', () => {
      expect(isFullEffectiveMonthPaid('2026-02-01', '2026-04-30')).toBe(true);
    });

    it('false when paid mid-effective-month', () => {
      expect(isFullEffectiveMonthPaid('2026-02-01', '2026-02-15')).toBe(false);
    });

    it('handles 31-day months (March)', () => {
      expect(isFullEffectiveMonthPaid('2026-03-01', '2026-03-31')).toBe(true);
      expect(isFullEffectiveMonthPaid('2026-03-01', '2026-03-30')).toBe(false);
    });

    it('handles leap-year February (2028)', () => {
      expect(isFullEffectiveMonthPaid('2028-02-01', '2028-02-29')).toBe(true);
      expect(isFullEffectiveMonthPaid('2028-02-01', '2028-02-28')).toBe(false);
    });

    it('false when either date is null', () => {
      expect(isFullEffectiveMonthPaid(null, '2026-02-28')).toBe(false);
      expect(isFullEffectiveMonthPaid('2026-02-01', null)).toBe(false);
      expect(isFullEffectiveMonthPaid(null, null)).toBe(false);
    });

    it('false on malformed input rather than throwing', () => {
      expect(isFullEffectiveMonthPaid('not-a-date', '2026-02-28')).toBe(false);
    });
  });

  // Regression for Jackie's flagged policy U70621435: eff 2026-02-01,
  // paid through 2026-02-28. Old engine derived ACTIVE_APPROVED because
  // 28 days < 30; correct call per Jackie is ACTIVE_PLACED because the
  // full effective month is paid.
  describe("Jackie's calendar-month placement rule", () => {
    it('eff 2/1, paid 2/28 → ACTIVE_PLACED (full February paid)', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-02-01',
          paidThroughDate: '2026-02-28',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-03-01'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
      expect(result?.statusChangeReason).toContain('end of effective month');
    });

    it('eff 3/1, paid 3/31 → ACTIVE_PLACED (full March paid)', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-03-01',
          paidThroughDate: '2026-03-31',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-04-01'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('eff 3/1, paid 3/29 → ACTIVE_APPROVED (March not fully paid)', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-03-01',
          paidThroughDate: '2026-03-29',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-04-01'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_APPROVED');
    });

    it('eff 1/15, paid 2/14 → ACTIVE_PLACED (30-day fallback still works)', () => {
      // Doesn't cover any full calendar month, but the days-based
      // fallback fires (30 days). Keeps behavior intact for non-1st
      // effective dates.
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-15',
          paidThroughDate: '2026-02-14',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-02-15'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('full-month paid + payment error → PAYMENT_ERROR_ACTIVE_PLACED', () => {
      // Eff 2/1, paid 2/28, but today is 4/13 → paid-through is 44d old
      // (> 10) → payment error. Still placed via calendar-month rule.
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-02-01',
          paidThroughDate: '2026-02-28',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
    });
  });
});
