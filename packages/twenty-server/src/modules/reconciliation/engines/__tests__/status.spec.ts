import {
  deriveStatus,
  getCancelExpireDate,
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
          trueEffectiveDate: '2026-01-01',
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
          trueEffectiveDate: '2026-02-01',
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
          trueEffectiveDate: '2026-01-01',
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
          trueEffectiveDate: '2026-05-01',
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
          trueEffectiveDate: '2026-01-01',
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
          trueEffectiveDate: '2026-04-01',
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
          trueEffectiveDate: '2026-01-01',
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
          trueEffectiveDate: '2026-03-20',
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
        status: 'ACTIVE_PLACED',
        leadFirstName: 'John',
        leadLastName: 'Smith',
        leadDob: null,
        agentName: null,
        agentNpn: null,
        planIdentifier: null,
        leadPhone: null,
        leadEmail: null,
        leadId: null,
      };

      const result = deriveStatus(
        parserId,
        {
          trueEffectiveDate: '2026-01-01',
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
          trueEffectiveDate: null,
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
          trueEffectiveDate: '2026-01-01',
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
});
