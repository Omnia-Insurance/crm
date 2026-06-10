import {
  matchRow,
  buildMatchIndexes,
  buildMatchInputFromMapping,
  agentNameMatches,
  memberNameScore,
  datesWithinDays,
  isValidAmbetterPolicyNumber,
  selectByActiveStatus,
  selectByActiveTerm,
  selectByMostRecentEffectiveDate,
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

    // Regression for U73273168 / U70248113: CRM holds two records sharing a
    // policyNumber — a canceled prior version and an active replacement. We
    // never want to update the canceled one: any field-level diff against
    // it is a false correction (effective date, agent, status would all
    // need to flip back to the active term). The narrow-by-active-status
    // pre-pass picks the active candidate before the proximity-based tiers
    // run, regardless of what BOB's paid_through or effective_date look
    // like.
    describe('active-vs-canceled prior-term disambiguation', () => {
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

      it('picks the active candidate when BOB paid-through is inside its window (renewal carry-forward)', () => {
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
        expect(result.notes).toContain('disambiguated');
        expect(result.notes).toContain('active status');
      });

      it('picks the active candidate when BOB describes the new term (re-enrollment)', () => {
        // The opposite of the renewal carry-forward case: BOB's effective
        // date matches the new active term and paid-through is stale (still
        // on the old canceled term's window). Tier-2 catches it because the
        // active-status pre-pass narrowed to the active candidate first.
        const indexes = buildMatchIndexes([cancelledPriorTerm, activeRenewal]);
        const row = makeMatchInput({
          effectiveDate: '2026-01-01',
          paidThroughDate: '2025-12-15',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.crmPolicyId).toBe('policy-2026');
        expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
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
        expect(result.notes).toContain('active status');
      });

      it('still picks the active candidate when BOB has no paid-through date', () => {
        // Active-status narrowing doesn't depend on paid-through, so the
        // active replacement wins even when BOB omits paid-through.
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

        expect(result.crmPolicyId).toBe('policy-2026');
      });

      it('still picks the active candidate when paid-through falls outside every window', () => {
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

        expect(result.crmPolicyId).toBe('policy-2026');
      });

      it('falls back to term-window narrowing when BOTH candidates are non-terminal', () => {
        // Status alone can't disambiguate (both active mid-transition);
        // term-window using paid-through still works as a fallback.
        const indexes = buildMatchIndexes([
          { ...cancelledPriorTerm, status: 'ACTIVE_PLACED' },
          activeRenewal,
        ]);
        const row = makeMatchInput({
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
        expect(result.notes).toContain('paid-through');
      });
    });

    describe('both-versions-canceled disambiguation (most recent wins)', () => {
      // Regression for U90998628: member re-enrolled Feb 1 after a Jan
      // cancel; BOTH CRM versions sat CANCELED when the BOB landed, and the
      // BOB carried the original Jan 1 effective date with a paid-through
      // (12-31) outside both term windows. Active-status and term-window
      // narrowing both punt, and tier 2 latched onto the OLDER policy via
      // exact effective date. Ops rule: anytime we have multiples, update
      // the most recent one.
      const canceledJanTerm = makePolicy({
        id: 'policy-jan',
        effectiveDate: '2026-01-01',
        expirationDate: '2026-01-01',
        status: 'CANCELED',
      });
      const canceledFebTerm = makePolicy({
        id: 'policy-feb',
        effectiveDate: '2026-02-01',
        expirationDate: '2026-03-10',
        status: 'CANCELED',
      });

      it('picks the most recent policy even when BOB effective date exactly matches the older one', () => {
        const indexes = buildMatchIndexes([canceledJanTerm, canceledFebTerm]);
        const row = makeMatchInput({
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-12-31',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.crmPolicyId).toBe('policy-feb');
        expect(result.notes).toContain('most recent effective date');
      });

      it('falls back to weighted multi-match when effective dates tie', () => {
        const indexes = buildMatchIndexes([
          { ...canceledJanTerm, effectiveDate: '2026-01-01' },
          { ...canceledFebTerm, id: 'policy-twin', effectiveDate: '2026-01-01' },
        ]);
        const row = makeMatchInput({
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-12-31',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('POLICY_NUMBER_MULTI_BEST');
      });

      it('does not preempt active-status narrowing when one candidate is live', () => {
        const indexes = buildMatchIndexes([
          // The OLDER policy is the active one — recency must not override
          // the stronger active-status signal.
          { ...canceledJanTerm, status: 'ACTIVE_PLACED', expirationDate: null },
          canceledFebTerm,
        ]);
        const row = makeMatchInput({
          effectiveDate: '2026-01-01',
          paidThroughDate: '2026-12-31',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.crmPolicyId).toBe('policy-jan');
        expect(result.notes).toContain('active status');
      });
    });
  });

  describe('selectByActiveStatus', () => {
    const cancelled = (overrides: Partial<CrmPolicy> = {}): CrmPolicy =>
      makePolicy({ id: 'p-canceled', status: 'CANCELED', ...overrides });
    const active = (overrides: Partial<CrmPolicy> = {}): CrmPolicy =>
      makePolicy({ id: 'p-active', status: 'ACTIVE_PLACED', ...overrides });

    it('returns null when fewer than 2 candidates', () => {
      expect(selectByActiveStatus([active()])).toBeNull();
      expect(selectByActiveStatus([])).toBeNull();
    });

    it('returns the unique non-terminal candidate', () => {
      const winner = selectByActiveStatus([cancelled(), active()]);

      expect(winner?.id).toBe('p-active');
    });

    it.each([
      'CANCELED',
      'PAYMENT_ERROR_CANCELED',
      'DECLINED',
      'INCOMPLETE',
    ])('treats %s as terminal', (status) => {
      const winner = selectByActiveStatus([
        cancelled({ status }),
        active(),
      ]);

      expect(winner?.id).toBe('p-active');
    });

    it('returns null when all candidates are terminal', () => {
      expect(
        selectByActiveStatus([
          cancelled({ id: 'a', status: 'CANCELED' }),
          cancelled({ id: 'b', status: 'DECLINED' }),
        ]),
      ).toBeNull();
    });

    it('returns null when more than one candidate is non-terminal', () => {
      expect(
        selectByActiveStatus([
          active({ id: 'a' }),
          active({ id: 'b' }),
        ]),
      ).toBeNull();
    });

    it('treats missing status as non-terminal (legacy data)', () => {
      const winner = selectByActiveStatus([
        cancelled(),
        active({ status: null }),
      ]);

      expect(winner?.id).toBe('p-active');
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

  describe('selectByMostRecentEffectiveDate', () => {
    const older = (): CrmPolicy =>
      makePolicy({ id: 'p-older', effectiveDate: '2026-01-01' });
    const newer = (): CrmPolicy =>
      makePolicy({ id: 'p-newer', effectiveDate: '2026-02-01' });

    it('returns null when fewer than 2 candidates (no need to narrow)', () => {
      expect(selectByMostRecentEffectiveDate([newer()])).toBeNull();
      expect(selectByMostRecentEffectiveDate([])).toBeNull();
    });

    it('picks the candidate with the latest effective date', () => {
      const winner = selectByMostRecentEffectiveDate([older(), newer()]);

      expect(winner?.id).toBe('p-newer');
    });

    it('returns null when the latest effective date is tied', () => {
      expect(
        selectByMostRecentEffectiveDate([
          older(),
          { ...newer(), effectiveDate: '2026-01-01' },
        ]),
      ).toBeNull();
    });

    it('returns null when any candidate has a missing or malformed effective date', () => {
      expect(
        selectByMostRecentEffectiveDate([
          older(),
          { ...newer(), effectiveDate: null },
        ]),
      ).toBeNull();
      expect(
        selectByMostRecentEffectiveDate([
          older(),
          { ...newer(), effectiveDate: 'not a date' },
        ]),
      ).toBeNull();
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
