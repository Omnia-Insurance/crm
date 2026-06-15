import {
  buildBrokerEffAuditInput,
  buildStatusInputFromMapping,
  deriveBrokerEffAudit,
  deriveCanceledStatus,
  deriveStatus,
  evaluateAcaPlacement,
  findPreviousVersion,
  getCancelExpireDate,
  getCurrentCrmStatus,
  getStatusEngine,
  isFullEffectiveMonthPaid,
  isKnownStatusEngine,
  isPaidThroughCurrentMonth,
  lastDayOfMonth,
  resolveEffectiveDateHeader,
  validateStatusEngineParams,
  DEFAULT_STATUS_ENGINE_CONFIG,
  STATUS_ENGINE_IDS,
  STATUS_ENGINE_ROLE_TYPES,
  STATUS_ENGINES,
  STATUS_ROLES,
  type StatusEngineDescriptor,
  type StatusInput,
} from 'src/modules/reconciliation/engines/status';
import { REQUIRED_STATUS_ENGINE_ROLES } from 'src/modules/reconciliation/parsers/transforms';
import type { CrmPolicy } from 'src/modules/reconciliation/engines/matching';
import {
  deriveCategory,
  deriveFlags,
} from 'src/modules/reconciliation/types/field-config';
import type { ColumnMapping } from 'src/modules/reconciliation/types/reconciliation';

const today = new Date('2026-04-13');

describe('status engine (ambetter-bob-v1)', () => {
  const parserId = 'ambetter-bob-v1';
  const makeCrmPolicy = (overrides: Partial<CrmPolicy>): CrmPolicy => ({
    id: 'policy-id',
    policyNumber: 'U94692964',
    applicationId: null,
    externalPolicyId: null,
    effectiveDate: '2026-01-01',
    expirationDate: null,
    paidThroughDate: null,
    status: 'ACTIVE_PLACED',
    applicantCount: null,
    'premium.amountMicros': null,
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
    ...overrides,
  });

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

    it('4.1.1: eligible=false preserves payment-error context when CRM was active payment-error', () => {
      const currentPolicy = makeCrmPolicy({
        id: 'payment-error-policy',
        status: 'PAYMENT_ERROR_ACTIVE_PLACED',
      });
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-03-01',
          termDate: null,
          eligibleForCommission: false,
        },
        [currentPolicy],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
        currentPolicy.id,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_CANCELED');
      expect(result?.derivedExpireDate).toBe('2026-03-01');
      expect(result?.statusChangeReason).toContain('Payment Error-Canceled');
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

    it('4.1.2: term date in past preserves payment-error context when CRM was approved payment-error', () => {
      const currentPolicy = makeCrmPolicy({
        id: 'payment-error-policy',
        status: 'PAYMENT_ERROR_ACTIVE_APPROVED',
      });
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-03-01',
          termDate: '2026-03-15',
          eligibleForCommission: true,
        },
        [currentPolicy],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
        currentPolicy.id,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_CANCELED');
      expect(result?.statusChangeReason).toContain('Payment Error-Canceled');
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

    it('active effective date with no payment data → PAYMENT_ERROR_ACTIVE_APPROVED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-05-01',
          paidThroughDate: null,
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-06-09'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
      expect(result?.statusChangeReason).toContain('No payment data');
      expect(result?.statusChangeReason).toContain(
        'current month end 2026-06-30',
      );
    });

    it('active effective date with paid-through before effective date treats payment as missing', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-06-01',
          paidThroughDate: '2026-01-31',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-06-09'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
      expect(result?.statusChangeReason).toContain('No payment data');
      expect(result?.statusChangeReason).not.toContain('predates effective');
    });

    it('4.1.4.3: placed (30+ days) with current payment → ACTIVE_PLACED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-04-30',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('4.1.4.4: approved (<30 days) without current-month coverage → PAYMENT_ERROR_ACTIVE_APPROVED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-04-20',
          paidThroughDate: '2026-04-25',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-04-30'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
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
      // paid through doesn't cover current month end 2026-04-30 → payment error
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
        externalPolicyId: null,
        effectiveDate: '2025-01-01',
        expirationDate: null,
        paidThroughDate: null,
        status: 'ACTIVE_PLACED',
        applicantCount: null,
        'premium.amountMicros': null,
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
        'new-policy',
      );

      expect(result?.cancelPreviousPolicyId).toBe('old-policy');
    });

    it('does not cancel the matched policy itself when it is the only older policy', () => {
      const matchedPolicy: CrmPolicy = {
        id: 'matched-policy',
        policyNumber: 'U94692964',
        applicationId: null,
        externalPolicyId: null,
        effectiveDate: '2025-01-01',
        expirationDate: null,
        paidThroughDate: null,
        status: 'ACTIVE_PLACED',
        applicantCount: null,
        'premium.amountMicros': null,
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
        [matchedPolicy],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
        matchedPolicy.id,
      );

      expect(result?.cancelPreviousPolicyId).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('normalizes status input paid-through to null when it predates effective', () => {
      expect(
        buildStatusInputFromMapping(
          {
            policy_effective_date: '2026-06-01',
            paid_through_date: '2026-01-31',
          },
          {
            effectiveDate: 'policy_effective_date',
            paidThroughDate: 'paid_through_date',
          },
        ),
      ).toMatchObject({
        effectiveDate: '2026-06-01',
        paidThroughDate: null,
      });
    });

    it('no effective date and no cancel signal → defaults to ACTIVE_APPROVED', () => {
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

    // Remediation 3.13: the cancel checks (eligibleForCommission=false, past
    // termDate) don't need an effective date — they must run BEFORE the
    // missing-effective-date ACTIVE_APPROVED default. Previously a row that
    // explicitly said "canceled" but had a blank/unparseable effective-date
    // cell derived ACTIVE_APPROVED, the opposite of what the row said.
    describe('missing effective date with cancel signals (3.13)', () => {
      it('eligible=false, no effective date → CANCELED with paidThrough as expire', () => {
        const result = deriveStatus(
          parserId,
          {
            effectiveDate: null,
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

      it('eligible=false, no effective date, no paidThrough → falls back to termDate', () => {
        const result = deriveStatus(
          parserId,
          {
            effectiveDate: null,
            paidThroughDate: null,
            termDate: '2026-02-28',
            eligibleForCommission: false,
          },
          [],
          today,
          DEFAULT_STATUS_ENGINE_CONFIG,
        );

        expect(result?.derivedStatus).toBe('CANCELED');
        expect(result?.derivedExpireDate).toBe('2026-02-28');
      });

      it('eligible=false, no dates at all → CANCELED with null expire', () => {
        const result = deriveStatus(
          parserId,
          {
            effectiveDate: null,
            paidThroughDate: null,
            termDate: null,
            eligibleForCommission: false,
          },
          [],
          today,
          DEFAULT_STATUS_ENGINE_CONFIG,
        );

        expect(result?.derivedStatus).toBe('CANCELED');
        expect(result?.derivedExpireDate).toBeNull();
        expect(result?.statusChangeReason).toContain(
          'Not eligible for commission',
        );
      });

      it('eligible=false, no effective date, CRM payment-error → PAYMENT_ERROR_CANCELED', () => {
        const currentPolicy = makeCrmPolicy({
          id: 'payment-error-policy',
          status: 'PAYMENT_ERROR_ACTIVE_PLACED',
        });
        const result = deriveStatus(
          parserId,
          {
            effectiveDate: null,
            paidThroughDate: null,
            termDate: null,
            eligibleForCommission: false,
          },
          [currentPolicy],
          today,
          DEFAULT_STATUS_ENGINE_CONFIG,
          currentPolicy.id,
        );

        expect(result?.derivedStatus).toBe('PAYMENT_ERROR_CANCELED');
      });

      it('past termDate, no effective date → CANCELED with paidThrough as expire', () => {
        const result = deriveStatus(
          parserId,
          {
            effectiveDate: null,
            paidThroughDate: '2026-03-31',
            termDate: '2026-03-15',
            eligibleForCommission: true,
          },
          [],
          today,
          DEFAULT_STATUS_ENGINE_CONFIG,
        );

        expect(result?.derivedStatus).toBe('CANCELED');
        expect(result?.derivedExpireDate).toBe('2026-03-31');
      });

      it('past termDate, no effective date, no paidThrough → expire=termDate', () => {
        const result = deriveStatus(
          parserId,
          {
            effectiveDate: null,
            paidThroughDate: null,
            termDate: '2026-03-15',
            eligibleForCommission: null,
          },
          [],
          today,
          DEFAULT_STATUS_ENGINE_CONFIG,
        );

        expect(result?.derivedStatus).toBe('CANCELED');
        expect(result?.derivedExpireDate).toBe('2026-03-15');
      });

      it('future termDate, no effective date → still defaults to ACTIVE_APPROVED', () => {
        const result = deriveStatus(
          parserId,
          {
            effectiveDate: null,
            paidThroughDate: null,
            termDate: '2026-12-31',
            eligibleForCommission: true,
          },
          [],
          today,
          DEFAULT_STATUS_ENGINE_CONFIG,
        );

        expect(result?.derivedStatus).toBe('ACTIVE_APPROVED');
        expect(result?.derivedExpireDate).toBeNull();
      });
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

    // Remediation 3.15: subtraction previously mixed UTC parsing with
    // local-time setDate/getDate, so under a DST-observing server timezone
    // the day before 2026-11-02 came back as 2026-10-31 (US DST ends
    // 2026-11-01). All arithmetic is now UTC, matching lastDayOfMonth.
    it('is not off by one across a DST fall-back boundary', () => {
      const originalTz = process.env.TZ;

      try {
        process.env.TZ = 'America/New_York';

        expect(getCancelExpireDate('2026-11-02')).toBe('2026-11-01');
        // Spring-forward boundary (US DST starts 2026-03-08) for symmetry.
        expect(getCancelExpireDate('2026-03-09')).toBe('2026-03-08');
      } finally {
        if (originalTz === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = originalTz;
        }
      }
    });

    it('crosses month boundaries in UTC regardless of timezone', () => {
      expect(getCancelExpireDate('2026-11-01')).toBe('2026-10-31');
      expect(getCancelExpireDate('2026-03-01')).toBe('2026-02-28');
    });
  });

  // Remediation 3.14: REINSTATEMENT must fire for EVERY terminal→active
  // transition, not just exact CRM 'CANCELED'. The flag blocks batch approval
  // and learned-rule auto-apply, so PAYMENT_ERROR_CANCELED/DECLINED/INCOMPLETE
  // → active transitions previously bypassed the human-review gate.
  // Intentional behavior change called out: terminal→terminal moves (e.g.
  // CANCELED → PAYMENT_ERROR_CANCELED) used to flag REINSTATEMENT under the
  // old exact-'CANCELED' check; they no longer do, consistent with the
  // negative-to-negative suppression in the diff engine and STATUS_CHANGE.
  describe('deriveFlags REINSTATEMENT (terminal → active)', () => {
    it.each([
      // [crm status, derived status, expects flag]
      ['CANCELED', 'ACTIVE_PLACED', true],
      ['CANCELED', 'ACTIVE_APPROVED', true],
      ['PAYMENT_ERROR_CANCELED', 'ACTIVE_PLACED', true],
      ['PAYMENT_ERROR_CANCELED', 'ACTIVE_APPROVED', true],
      ['PAYMENT_ERROR_CANCELED', 'PAYMENT_ERROR_ACTIVE_PLACED', true],
      ['DECLINED', 'ACTIVE_PLACED', true],
      ['INCOMPLETE', 'PAYMENT_ERROR_ACTIVE_APPROVED', true],
      // terminal → terminal: outcome unchanged, not a reinstatement
      ['CANCELED', 'PAYMENT_ERROR_CANCELED', false],
      ['PAYMENT_ERROR_CANCELED', 'CANCELED', false],
      ['DECLINED', 'CANCELED', false],
      // active → anything: not a reinstatement
      ['ACTIVE_PLACED', 'CANCELED', false],
      ['ACTIVE_APPROVED', 'ACTIVE_PLACED', false],
    ] as const)(
      'CRM %s → BOB %s: flag=%s',
      (currentCrmStatus, derivedStatus, expectsFlag) => {
        const { flags, reasons } = deriveFlags(
          derivedStatus,
          currentCrmStatus,
          'POLICY_NUMBER_EXACT',
          [],
        );

        expect(flags.includes('REINSTATEMENT')).toBe(expectsFlag);

        if (expectsFlag) {
          expect(reasons.REINSTATEMENT).toBe(
            `CRM ${currentCrmStatus} → BOB ${derivedStatus}`,
          );
        } else {
          expect(reasons.REINSTATEMENT).toBeUndefined();
        }
      },
    );

    it('does not flag when either side is missing', () => {
      expect(
        deriveFlags(null, 'CANCELED', 'POLICY_NUMBER_EXACT', []).flags,
      ).not.toContain('REINSTATEMENT');
      expect(
        deriveFlags('ACTIVE_PLACED', null, 'POLICY_NUMBER_EXACT', []).flags,
      ).not.toContain('REINSTATEMENT');
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
        new Date('2026-02-28'),
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
        new Date('2026-03-31'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('eff 3/1, paid 3/29 → PAYMENT_ERROR_ACTIVE_APPROVED (March not fully paid)', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-03-01',
          paidThroughDate: '2026-03-29',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-03-31'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
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
        new Date('2026-01-31'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('full-month paid + payment error → PAYMENT_ERROR_ACTIVE_PLACED', () => {
      // Eff 2/1, paid 2/28, but today is 4/13 → paid-through does not
      // cover current month end 4/30. Still placed via calendar-month rule.
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

  describe('Ambetter month-ahead payment rule', () => {
    it('paid through prior month on the 1st → PAYMENT_ERROR_ACTIVE_PLACED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-05-01',
          paidThroughDate: '2026-05-31',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-06-01'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
      expect(result?.statusChangeReason).toContain(
        'current month end 2026-06-30',
      );
    });

    it('paid through prior month during the current month stays payment error', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-05-01',
          paidThroughDate: '2026-05-31',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-06-09'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
    });

    it('paid through current month end → ACTIVE_PLACED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-05-01',
          paidThroughDate: '2026-06-30',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-06-01'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('ACTIVE_PLACED');
    });

    it('payment error before first full month paid → PAYMENT_ERROR_ACTIVE_APPROVED', () => {
      const result = deriveStatus(
        parserId,
        {
          effectiveDate: '2026-05-01',
          paidThroughDate: '2026-05-15',
          termDate: null,
          eligibleForCommission: true,
        },
        [],
        new Date('2026-06-01'),
        DEFAULT_STATUS_ENGINE_CONFIG,
      );

      expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
    });
  });
});

// Remediation 4.3: the registry is exported so loadMatchContext can fail
// fast at MATCH on unknown engine ids instead of silently deriving null
// statuses for every row.
describe('status engine registry (4.3)', () => {
  it('knows the ambetter engine', () => {
    expect(isKnownStatusEngine('ambetter-bob-v1')).toBe(true);
    expect(STATUS_ENGINE_IDS).toContain('ambetter-bob-v1');
  });

  it('rejects unknown ids', () => {
    expect(isKnownStatusEngine('oscar-bob-v1')).toBe(false);
    expect(isKnownStatusEngine('')).toBe(false);
    expect(isKnownStatusEngine('hasOwnProperty')).toBe(false);
  });

  it('every registered id passes the guard', () => {
    for (const id of STATUS_ENGINE_IDS) {
      expect(isKnownStatusEngine(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Self-describing registry (multi-carrier audit 2026-06-11): descriptors
// declare their own role/param contract, so jobs validate per ENGINE.
// ---------------------------------------------------------------------------
describe('self-describing status-engine registry', () => {
  it('every descriptor is internally consistent (id matches key, roles known, described)', () => {
    for (const [key, descriptor] of Object.entries(STATUS_ENGINES)) {
      expect(descriptor.id).toBe(key);
      expect(descriptor.description.length).toBeGreaterThan(0);
      expect(typeof descriptor.derive).toBe('function');

      // requiredRoles ⊆ knownRoles. (knownRoles may exceed the global
      // STATUS_ROLES vocabulary: extraRoles-channel engines declare their
      // extra signal names here — see status-engine-authoring.md.)
      for (const role of descriptor.requiredRoles) {
        expect(descriptor.knownRoles).toContain(role);
      }
    }
  });

  it('ambetter-bob-v1 declares its real input contract', () => {
    const ambetter = STATUS_ENGINES['ambetter-bob-v1'];

    expect(ambetter.requiredRoles).toEqual([
      'effectiveDate',
      'paidThroughDate',
    ]);
    expect([...ambetter.knownRoles].sort()).toEqual(
      [
        'brokerEffectiveDate',
        'effectiveDate',
        'eligibleForCommission',
        'paidThroughDate',
        'policyEffectiveDate',
        'termDate',
      ].sort(),
    );
    expect(ambetter.paramsSchema).toBeDefined();
  });

  it('stays in lockstep with the deprecated REQUIRED_STATUS_ENGINE_ROLES global', () => {
    // The global is kept only as the legacy default for
    // validateStatusRoleMapping; it must equal the Ambetter descriptor's
    // requiredRoles until it is deleted.
    expect(STATUS_ENGINES['ambetter-bob-v1'].requiredRoles).toEqual(
      REQUIRED_STATUS_ENGINE_ROLES,
    );
  });

  it('STATUS_ROLES and STATUS_ENGINE_ROLE_TYPES cover the same vocabulary', () => {
    expect([...STATUS_ROLES].sort()).toEqual(
      Object.keys(STATUS_ENGINE_ROLE_TYPES).sort(),
    );
  });

  it('getStatusEngine returns descriptors for known ids and null otherwise', () => {
    expect(getStatusEngine('ambetter-bob-v1')).toBe(
      STATUS_ENGINES['ambetter-bob-v1'],
    );
    expect(getStatusEngine('uho-bob-v1')).toBeNull();
    expect(getStatusEngine('hasOwnProperty')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// engineParams channel (statusConfig.engineParams → paramsSchema → derive)
// ---------------------------------------------------------------------------
describe('validateStatusEngineParams', () => {
  const ambetter = STATUS_ENGINES['ambetter-bob-v1'];

  it('returns {} for null/undefined/empty params (legacy configs untouched)', () => {
    expect(validateStatusEngineParams(ambetter, null)).toEqual({});
    expect(validateStatusEngineParams(ambetter, undefined)).toEqual({});
    expect(validateStatusEngineParams(ambetter, {})).toEqual({});
  });

  it('passes valid Ambetter params through', () => {
    expect(
      validateStatusEngineParams(ambetter, { placedThresholdDays: 45 }),
    ).toEqual({ placedThresholdDays: 45 });
  });

  it('rejects mistyped params with an actionable message naming the key', () => {
    expect(() =>
      validateStatusEngineParams(ambetter, { placedThresholdDays: 'thirty' }),
    ).toThrow(
      /Invalid statusConfig\.engineParams for status engine "ambetter-bob-v1": placedThresholdDays:.*Fix statusConfig\.engineParams/s,
    );
  });

  it('rejects unknown param keys (typo protection — schema is strict)', () => {
    expect(() =>
      validateStatusEngineParams(ambetter, { placedThresholdDay: 45 }),
    ).toThrow(
      /Invalid statusConfig\.engineParams for status engine "ambetter-bob-v1"/,
    );
  });

  it('rejects non-empty params for engines that accept none', () => {
    const paramless: StatusEngineDescriptor = {
      id: 'paramless-test-engine',
      derive: ambetter.derive,
      requiredRoles: [],
      knownRoles: [],
      description: 'test',
    };

    expect(() =>
      validateStatusEngineParams(paramless, { anything: 1 }),
    ).toThrow(
      'Status engine "paramless-test-engine" accepts no engineParams, but ' +
        'statusConfig.engineParams is set (keys: anything). Remove ' +
        'statusConfig.engineParams from the carrier config and re-run.',
    );
  });
});

describe('engineParams reach deriveStatus (Ambetter placedThresholdDays)', () => {
  // eff 2026-03-20, paid 2026-03-25: 5 days, full effective month NOT paid
  // (3/25 < 3/31), and paid-through short of the current month end
  // (today 2026-04-13 → 2026-04-30) → payment error either way; placement
  // decides PLACED vs APPROVED.
  const input: StatusInput = {
    effectiveDate: '2026-03-20',
    paidThroughDate: '2026-03-25',
    termDate: null,
    eligibleForCommission: true,
  };

  it('engineParams.placedThresholdDays overrides the legacy statusConfig knob', () => {
    const result = deriveStatus('ambetter-bob-v1', input, [], today, {
      placedThresholdDays: 30,
      paymentErrorAgeDays: 10,
      engineParams: { placedThresholdDays: 5 },
    });

    expect(result?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
  });

  it('falls back to the legacy statusConfig.placedThresholdDays when engineParams is absent', () => {
    const withLegacyKnob = deriveStatus('ambetter-bob-v1', input, [], today, {
      placedThresholdDays: 30,
      paymentErrorAgeDays: 10,
    });
    const withEmptyParams = deriveStatus('ambetter-bob-v1', input, [], today, {
      placedThresholdDays: 30,
      paymentErrorAgeDays: 10,
      engineParams: {},
    });

    expect(withLegacyKnob?.derivedStatus).toBe('PAYMENT_ERROR_ACTIVE_APPROVED');
    // Empty engineParams behaves exactly like no engineParams.
    expect(withEmptyParams).toEqual(withLegacyKnob);
  });
});

// ---------------------------------------------------------------------------
// Open input channel: StatusInput.extraRoles
// ---------------------------------------------------------------------------
describe('StatusInput.extraRoles (open input channel)', () => {
  it('populates extraRoles from fieldMapping keys outside the known vocabulary', () => {
    const input = buildStatusInputFromMapping(
      {
        'Coverage Start': '2026-01-01',
        'Paid To': '2026-02-28',
        'Carrier Status': 'TERMED',
        'Premium Paid': 123.45,
        'Auto Pay': true,
      },
      {
        effectiveDate: 'Coverage Start',
        paidThroughDate: 'Paid To',
        carrierStatus: 'Carrier Status',
        premiumPaid: 'Premium Paid',
        autoPay: 'Auto Pay',
        lapseDate: 'Lapse Date', // header absent from the row → null
      },
    );

    expect(input.effectiveDate).toBe('2026-01-01');
    expect(input.extraRoles).toEqual({
      carrierStatus: 'TERMED',
      premiumPaid: 123.45,
      autoPay: true,
      lapseDate: null,
    });
  });

  it('known roles never leak into extraRoles', () => {
    const input = buildStatusInputFromMapping(
      {
        eff: '2026-01-01',
        paid: '2026-02-28',
        term: '2026-12-31',
        elig: true,
        broker: '2026-01-01',
        policy: '2026-01-01',
      },
      {
        effectiveDate: 'eff',
        paidThroughDate: 'paid',
        termDate: 'term',
        eligibleForCommission: 'elig',
        brokerEffectiveDate: 'broker',
        policyEffectiveDate: 'policy',
      },
    );

    expect(input.extraRoles).toEqual({});
  });

  it('ambetter-bob-v1 ignores extraRoles entirely (decision is bit-identical)', () => {
    const base: StatusInput = {
      effectiveDate: '2026-01-01',
      paidThroughDate: '2026-02-28',
      termDate: null,
      eligibleForCommission: true,
    };
    const withBag: StatusInput = {
      ...base,
      extraRoles: {
        carrierStatus: 'TERMED', // a signal Ambetter must NOT read
        premiumPaid: 0,
        eligibleForCommission: false, // a role-name collision in the bag
      },
    };

    const policies = [
      makeCrmPolicyForRegistry({ id: 'p1', effectiveDate: '2025-01-01' }),
    ];

    expect(
      deriveStatus(
        'ambetter-bob-v1',
        withBag,
        policies,
        today,
        undefined,
        'p0',
      ),
    ).toEqual(
      deriveStatus('ambetter-bob-v1', base, policies, today, undefined, 'p0'),
    );
  });
});

// ---------------------------------------------------------------------------
// Exported generic ACA mechanics: parity with the engine they were extracted
// from (NO behavior change — same fixtures, same answers).
// ---------------------------------------------------------------------------
const makeCrmPolicyForRegistry = (
  overrides: Partial<CrmPolicy>,
): CrmPolicy => ({
  id: 'policy-id',
  policyNumber: 'U94692964',
  applicationId: null,
  externalPolicyId: null,
  effectiveDate: '2026-01-01',
  expirationDate: null,
  paidThroughDate: null,
  status: 'ACTIVE_PLACED',
  applicantCount: null,
  'premium.amountMicros': null,
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
  ...overrides,
});

describe('exported generic ACA mechanics', () => {
  describe('lastDayOfMonth', () => {
    it('resolves month ends including leap years', () => {
      expect(lastDayOfMonth('2026-02-15')).toBe('2026-02-28');
      expect(lastDayOfMonth('2024-02-01')).toBe('2024-02-29');
      expect(lastDayOfMonth('2026-03-15')).toBe('2026-03-31');
      expect(lastDayOfMonth('2026-12-31')).toBe('2026-12-31');
    });

    it('returns null for unparseable input', () => {
      expect(lastDayOfMonth('not-a-date')).toBeNull();
    });
  });

  describe('isPaidThroughCurrentMonth', () => {
    it('true exactly when paid-through covers the current month end', () => {
      expect(isPaidThroughCurrentMonth('2026-04-30', '2026-04-13')).toBe(true);
      expect(isPaidThroughCurrentMonth('2026-05-01', '2026-04-13')).toBe(true);
      expect(isPaidThroughCurrentMonth('2026-04-29', '2026-04-13')).toBe(false);
    });

    it('parity: drives the engine PAYMENT_ERROR split for placed rows', () => {
      const derive = (paidThroughDate: string) =>
        deriveStatus(
          'ambetter-bob-v1',
          {
            effectiveDate: '2026-01-01',
            paidThroughDate,
            termDate: null,
            eligibleForCommission: true,
          },
          [],
          today, // 2026-04-13
        )?.derivedStatus;

      // Same boundary as the helper: 2026-04-30 current, 2026-04-29 not.
      expect(derive('2026-04-30')).toBe('ACTIVE_PLACED');
      expect(derive('2026-04-29')).toBe('PAYMENT_ERROR_ACTIVE_PLACED');
    });
  });

  describe('evaluateAcaPlacement', () => {
    it('calendar-month rule: full effective month paid places short months', () => {
      expect(evaluateAcaPlacement('2026-02-01', '2026-02-28', 30)).toEqual({
        isPlaced: true,
        fullMonthPaid: true,
        daysSinceEffective: 27,
      });
    });

    it('days-based fallback places rows whose paid-through stops short of the month end', () => {
      // 5 days elapsed ≥ threshold 5, but 3/25 < 3/31 so no full month.
      expect(evaluateAcaPlacement('2026-03-20', '2026-03-25', 5)).toEqual({
        isPlaced: true,
        fullMonthPaid: false,
        daysSinceEffective: 5,
      });
      // The mid-month case from the engine comment: eff 1/15 paid 2/14
      // covers January's month end, so BOTH rules fire there.
      expect(evaluateAcaPlacement('2026-01-15', '2026-02-14', 30)).toEqual({
        isPlaced: true,
        fullMonthPaid: true,
        daysSinceEffective: 30,
      });
    });

    it('neither rule → not placed', () => {
      expect(evaluateAcaPlacement('2026-03-20', '2026-03-25', 30)).toEqual({
        isPlaced: false,
        fullMonthPaid: false,
        daysSinceEffective: 5,
      });
    });

    it('parity: agrees with the engine PLACED/APPROVED split over a fixture grid', () => {
      const fixtures: { effectiveDate: string; paidThroughDate: string }[] = [
        { effectiveDate: '2026-02-01', paidThroughDate: '2026-02-28' },
        { effectiveDate: '2026-01-15', paidThroughDate: '2026-02-14' },
        { effectiveDate: '2026-03-20', paidThroughDate: '2026-03-25' },
        { effectiveDate: '2026-01-01', paidThroughDate: '2026-04-30' },
        { effectiveDate: '2026-04-01', paidThroughDate: '2026-04-13' },
      ];

      for (const { effectiveDate, paidThroughDate } of fixtures) {
        const placement = evaluateAcaPlacement(
          effectiveDate,
          paidThroughDate,
          DEFAULT_STATUS_ENGINE_CONFIG.placedThresholdDays,
        );
        const decision = deriveStatus(
          'ambetter-bob-v1',
          {
            effectiveDate,
            paidThroughDate,
            termDate: null,
            eligibleForCommission: true,
          },
          [],
          today,
        );

        expect(decision?.derivedStatus.endsWith('PLACED')).toBe(
          placement.isPlaced,
        );
      }
    });
  });

  describe('findPreviousVersion', () => {
    const policies = [
      makeCrmPolicyForRegistry({ id: 'v2024', effectiveDate: '2024-01-01' }),
      makeCrmPolicyForRegistry({ id: 'v2025', effectiveDate: '2025-01-01' }),
      makeCrmPolicyForRegistry({ id: 'v2026', effectiveDate: '2026-01-01' }),
    ];

    it('picks the most recent version strictly before the new effective date', () => {
      expect(findPreviousVersion(policies, '2026-01-01', 'v2026')).toBe(
        'v2025',
      );
    });

    it('excludes the currently matched policy', () => {
      expect(findPreviousVersion(policies, '2025-06-01', 'v2025')).toBe(
        'v2024',
      );
    });

    it('returns null when nothing precedes', () => {
      expect(findPreviousVersion(policies, '2024-01-01', 'v2024')).toBeNull();
      expect(findPreviousVersion([], '2026-01-01')).toBeNull();
    });

    it('parity: matches the engine cancelPreviousPolicyId for the same cohort', () => {
      const decision = deriveStatus(
        'ambetter-bob-v1',
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-04-30',
          termDate: null,
          eligibleForCommission: true,
        },
        policies,
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
        'v2026',
      );

      expect(decision?.cancelPreviousPolicyId).toBe(
        findPreviousVersion(policies, '2026-01-01', 'v2026'),
      );
    });
  });

  describe('getCurrentCrmStatus', () => {
    const policies = [
      makeCrmPolicyForRegistry({ id: 'a', status: 'ACTIVE_PLACED' }),
      makeCrmPolicyForRegistry({
        id: 'b',
        status: 'PAYMENT_ERROR_ACTIVE_PLACED',
      }),
    ];

    it('resolves the matched policy status from the cohort', () => {
      expect(getCurrentCrmStatus(policies, 'b')).toBe(
        'PAYMENT_ERROR_ACTIVE_PLACED',
      );
    });

    it('null when unmatched or absent', () => {
      expect(getCurrentCrmStatus(policies, null)).toBeNull();
      expect(getCurrentCrmStatus(policies, undefined)).toBeNull();
      expect(getCurrentCrmStatus(policies, 'nope')).toBeNull();
    });
  });

  describe('deriveCanceledStatus', () => {
    it('preserves the PAYMENT_ERROR prefix; plain CANCELED otherwise', () => {
      expect(deriveCanceledStatus('PAYMENT_ERROR_ACTIVE_PLACED')).toBe(
        'PAYMENT_ERROR_CANCELED',
      );
      expect(deriveCanceledStatus('PAYMENT_ERROR_ACTIVE_APPROVED')).toBe(
        'PAYMENT_ERROR_CANCELED',
      );
      expect(deriveCanceledStatus('ACTIVE_PLACED')).toBe('CANCELED');
      expect(deriveCanceledStatus(null)).toBe('CANCELED');
    });

    it('parity: matches the engine cancel decision for an ineligible row', () => {
      const decision = deriveStatus(
        'ambetter-bob-v1',
        {
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-03-01',
          termDate: null,
          eligibleForCommission: false,
        },
        [
          makeCrmPolicyForRegistry({
            id: 'pe',
            status: 'PAYMENT_ERROR_ACTIVE_PLACED',
          }),
        ],
        today,
        DEFAULT_STATUS_ENGINE_CONFIG,
        'pe',
      );

      expect(decision?.derivedStatus).toBe(
        deriveCanceledStatus('PAYMENT_ERROR_ACTIVE_PLACED'),
      );
    });
  });
});

// Remediation 4.3 (deferred 3.13): a null derivedStatus means "no status
// assertion", not "status changed". The old `derivedStatus !==
// currentCrmStatus` comparison promoted every null-status row with a real
// CRM status to an empty UPDATE review item (no diffs, no STATUS_CHANGE
// flag, nothing to apply) — the queue-flooding pathology. No existing test
// encoded the old behavior; these lock in the fix.
describe('deriveCategory (4.3 null = no status assertion)', () => {
  it('null derivedStatus + real CRM status + no diffs → confirmed (null), not UPDATE', () => {
    expect(deriveCategory(false, [], null, 'ACTIVE_PLACED')).toBeNull();
  });

  it('null derivedStatus + null CRM status + no diffs → confirmed (null)', () => {
    expect(deriveCategory(false, [], null, null)).toBeNull();
  });

  it('null derivedStatus with diffs still promotes to UPDATE', () => {
    const diff = {
      field: 'effectiveDate',
      label: 'Effective Date',
      bobValue: '2026-01-01',
      crmValue: '2025-01-01',
      action: 'UPDATE',
      severity: 'WARNING',
      approval: 'PENDING',
      crmField: 'effectiveDate',
      crmObjectType: 'policy',
      note: null,
    } as const;

    expect(deriveCategory(false, [diff], null, 'ACTIVE_PLACED')).toBe(
      'UPDATE',
    );
  });

  it('real status disagreement still promotes to UPDATE', () => {
    expect(deriveCategory(false, [], 'CANCELED', 'ACTIVE_PLACED')).toBe(
      'UPDATE',
    );
  });

  it('asserted status over a null CRM status promotes to UPDATE', () => {
    expect(deriveCategory(false, [], 'ACTIVE_PLACED', null)).toBe('UPDATE');
  });

  it('negative-to-negative status change does not promote', () => {
    expect(deriveCategory(false, [], 'CANCELED', 'DECLINED')).toBeNull();
  });

  it('agreeing statuses with no diffs → confirmed (null)', () => {
    expect(
      deriveCategory(false, [], 'ACTIVE_PLACED', 'ACTIVE_PLACED'),
    ).toBeNull();
  });

  it('unmatched rows are always UNMATCHED', () => {
    expect(deriveCategory(true, [], null, null)).toBe('UNMATCHED');
  });
});

// OMN-12 tuning depth: deriveCategory/deriveFlags accept the per-carrier
// status-change gate (statusVocabulary.negativeTerminalStatuses +
// diffConfig.suppressNegativeToNegativeStatus) so they stay in lockstep with
// the diff engine's status-diff suppression. Unset = today's behavior
// (already pinned by the suites above); each knob demonstrably moves it.
describe('status-change gate knobs (OMN-12 tuning depth)', () => {
  describe('deriveCategory', () => {
    it('an empty gate object is bit-for-bit the implicit default', () => {
      expect(deriveCategory(false, [], 'CANCELED', 'DECLINED', {})).toBeNull();
      expect(deriveCategory(false, [], 'CANCELED', 'ACTIVE_PLACED', {})).toBe(
        'UPDATE',
      );
    });

    it('suppressNegativeToNegativeStatus=false promotes terminal-to-terminal moves', () => {
      expect(
        deriveCategory(false, [], 'CANCELED', 'DECLINED', {
          suppressNegativeToNegativeStatus: false,
        }),
      ).toBe('UPDATE');
    });

    it('a grown set (workspace-added LAPSED) demotes CANCELED-over-LAPSED to confirmed', () => {
      // Default vocabulary: LAPSED is unknown → status change → UPDATE.
      expect(deriveCategory(false, [], 'CANCELED', 'LAPSED')).toBe('UPDATE');

      // Carrier declares LAPSED terminal → terminal-to-terminal → confirmed
      // (mirrors the diff engine suppressing the status diff, so no ghost
      // empty UPDATE item is created).
      expect(
        deriveCategory(false, [], 'CANCELED', 'LAPSED', {
          negativeTerminalStatuses: new Set([
            'CANCELED',
            'PAYMENT_ERROR_CANCELED',
            'DECLINED',
            'INCOMPLETE',
            'LAPSED',
          ]),
        }),
      ).toBeNull();
    });
  });

  describe('deriveFlags STATUS_CHANGE', () => {
    it('suppressNegativeToNegativeStatus=false flags terminal-to-terminal moves', () => {
      const defaultGate = deriveFlags(
        'CANCELED',
        'DECLINED',
        'POLICY_NUMBER_EXACT',
        [],
      );

      expect(defaultGate.flags).not.toContain('STATUS_CHANGE');

      const surfaced = deriveFlags(
        'CANCELED',
        'DECLINED',
        'POLICY_NUMBER_EXACT',
        [],
        undefined,
        undefined,
        { suppressNegativeToNegativeStatus: false },
      );

      expect(surfaced.flags).toContain('STATUS_CHANGE');
      expect(surfaced.reasons.STATUS_CHANGE).toBe('DECLINED → CANCELED');
    });

    it('a grown set suppresses STATUS_CHANGE for a workspace-added terminal status', () => {
      const defaultGate = deriveFlags(
        'CANCELED',
        'LAPSED',
        'POLICY_NUMBER_EXACT',
        [],
      );

      expect(defaultGate.flags).toContain('STATUS_CHANGE');

      const suppressed = deriveFlags(
        'CANCELED',
        'LAPSED',
        'POLICY_NUMBER_EXACT',
        [],
        undefined,
        undefined,
        { negativeTerminalStatuses: new Set(['CANCELED', 'LAPSED']) },
      );

      expect(suppressed.flags).not.toContain('STATUS_CHANGE');
    });
  });

  describe('deriveFlags REINSTATEMENT', () => {
    it('a grown set flags transitions out of a workspace-added terminal status', () => {
      // LAPSED is unknown to the default set → no flag today.
      const defaultGate = deriveFlags(
        'ACTIVE_PLACED',
        'LAPSED',
        'POLICY_NUMBER_EXACT',
        [],
      );

      expect(defaultGate.flags).not.toContain('REINSTATEMENT');

      // Carrier declares LAPSED terminal → LAPSED → ACTIVE_PLACED is a
      // reinstatement and must hit the human-review gate.
      const flagged = deriveFlags(
        'ACTIVE_PLACED',
        'LAPSED',
        'POLICY_NUMBER_EXACT',
        [],
        undefined,
        undefined,
        {
          negativeTerminalStatuses: new Set([
            'CANCELED',
            'PAYMENT_ERROR_CANCELED',
            'DECLINED',
            'INCOMPLETE',
            'LAPSED',
          ]),
        },
      );

      expect(flagged.flags).toContain('REINSTATEMENT');
      expect(flagged.reasons.REINSTATEMENT).toBe(
        'CRM LAPSED → BOB ACTIVE_PLACED',
      );
    });

    it('a shrunken set stops flagging transitions out of a removed status', () => {
      const shrunk = deriveFlags(
        'ACTIVE_PLACED',
        'DECLINED',
        'POLICY_NUMBER_EXACT',
        [],
        undefined,
        undefined,
        {
          negativeTerminalStatuses: new Set([
            'CANCELED',
            'PAYMENT_ERROR_CANCELED',
          ]),
        },
      );

      expect(shrunk.flags).not.toContain('REINSTATEMENT');
    });
  });
});

// Remediation 4.5: Jackie's broker-eff audit rule — single implementation
// shared by deriveFlags and the match job's unmatched branch.
describe('deriveBrokerEffAudit (4.5)', () => {
  const base = {
    brokerEffectiveDate: '2025-09-01',
    policyEffectiveDate: '2025-08-01',
    paidThroughDate: null,
    eligibleForCommission: null,
    derivedStatus: null,
  };

  describe('table-driven', () => {
    it.each([
      // [name, input overrides, expected flagged, expected reason fragment]
      [
        'canceled via derivedStatus CANCELED',
        { derivedStatus: 'CANCELED' },
        true,
        'Status CANCELED, broker effective 2025-09-01 > policy effective 2025-08-01',
      ],
      [
        'canceled via derivedStatus PAYMENT_ERROR_CANCELED',
        { derivedStatus: 'PAYMENT_ERROR_CANCELED' },
        true,
        'Status CANCELED',
      ],
      [
        'canceled via eligibleForCommission=false (unmatched path — no derived status)',
        { eligibleForCommission: false },
        true,
        'Status CANCELED',
      ],
      [
        'paid-thru lapsed >1 day before broker effective',
        { paidThroughDate: '2025-08-15', derivedStatus: 'ACTIVE_PLACED' },
        true,
        'Paid-thru 2025-08-15, broker effective 2025-09-01 (17d after lapse; policy eff 2025-08-01)',
      ],
      [
        'paid-before takes precedence over the cancel reason',
        { paidThroughDate: '2025-08-15', derivedStatus: 'CANCELED' },
        true,
        'Paid-thru 2025-08-15',
      ],
      [
        'paid-thru exactly 1 day before broker effective does NOT flag',
        { paidThroughDate: '2025-08-31', derivedStatus: 'ACTIVE_PLACED' },
        false,
        '',
      ],
      [
        'paid-thru 2 days before broker effective flags',
        { paidThroughDate: '2025-08-30', derivedStatus: 'ACTIVE_PLACED' },
        true,
        '2d after lapse',
      ],
      [
        'active, paid current, eligible → no flag',
        { paidThroughDate: '2025-12-31', derivedStatus: 'ACTIVE_PLACED' },
        false,
        '',
      ],
      // Precondition: brokerEffective > policyEffective ("dead before we
      // started"). Without it, nothing flags — even canceled rows.
      [
        'no broker effective date → never flags',
        { brokerEffectiveDate: null, derivedStatus: 'CANCELED' },
        false,
        '',
      ],
      [
        'no policy effective date → never flags',
        { policyEffectiveDate: null, derivedStatus: 'CANCELED' },
        false,
        '',
      ],
      [
        'broker effective equal to policy effective → never flags',
        { brokerEffectiveDate: '2025-08-01', derivedStatus: 'CANCELED' },
        false,
        '',
      ],
      [
        'broker effective before policy effective → never flags',
        {
          brokerEffectiveDate: '2025-07-01',
          eligibleForCommission: false,
        },
        false,
        '',
      ],
    ] as const)('%s', (_name, overrides, expectedFlagged, reasonFragment) => {
      const result = deriveBrokerEffAudit({ ...base, ...overrides });

      expect(result.flagged).toBe(expectedFlagged);

      if (expectedFlagged) {
        expect(result.reason).toContain(reasonFragment);
      } else {
        expect(result.reason).toBe('');
      }
    });
  });

  it('produces the exact same reason as deriveFlags for the same row (parity)', () => {
    const statusFieldMapping = {
      brokerEffectiveDate: 'Broker Effective Date',
      policyEffectiveDate: 'Policy Effective Date',
      paidThroughDate: 'Paid Through Date',
      eligibleForCommission: 'Eligible for Commission',
    };
    const row = {
      'Broker Effective Date': '2025-09-01',
      'Policy Effective Date': '2025-08-01',
      'Paid Through Date': '2025-08-15',
      'Eligible for Commission': false,
    };

    const direct = deriveBrokerEffAudit(
      buildBrokerEffAuditInput(row, statusFieldMapping, null),
    );
    const viaFlags = deriveFlags(
      null,
      null,
      'UNMATCHED',
      [],
      statusFieldMapping,
      row,
    );

    expect(direct.flagged).toBe(true);
    expect(viaFlags.flags).toContain('BROKER_EFF_AUDIT');
    expect(viaFlags.reasons.BROKER_EFF_AUDIT).toBe(direct.reason);
  });

  describe('buildBrokerEffAuditInput', () => {
    it('maps roles through statusFieldMapping', () => {
      const input = buildBrokerEffAuditInput(
        {
          'Broker Effective Date': '2025-09-01',
          'Policy Effective Date': '2025-08-01',
          'Paid Through Date': '2025-08-15',
          'Eligible for Commission': true,
        },
        {
          brokerEffectiveDate: 'Broker Effective Date',
          policyEffectiveDate: 'Policy Effective Date',
          paidThroughDate: 'Paid Through Date',
          eligibleForCommission: 'Eligible for Commission',
        },
        'ACTIVE_PLACED',
      );

      expect(input).toEqual({
        brokerEffectiveDate: '2025-09-01',
        policyEffectiveDate: '2025-08-01',
        paidThroughDate: '2025-08-15',
        eligibleForCommission: true,
        derivedStatus: 'ACTIVE_PLACED',
      });
    });

    it('returns nulls for unmapped roles and non-boolean eligibility', () => {
      const input = buildBrokerEffAuditInput(
        { 'Eligible for Commission': 'No' },
        { eligibleForCommission: 'Eligible for Commission' },
        null,
      );

      expect(input.brokerEffectiveDate).toBeNull();
      expect(input.policyEffectiveDate).toBeNull();
      expect(input.paidThroughDate).toBeNull();
      // Raw (untransformed) cell values must not be misread as booleans.
      expect(input.eligibleForCommission).toBeNull();
    });
  });
});

// Remediation 4.5: one effective-date resolution for the start-date cutoff,
// dedup ordering, and cancel-expire stamping.
describe('resolveEffectiveDateHeader (4.5)', () => {
  const columnMapping: ColumnMapping = {
    'Policy Effective Date': {
      crmField: 'effectiveDate',
      fieldType: 'DATE_TIME',
      fieldKey: 'effectiveDate',
    },
    'Policy Number': {
      crmField: 'policyNumber',
      fieldType: 'TEXT',
      fieldKey: 'policyNumber',
    },
  };

  it('prefers the computed field mapped to effectiveDate (Ambetter True Effective Date)', () => {
    expect(
      resolveEffectiveDateHeader(columnMapping, [
        {
          outputKey: 'True Effective Date',
          method: 'maxDate',
          inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
          type: 'date',
          crmField: 'effectiveDate',
        },
      ]),
    ).toBe('True Effective Date');
  });

  it('falls back to the columnMapping header for carriers without a computed date', () => {
    expect(resolveEffectiveDateHeader(columnMapping, null)).toBe(
      'Policy Effective Date',
    );
    expect(
      resolveEffectiveDateHeader(columnMapping, [
        {
          outputKey: 'Some Other Field',
          method: 'coalesce',
          inputs: ['a', 'b'],
          type: 'text',
        },
      ]),
    ).toBe('Policy Effective Date');
  });

  it('returns undefined when nothing maps to effectiveDate', () => {
    expect(
      resolveEffectiveDateHeader(
        {
          'Policy Number': {
            crmField: 'policyNumber',
            fieldType: 'TEXT',
            fieldKey: 'policyNumber',
          },
        },
        null,
      ),
    ).toBeUndefined();
  });
});
