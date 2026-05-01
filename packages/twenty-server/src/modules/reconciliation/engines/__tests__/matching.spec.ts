import {
  matchRow,
  buildMatchIndexes,
  buildMatchInputFromMapping,
  agentNameMatches,
  memberNameScore,
  datesWithinDays,
  isValidAmbetterPolicyNumber,
  selectByActiveTerm,
  DEFAULT_MATCHING_CONFIG,
  type CrmPolicy,
  type MatchInput,
} from 'src/modules/reconciliation/engines/matching';
import type { ColumnMapping } from 'src/modules/reconciliation/types/reconciliation';

const makePolicy = (overrides: Partial<CrmPolicy> = {}): CrmPolicy => ({
  id: 'policy-1',
  policyNumber: 'U94692964',
  applicationId: null,
  effectiveDate: '2026-01-01',
  expirationDate: null,
  paidThroughDate: null,
  status: 'ACTIVE_PLACED',
  applicantCount: null,
  'premium.amountMicros': null,
  'lead.name.firstName': 'John',
  'lead.name.lastName': 'Smith',
  'lead.dateOfBirth': '1990-05-15',
  'lead.addressCustom.addressState': null,
  'agent.name': 'Omnia Insurance Group',
  'agent.npn': '12345678',
  planIdentifier: null,
  'lead.phones.primaryPhoneNumber': null,
  'lead.emails.primaryEmail': null,
  'lead.id': null,
  ...overrides,
});

const makeMatchInput = (overrides: Partial<MatchInput> = {}): MatchInput => ({
  policyNumber: 'U94692964',
  effectiveDate: '2026-01-01',
  paidThroughDate: null,
  agentName: 'Omnia Insurance Group',
  agentNpn: '12345678',
  memberFirstName: 'John',
  memberLastName: 'Smith',
  memberDob: '1990-05-15',
  ...overrides,
});

describe('matching engine', () => {
  describe('isValidAmbetterPolicyNumber', () => {
    it('accepts U-prefixed numbers', () => {
      expect(isValidAmbetterPolicyNumber('U94692964')).toBe(true);
      expect(isValidAmbetterPolicyNumber('u12345')).toBe(true);
    });

    it('rejects non-U numbers', () => {
      expect(isValidAmbetterPolicyNumber('12345')).toBe(false);
      expect(isValidAmbetterPolicyNumber('FFM123')).toBe(false);
      expect(isValidAmbetterPolicyNumber(null)).toBe(false);
      expect(isValidAmbetterPolicyNumber('')).toBe(false);
    });
  });

  describe('agentNameMatches', () => {
    it('matches exact names', () => {
      expect(agentNameMatches('Omnia Insurance', 'Omnia Insurance')).toBe(true);
    });

    it('matches with company suffixes stripped', () => {
      expect(agentNameMatches('Omnia Insurance LLC', 'Omnia Insurance')).toBe(
        true,
      );
    });

    it('rejects completely different names', () => {
      expect(agentNameMatches('Omnia Insurance', 'Acme Corp')).toBe(false);
    });

    it('handles nulls', () => {
      expect(agentNameMatches(null, 'Omnia')).toBe(false);
      expect(agentNameMatches('Omnia', null)).toBe(false);
    });
  });

  describe('memberNameScore', () => {
    it('returns high score for exact match', () => {
      expect(memberNameScore('John', 'Smith', 'John', 'Smith')).toBeGreaterThan(
        0.95,
      );
    });

    it('returns decent score for minor typos', () => {
      expect(memberNameScore('Marry', 'Jane', 'Mary', 'Jane')).toBeGreaterThan(
        0.85,
      );
    });

    it('returns 0 for nulls', () => {
      expect(memberNameScore(null, 'Smith', 'John', 'Smith')).toBe(0);
    });
  });

  describe('datesWithinDays', () => {
    it('matches same date', () => {
      expect(datesWithinDays('2026-01-01', '2026-01-01', 30)).toBe(true);
    });

    it('matches within tolerance', () => {
      expect(datesWithinDays('2026-01-01', '2026-01-20', 30)).toBe(true);
    });

    it('rejects outside tolerance', () => {
      expect(datesWithinDays('2026-01-01', '2026-06-01', 30)).toBe(false);
    });

    it('handles nulls', () => {
      expect(datesWithinDays(null, '2026-01-01', 30)).toBe(false);
    });
  });

  describe('matchRow', () => {
    it('Tier 2: matches on policy# + date + agent (3-signal)', () => {
      const policies = [makePolicy()];
      const indexes = buildMatchIndexes(policies);
      const row = makeMatchInput();

      const result = matchRow(
        row,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
      expect(result.confidence).toBe(98);
      expect(result.status).toBe('AUTO_MATCHED');
      expect(result.crmPolicyId).toBe('policy-1');
    });

    it('Tier 3: matches on policy# + date when agent differs', () => {
      const policies = [makePolicy({ 'agent.name': 'Different Agency' })];
      const indexes = buildMatchIndexes(policies);
      const row = makeMatchInput();

      const result = matchRow(
        row,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.method).toBe('POLICY_NUMBER_PLUS_EFFECTIVE_DATE');
      expect(result.confidence).toBe(95);
    });

    it('Tier 5: single policy# match when date and agent differ', () => {
      const policies = [
        makePolicy({
          'agent.name': 'Different Agency',
          effectiveDate: '2025-01-01',
        }),
      ];
      const indexes = buildMatchIndexes(policies);
      const row = makeMatchInput();

      const result = matchRow(
        row,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.method).toBe('POLICY_NUMBER_SINGLE');
      expect(result.confidence).toBe(90);
    });

    it('Tier 9: unmatched when no signals match', () => {
      const policies = [
        makePolicy({
          policyNumber: 'U99999999',
          'agent.npn': '00000000',
          'lead.dateOfBirth': '1970-01-01',
          'lead.name.firstName': 'Alice',
          'lead.name.lastName': 'Wonderland',
        }),
      ];
      const indexes = buildMatchIndexes(policies);
      const row = makeMatchInput();

      const result = matchRow(
        row,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.method).toBe('UNMATCHED');
      expect(result.confidence).toBe(0);
      expect(result.crmPolicyId).toBeNull();
    });

    it('Tier 1: override takes precedence', () => {
      const policies = [makePolicy()];
      const indexes = buildMatchIndexes(policies);
      const row = makeMatchInput();
      const overrides = [
        {
          carrierPolicyNumber: 'U94692964',
          carrierName: 'Ambetter',
          crmPolicyId: 'policy-1',
          isActive: true,
        },
      ];

      const result = matchRow(
        row,
        indexes,
        overrides,
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.method).toBe('OVERRIDE');
      expect(result.confidence).toBe(100);
    });

    it('Tier 6: disambiguates multiple policies with same number', () => {
      const policies = [
        makePolicy({ id: 'policy-1', effectiveDate: '2026-01-01' }),
        makePolicy({
          id: 'policy-2',
          effectiveDate: '2025-01-01',
          'agent.name': 'Other Agent',
        }),
      ];
      const indexes = buildMatchIndexes(policies);
      const row = makeMatchInput();

      const result = matchRow(
        row,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      // Should pick policy-1 (closer date + matching agent)
      expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
      expect(result.crmPolicyId).toBe('policy-1');
    });

    // Regression for U73273168: a CRM has two records sharing a policyNumber
    // (the canceled prior plan year + the active renewal). The BOB carries
    // forward the original policy_effective_date, so without term-window
    // disambiguation tier 2/3 picks the canceled record. With the disambig
    // pre-pass, the renewal wins because the BOB's paid_through_date falls
    // inside its [effectiveDate, ∞) window.
    describe('renewal vs. canceled prior-term disambiguation', () => {
      const cancelledPriorTerm = makePolicy({
        id: 'policy-2025',
        effectiveDate: '2025-10-01',
        expirationDate: '2025-12-31',
        status: 'CANCELED',
      });
      const activeRenewal = makePolicy({
        id: 'policy-2026',
        effectiveDate: '2026-01-01',
        expirationDate: null,
        status: 'ACTIVE_PLACED',
      });

      it('picks the active renewal when BOB paid-through is inside its window', () => {
        const indexes = buildMatchIndexes([cancelledPriorTerm, activeRenewal]);
        const row = makeMatchInput({
          // Ambetter renewal BOBs keep the original enrollment date
          effectiveDate: '2025-10-01',
          paidThroughDate: '2026-04-30',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.crmPolicyId).toBe('policy-2026');
        // Tier 2/3 fail (eff dates >30d apart). After term-window narrowing
        // the agent still matches the sole remaining candidate, so Tier 4
        // (POLICY_NUMBER_PLUS_AGENT, 85%) fires — still AUTO_MATCHED, on
        // the *correct* record. The disambiguation note is what matters.
        expect(result.method).toBe('POLICY_NUMBER_PLUS_AGENT');
        expect(result.status).toBe('AUTO_MATCHED');
        expect(result.notes).toContain('term-window disambiguated');
      });

      it('falls all the way to Tier 5 when agent also differs', () => {
        const indexes = buildMatchIndexes([
          { ...cancelledPriorTerm, 'agent.name': 'Original Agent LLC' },
          { ...activeRenewal, 'agent.name': 'New Agent Corp' },
        ]);
        const row = makeMatchInput({
          effectiveDate: '2025-10-01',
          paidThroughDate: '2026-04-30',
          agentName: 'Some Other Broker',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.crmPolicyId).toBe('policy-2026');
        expect(result.method).toBe('POLICY_NUMBER_SINGLE');
        expect(result.confidence).toBe(90);
        expect(result.notes).toContain('term-window disambiguated');
      });

      it('does not narrow when BOB has no paid-through date', () => {
        const indexes = buildMatchIndexes([cancelledPriorTerm, activeRenewal]);
        const row = makeMatchInput({
          effectiveDate: '2025-10-01',
          paidThroughDate: null,
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        // Falls back to legacy behavior — tier 2 picks the prior-term record
        // because its eff date is within 30d of BOB.
        expect(result.crmPolicyId).toBe('policy-2025');
      });

      it('does not narrow when paid-through falls outside every window', () => {
        const indexes = buildMatchIndexes([cancelledPriorTerm, activeRenewal]);
        const row = makeMatchInput({
          effectiveDate: '2025-10-01',
          paidThroughDate: '2024-01-01',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        // Both candidates remain; legacy proximity-based tier 2 fires.
        expect(result.crmPolicyId).toBe('policy-2025');
        expect(result.notes).not.toContain('term-window disambiguated');
      });
    });
  });

  describe('selectByActiveTerm', () => {
    const cancelled = (): CrmPolicy =>
      makePolicy({
        id: 'p-canceled',
        effectiveDate: '2025-10-01',
        expirationDate: '2025-12-31',
      });
    const active = (): CrmPolicy =>
      makePolicy({
        id: 'p-active',
        effectiveDate: '2026-01-01',
        expirationDate: null,
      });

    it('returns null when paidThroughDate is null', () => {
      expect(selectByActiveTerm([cancelled(), active()], null)).toBeNull();
    });

    it('returns null when fewer than 2 candidates (no need to narrow)', () => {
      expect(selectByActiveTerm([active()], '2026-04-30')).toBeNull();
      expect(selectByActiveTerm([], '2026-04-30')).toBeNull();
    });

    it('returns the unique candidate whose window contains paid-through', () => {
      const winner = selectByActiveTerm([cancelled(), active()], '2026-04-30');

      expect(winner?.id).toBe('p-active');
    });

    it('treats null expirationDate as open-ended (still active)', () => {
      const winner = selectByActiveTerm([cancelled(), active()], '2030-01-01');

      expect(winner?.id).toBe('p-active');
    });

    it('returns null when paid-through is before every effective date', () => {
      expect(
        selectByActiveTerm([cancelled(), active()], '2020-01-01'),
      ).toBeNull();
    });

    it('returns null when paid-through is between windows (covers neither)', () => {
      // Canceled ends 2025-12-31, active starts 2026-01-01 — paid-through
      // 2025-12-15 falls inside cancelled but not active. Should pick
      // cancelled (sole match).
      const winner = selectByActiveTerm([cancelled(), active()], '2025-12-15');

      expect(winner?.id).toBe('p-canceled');
    });

    it('returns null when paid-through falls in multiple windows (ambiguous)', () => {
      // Two overlapping policies both covering the same date — engine
      // refuses to guess.
      const overlap1 = makePolicy({
        id: 'overlap-1',
        effectiveDate: '2026-01-01',
        expirationDate: '2026-12-31',
      });
      const overlap2 = makePolicy({
        id: 'overlap-2',
        effectiveDate: '2026-03-01',
        expirationDate: '2026-09-30',
      });

      expect(selectByActiveTerm([overlap1, overlap2], '2026-04-30')).toBeNull();
    });

    it('rejects candidates with malformed dates rather than throwing', () => {
      const broken = makePolicy({
        id: 'p-broken',
        effectiveDate: 'not a date',
      });

      expect(
        selectByActiveTerm([broken, active()], '2026-04-30'),
      ).toMatchObject({ id: 'p-active' });
    });
  });

  describe('buildMatchInputFromMapping', () => {
    const columnMapping: ColumnMapping = {
      policy_no: {
        crmField: 'policyNumber',
        fieldType: 'TEXT',
        fieldKey: 'policyNumber',
      },
      member_first: {
        crmField: 'lead.name.firstName',
        fieldType: 'FULL_NAME',
        fieldKey: 'update:firstName-name (lead)',
      },
      member_email: {
        crmField: 'lead.emails.primaryEmail',
        fieldType: 'EMAILS',
        fieldKey: 'update:primaryEmail-emails (lead)',
      },
    };

    it('extracts roles from registered crmField paths', () => {
      const input = buildMatchInputFromMapping(
        { policy_no: 'U123', member_first: 'Sherry', member_email: 'x@y.z' },
        columnMapping,
      );

      expect(input.policyNumber).toBe('U123');
      expect(input.memberFirstName).toBe('Sherry');
      // Email is in the mapping but not a matching role — should not appear
      // anywhere in MatchInput.
      expect(input.memberLastName).toBeNull();
      expect(input.memberDob).toBeNull();
    });

    it('fires onUnmappedField for typo-shaped crmFields, but not for legitimate non-matching fields', () => {
      const onUnmappedField = jest.fn();

      const typoMapping: ColumnMapping = {
        member_first: {
          // Typo: should be lead.name.firstName
          crmField: 'lead.name.first',
          fieldType: 'FULL_NAME',
          fieldKey: 'whatever',
        },
        member_email: {
          // Legitimate non-matching field — must NOT trigger the warning
          crmField: 'lead.emails.primaryEmail',
          fieldType: 'EMAILS',
          fieldKey: 'whatever',
        },
      };

      buildMatchInputFromMapping({}, typoMapping, undefined, onUnmappedField);

      expect(onUnmappedField).toHaveBeenCalledWith(
        'member_first',
        'lead.name.first',
      );
      expect(onUnmappedField).not.toHaveBeenCalledWith(
        'member_email',
        'lead.emails.primaryEmail',
      );
    });
  });
});
