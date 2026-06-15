import {
  matchRow,
  buildIdentifierCanonicalizer,
  buildMatchIndexes,
  buildMatchInputFromMapping,
  agentNameMatches,
  memberNameScore,
  datesWithinDays,
  isValidAmbetterPolicyNumber,
  normalizeDateOnly,
  normalizePolicyNumber,
  resolveCarrierIdentifier,
  selectByActiveStatus,
  selectByActiveTerm,
  selectByMostRecentEffectiveDate,
  DEFAULT_MATCHING_CONFIG,
  DEFAULT_TIER_TUNING,
  MATCH_TIER_IDS,
  type CrmPolicy,
  type MatchInput,
  type MatchingConfig,
  type Override,
} from 'src/modules/reconciliation/engines/matching';
import { NEGATIVE_TERMINAL_STATUSES } from 'src/modules/reconciliation/types/policy-statuses';
import type { ColumnMapping } from 'src/modules/reconciliation/types/reconciliation';

const makePolicy = (overrides: Partial<CrmPolicy> = {}): CrmPolicy => ({
  id: 'policy-1',
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
  memberId: null,
  subscriberId: null,
  groupNumber: null,
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

    // 3.5: suffix-only names normalize to '' and the substring fallback
    // ('anything'.includes('')) matched every broker.
    it('rejects names that normalize to empty (suffix/punctuation only)', () => {
      expect(agentNameMatches('LLC', 'Omnia Insurance')).toBe(false);
      expect(agentNameMatches('Omnia Insurance', 'Inc.')).toBe(false);
      expect(agentNameMatches('Co.', 'Co.')).toBe(false);
    });

    it('rejects names shorter than 3 chars after normalization', () => {
      expect(agentNameMatches('AB', 'AB Insurance Brokers')).toBe(false);
      expect(agentNameMatches('AB Insurance Brokers', 'AB LLC')).toBe(false);
    });
  });

  describe('normalizePolicyNumber', () => {
    it('trims and uppercases', () => {
      expect(normalizePolicyNumber(' u94692964 ')).toBe('U94692964');
      expect(normalizePolicyNumber('U94692964')).toBe('U94692964');
    });

    it('returns null for null/empty/whitespace', () => {
      expect(normalizePolicyNumber(null)).toBeNull();
      expect(normalizePolicyNumber('')).toBeNull();
      expect(normalizePolicyNumber('   ')).toBeNull();
    });
  });

  describe('normalizeDateOnly', () => {
    it('passes through plain YYYY-MM-DD dates', () => {
      expect(normalizeDateOnly('1990-05-15')).toBe('1990-05-15');
    });

    it('strips the time component from ISO timestamps without TZ math', () => {
      expect(normalizeDateOnly('1990-05-15T00:00:00.000Z')).toBe('1990-05-15');
      expect(normalizeDateOnly('1990-05-15 00:00:00')).toBe('1990-05-15');
    });

    it('formats Date instances as UTC date-only', () => {
      expect(normalizeDateOnly(new Date(Date.UTC(1990, 4, 15)))).toBe(
        '1990-05-15',
      );
    });

    it('returns null for null/empty/garbage', () => {
      expect(normalizeDateOnly(null)).toBeNull();
      expect(normalizeDateOnly(undefined)).toBeNull();
      expect(normalizeDateOnly('')).toBeNull();
      expect(normalizeDateOnly('not a date')).toBeNull();
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
        // 3.4: recency narrowing is an ops heuristic, not an identifier
        // match — it must carry its own method and stay out of auto-match
        // (it previously inherited POLICY_NUMBER_* methods at 85-98).
        expect(result.method).toBe('POLICY_NUMBER_NARROWED_RECENT');
        expect(result.status).toBe('NEEDS_REVIEW');
        expect(result.confidence).toBeLessThan(
          DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
        );
      });

      it('falls back to weighted multi-match when effective dates tie', () => {
        const indexes = buildMatchIndexes([
          { ...canceledJanTerm, effectiveDate: '2026-01-01' },
          {
            ...canceledFebTerm,
            id: 'policy-twin',
            effectiveDate: '2026-01-01',
          },
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

      // 3.4 regression: when neither narrowing strategy applies (both
      // candidates live, no paid-through/date/agent evidence), the engine
      // must refuse to guess — recency previously narrowed to the newer
      // record and Tier 5 auto-matched it at 90.
      it('two non-terminal same-number policies with no narrowing inputs land in NEEDS_REVIEW, not auto-match', () => {
        const indexes = buildMatchIndexes([
          makePolicy({
            id: 'policy-old',
            effectiveDate: '2026-01-01',
            status: 'ACTIVE_PLACED',
          }),
          makePolicy({
            id: 'policy-new',
            effectiveDate: '2026-02-01',
            status: 'ACTIVE_PLACED',
          }),
        ]);
        const row = makeMatchInput({
          effectiveDate: null,
          paidThroughDate: null,
          agentName: null,
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('POLICY_NUMBER_MULTI_BEST');
        expect(result.status).toBe('NEEDS_REVIEW');
        expect(result.confidence).toBeLessThan(
          DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
        );
      });
    });

    // 3.3: CRM policy numbers are hand-entered; case/whitespace variants
    // previously missed the policyByNumber Map and fell to NPN/name tiers
    // or UNMATCHED (inviting duplicate CRM records).
    describe('policy number normalization', () => {
      it('matches a lower-cased, padded CRM policy number against the BOB row', () => {
        const indexes = buildMatchIndexes([
          makePolicy({ policyNumber: ' u94692964 ' }),
        ]);
        const row = makeMatchInput({ policyNumber: 'U94692964' });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
        expect(result.crmPolicyId).toBe('policy-1');
      });

      it('matches a lower-cased BOB policy number against the CRM record', () => {
        const indexes = buildMatchIndexes([makePolicy()]);
        const row = makeMatchInput({ policyNumber: 'u94692964' });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
        expect(result.crmPolicyId).toBe('policy-1');
      });

      it('compares override carrier policy numbers normalized', () => {
        const indexes = buildMatchIndexes([makePolicy()]);
        const row = makeMatchInput({ policyNumber: 'U94692964' });
        const overrides = [
          {
            carrierPolicyNumber: ' u94692964',
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
        expect(result.crmPolicyId).toBe('policy-1');
      });
    });

    // 3.6: Tier 6's DOB bonus must compare normalized dates — an ISO
    // timestamp on the CRM side previously never earned the +10.
    it('Tier 6: DOB bonus fires for ISO-timestamp CRM DOBs (normalized comparison)', () => {
      const indexes = buildMatchIndexes([
        makePolicy({
          id: 'policy-wrong-dob',
          effectiveDate: '2025-06-01',
          'lead.dateOfBirth': '1985-01-01',
        }),
        makePolicy({
          id: 'policy-iso-dob',
          effectiveDate: '2025-06-01',
          'lead.dateOfBirth': '1990-05-15T00:00:00.000Z',
        }),
      ]);
      // No date proximity (BOB date far from both), no agent signal, equal
      // names — only the DOB bonus separates the candidates.
      const row = makeMatchInput({
        effectiveDate: '2026-01-01',
        agentName: null,
        memberDob: '1990-05-15',
      });

      const result = matchRow(
        row,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.method).toBe('POLICY_NUMBER_MULTI_BEST');
      expect(result.crmPolicyId).toBe('policy-iso-dob');
    });

    // 3.1: Tier 7 previously returned the FIRST candidate above the name
    // threshold in index order — the NPN keys an entire agency book, so
    // near-name neighbors could shadow the actual member.
    describe('Tier 7 (NPN + date + name) best-candidate selection', () => {
      // policyNumber null so the policy-number tiers are skipped entirely.
      const tier7Input = (overrides: Partial<MatchInput> = {}): MatchInput =>
        makeMatchInput({ policyNumber: null, ...overrides });

      it('picks the exact-name candidate even when a fuzzy near-name candidate comes first', () => {
        const indexes = buildMatchIndexes([
          makePolicy({
            id: 'policy-fuzzy',
            policyNumber: 'U1',
            'lead.name.firstName': 'Josue',
            'lead.name.lastName': 'Garcia',
            'lead.dateOfBirth': '1980-01-01',
          }),
          makePolicy({
            id: 'policy-exact',
            policyNumber: 'U2',
            'lead.name.firstName': 'Jose',
            'lead.name.lastName': 'Garcia',
            'lead.dateOfBirth': '1985-02-02',
          }),
        ]);
        const row = tier7Input({
          memberFirstName: 'Jose',
          memberLastName: 'Garcia',
          memberDob: null,
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('NPN_DATE_NAME');
        expect(result.crmPolicyId).toBe('policy-exact');
        expect(result.status).toBe('AUTO_MATCHED');
      });

      it('demotes to NEEDS_REVIEW when the top two candidates tie with no DOB tie-breaker', () => {
        const indexes = buildMatchIndexes([
          // Reverse id order on purpose: the deterministic tie-break must
          // pick the lowest id regardless of index order.
          makePolicy({
            id: 'policy-b',
            policyNumber: 'U2',
            'lead.name.firstName': 'Maria',
            'lead.name.lastName': 'Rodriguez',
            'lead.dateOfBirth': '1980-01-01',
          }),
          makePolicy({
            id: 'policy-a',
            policyNumber: 'U1',
            'lead.name.firstName': 'Maria',
            'lead.name.lastName': 'Rodriguez',
            'lead.dateOfBirth': '1975-06-06',
          }),
        ]);
        const row = tier7Input({
          memberFirstName: 'Maria',
          memberLastName: 'Rodriguez',
          memberDob: '1999-09-09', // matches neither candidate
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('NPN_DATE_NAME');
        expect(result.status).toBe('NEEDS_REVIEW');
        expect(result.confidence).toBeLessThan(
          DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
        );
        expect(result.crmPolicyId).toBe('policy-a');
        expect(result.notes).toContain('tied');
      });

      it('uses exact DOB to break a name-score tie', () => {
        const indexes = buildMatchIndexes([
          makePolicy({
            id: 'policy-a',
            policyNumber: 'U1',
            'lead.name.firstName': 'Maria',
            'lead.name.lastName': 'Rodriguez',
            'lead.dateOfBirth': '1975-06-06',
          }),
          makePolicy({
            id: 'policy-b',
            policyNumber: 'U2',
            'lead.name.firstName': 'Maria',
            'lead.name.lastName': 'Rodriguez',
            'lead.dateOfBirth': '1980-01-01',
          }),
        ]);
        const row = tier7Input({
          memberFirstName: 'Maria',
          memberLastName: 'Rodriguez',
          memberDob: '1980-01-01', // singles out policy-b
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('NPN_DATE_NAME');
        expect(result.crmPolicyId).toBe('policy-b');
        expect(result.status).toBe('AUTO_MATCHED');
        expect(result.notes).toContain('DOB corroborated');
      });

      it('stays NEEDS_REVIEW when candidates tie and BOTH match the input DOB (likely duplicate leads)', () => {
        const indexes = buildMatchIndexes([
          makePolicy({
            id: 'policy-a',
            policyNumber: 'U1',
            'lead.name.firstName': 'Maria',
            'lead.name.lastName': 'Rodriguez',
            'lead.dateOfBirth': '1980-01-01',
          }),
          makePolicy({
            id: 'policy-b',
            policyNumber: 'U2',
            'lead.name.firstName': 'Maria',
            'lead.name.lastName': 'Rodriguez',
            'lead.dateOfBirth': '1980-01-01',
          }),
        ]);
        const row = tier7Input({
          memberFirstName: 'Maria',
          memberLastName: 'Rodriguez',
          memberDob: '1980-01-01',
        });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.status).toBe('NEEDS_REVIEW');
        expect(result.crmPolicyId).toBe('policy-a');
      });

      it('boosts a low-band name score into auto-match when DOB corroborates', () => {
        // 'Mario Lopes' vs 'Maria Lopez' scores ~0.92: above the 0.85 floor
        // but below the 0.93 medium band → confidence 65 (NEEDS_REVIEW)
        // on name alone.
        const indexes = buildMatchIndexes([
          makePolicy({
            id: 'policy-1',
            policyNumber: 'U1',
            'lead.name.firstName': 'Maria',
            'lead.name.lastName': 'Lopez',
            'lead.dateOfBirth': '1990-05-15',
          }),
        ]);
        const withDob = matchRow(
          tier7Input({
            memberFirstName: 'Mario',
            memberLastName: 'Lopes',
            memberDob: '1990-05-15',
          }),
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );
        const withoutDob = matchRow(
          tier7Input({
            memberFirstName: 'Mario',
            memberLastName: 'Lopes',
            memberDob: null,
          }),
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(withoutDob.method).toBe('NPN_DATE_NAME');
        expect(withoutDob.confidence).toBe(
          DEFAULT_MATCHING_CONFIG.tier7ConfidenceScores.low,
        );
        expect(withoutDob.status).toBe('NEEDS_REVIEW');

        expect(withDob.method).toBe('NPN_DATE_NAME');
        expect(withDob.confidence).toBe(
          DEFAULT_MATCHING_CONFIG.tier7ConfidenceScores.medium,
        );
        expect(withDob.status).toBe('AUTO_MATCHED');
        expect(withDob.notes).toContain('DOB corroborated');
      });
    });

    // 3.1: Tier 8 had the same first-match-wins pattern; 3.6: the DOB index
    // and re-check must normalize ISO timestamps to plain dates.
    describe('Tier 8 (name + DOB + date) best-candidate selection', () => {
      // policyNumber and agentNpn null so Tiers 1-7 are skipped.
      const tier8Input = (overrides: Partial<MatchInput> = {}): MatchInput =>
        makeMatchInput({ policyNumber: null, agentNpn: null, ...overrides });

      it('picks the best-name candidate among several sharing a DOB, not the first', () => {
        const indexes = buildMatchIndexes([
          makePolicy({
            id: 'policy-fuzzy',
            policyNumber: 'U1',
            'lead.name.firstName': 'Jon',
          }),
          makePolicy({ id: 'policy-exact', policyNumber: 'U2' }),
        ]);
        const row = tier8Input();

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('NAME_DOB_DATE');
        expect(result.crmPolicyId).toBe('policy-exact');
        expect(result.confidence).toBe(60);
        expect(result.status).toBe('NEEDS_REVIEW');
      });

      it('breaks exact ties by lowest policy id regardless of index order', () => {
        const indexes = buildMatchIndexes([
          makePolicy({ id: 'policy-b', policyNumber: 'U2' }),
          makePolicy({ id: 'policy-a', policyNumber: 'U1' }),
        ]);
        const row = tier8Input();

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('NAME_DOB_DATE');
        expect(result.crmPolicyId).toBe('policy-a');
      });

      it('matches when the CRM DOB is an ISO timestamp (3.6)', () => {
        const indexes = buildMatchIndexes([
          makePolicy({
            policyNumber: 'U1',
            'lead.dateOfBirth': '1990-05-15T00:00:00.000Z',
          }),
        ]);
        const row = tier8Input({ memberDob: '1990-05-15' });

        const result = matchRow(
          row,
          indexes,
          [],
          'Ambetter',
          DEFAULT_MATCHING_CONFIG,
        );

        expect(result.method).toBe('NAME_DOB_DATE');
        expect(result.crmPolicyId).toBe('policy-1');
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

    it.each(['CANCELED', 'PAYMENT_ERROR_CANCELED', 'DECLINED', 'INCOMPLETE'])(
      'treats %s as terminal',
      (status) => {
        const winner = selectByActiveStatus([cancelled({ status }), active()]);

        expect(winner?.id).toBe('p-active');
      },
    );

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
        selectByActiveStatus([active({ id: 'a' }), active({ id: 'b' })]),
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
    // Fixtures are terminal-status: since item 3.4 the recency heuristic is
    // restricted to all-terminal candidate sets (the both-canceled case that
    // motivated it). Earlier versions of these tests used the default
    // ACTIVE_PLACED status, encoding the buggy behavior where recency could
    // preempt date/agent evidence between live policies.
    const older = (): CrmPolicy =>
      makePolicy({
        id: 'p-older',
        effectiveDate: '2026-01-01',
        status: 'CANCELED',
      });
    const newer = (): CrmPolicy =>
      makePolicy({
        id: 'p-newer',
        effectiveDate: '2026-02-01',
        status: 'PAYMENT_ERROR_CANCELED',
      });

    it('returns null when fewer than 2 candidates (no need to narrow)', () => {
      expect(selectByMostRecentEffectiveDate([newer()])).toBeNull();
      expect(selectByMostRecentEffectiveDate([])).toBeNull();
    });

    it('picks the candidate with the latest effective date', () => {
      const winner = selectByMostRecentEffectiveDate([older(), newer()]);

      expect(winner?.id).toBe('p-newer');
    });

    it('returns null when any candidate is non-terminal (heuristic restricted to all-terminal sets)', () => {
      expect(
        selectByMostRecentEffectiveDate([
          older(),
          { ...newer(), status: 'ACTIVE_PLACED' },
        ]),
      ).toBeNull();
      // Missing status counts as non-terminal (legacy data).
      expect(
        selectByMostRecentEffectiveDate([
          older(),
          { ...newer(), status: null },
        ]),
      ).toBeNull();
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

  describe('tierTuning (OMN-12 — tier internals as knobs)', () => {
    it("DEFAULT_TIER_TUNING pins today's constants exactly", () => {
      // These ARE the literals matchRow used before OMN-12 — changing any
      // of them changes Ambetter behavior and is a breaking change.
      expect(DEFAULT_TIER_TUNING).toEqual({
        tierConfidences: {
          POLICY_NUMBER_DATE_AGENT: 98,
          POLICY_NUMBER_DATE: 95,
          POLICY_NUMBER_AGENT: 85,
          POLICY_NUMBER_SINGLE: 90,
          // IDENTIFIER_EXACT is NEW in OMN-12 (no pre-knob literal to pin);
          // it is only read when identifierRoles is configured.
          IDENTIFIER_EXACT: 90,
          NAME_DOB_DATE: 60,
        },
        tier6Weights: {
          dateProximity: 40,
          agentMatch: 30,
          memberName: 20,
          dobExact: 10,
          confidenceCap: 70,
        },
        dateProximityBands: [
          { maxDays: 0, score: 1 },
          { maxDays: 7, score: 0.9 },
          { maxDays: 30, score: 0.7 },
          { maxDays: 60, score: 0.4 },
        ],
        dateProximityFloor: 0.1,
      });
    });

    it('MATCH_TIER_IDS is the canonical 9-tier vocabulary and the default tier list', () => {
      expect(MATCH_TIER_IDS).toEqual([
        'OVERRIDE',
        'POLICY_NUMBER_DATE_AGENT',
        'POLICY_NUMBER_DATE',
        'POLICY_NUMBER_AGENT',
        'POLICY_NUMBER_SINGLE',
        'POLICY_NUMBER_MULTI_BEST',
        'IDENTIFIER_EXACT',
        'NPN_DATE_NAME',
        'NAME_DOB_DATE',
      ]);
      expect(DEFAULT_MATCHING_CONFIG.enabledTiers).toEqual([
        ...MATCH_TIER_IDS,
      ]);
      expect(DEFAULT_MATCHING_CONFIG.tierTuning).toEqual({});
      // OMN-12 identity/strategy knobs default to today's behavior.
      expect(DEFAULT_MATCHING_CONFIG.identifierRoles).toEqual({});
      expect(DEFAULT_MATCHING_CONFIG.identifierNormalization).toEqual({});
      expect(DEFAULT_MATCHING_CONFIG.dedupStrategy).toBe(
        'keepNewestEffectiveDate',
      );
      expect(DEFAULT_MATCHING_CONFIG.narrowingStrategies).toEqual([
        'activeStatus',
        'activeTerm',
        'mostRecentEffectiveDate',
      ]);
    });

    describe('parity: tierTuning unset ≡ tierTuning set to the defaults (full corpus)', () => {
      type Scenario = {
        name: string;
        policies: CrmPolicy[];
        input: MatchInput;
        overrides?: Override[];
      };

      // One scenario per decision path matchRow can take — every tier,
      // both tier-6 band regions, and both narrowing pre-passes.
      const corpus: Scenario[] = [
        {
          name: 'tier1-override',
          policies: [makePolicy()],
          input: makeMatchInput(),
          overrides: [
            {
              carrierPolicyNumber: 'U94692964',
              carrierName: 'Ambetter',
              crmPolicyId: 'policy-1',
              isActive: true,
            },
          ],
        },
        {
          name: 'tier2-date-agent',
          policies: [makePolicy()],
          input: makeMatchInput(),
        },
        {
          name: 'tier3-date',
          policies: [makePolicy({ 'agent.name': 'Different Agency' })],
          input: makeMatchInput(),
        },
        {
          name: 'tier4-agent',
          policies: [makePolicy({ effectiveDate: '2025-01-01' })],
          input: makeMatchInput(),
        },
        {
          name: 'tier5-single',
          policies: [
            makePolicy({
              'agent.name': 'Different Agency',
              effectiveDate: '2025-01-01',
            }),
          ],
          input: makeMatchInput(),
        },
        {
          name: 'tier6-multi-dob-decides',
          policies: [
            makePolicy({
              id: 'policy-wrong-dob',
              effectiveDate: '2025-06-01',
              'lead.dateOfBirth': '1985-01-01',
            }),
            makePolicy({
              id: 'policy-right-dob',
              effectiveDate: '2025-06-01',
            }),
          ],
          input: makeMatchInput({ effectiveDate: '2026-01-01', agentName: null }),
        },
        {
          name: 'tier6-no-signals',
          policies: [
            makePolicy({ id: 'policy-old', effectiveDate: '2026-01-01' }),
            makePolicy({ id: 'policy-new', effectiveDate: '2026-02-01' }),
          ],
          input: makeMatchInput({
            effectiveDate: null,
            paidThroughDate: null,
            agentName: null,
          }),
        },
        {
          name: 'tier7-npn-name',
          policies: [
            makePolicy({
              id: 'policy-fuzzy',
              policyNumber: 'U1',
              'lead.name.firstName': 'Josue',
            }),
            makePolicy({ id: 'policy-exact', policyNumber: 'U2' }),
          ],
          input: makeMatchInput({ policyNumber: null, memberDob: null }),
        },
        {
          name: 'tier8-name-dob-date',
          policies: [makePolicy({ policyNumber: 'U1' })],
          input: makeMatchInput({ policyNumber: null, agentNpn: null }),
        },
        {
          name: 'tier9-unmatched',
          policies: [
            makePolicy({
              policyNumber: 'U99999999',
              'agent.npn': '00000000',
              'lead.dateOfBirth': '1970-01-01',
              'lead.name.firstName': 'Alice',
              'lead.name.lastName': 'Wonderland',
            }),
          ],
          input: makeMatchInput(),
        },
        {
          name: 'narrow-active-status',
          policies: [
            makePolicy({
              id: 'policy-2025',
              effectiveDate: '2025-10-01',
              expirationDate: '2025-12-31',
              status: 'CANCELED',
            }),
            makePolicy({
              id: 'policy-2026',
              effectiveDate: '2026-01-01',
              expirationDate: null,
              status: 'ACTIVE_PLACED',
            }),
          ],
          input: makeMatchInput({
            effectiveDate: '2025-10-01',
            paidThroughDate: '2026-04-30',
          }),
        },
        {
          name: 'narrow-recency',
          policies: [
            makePolicy({
              id: 'policy-jan',
              effectiveDate: '2026-01-01',
              expirationDate: '2026-01-01',
              status: 'CANCELED',
            }),
            makePolicy({
              id: 'policy-feb',
              effectiveDate: '2026-02-01',
              expirationDate: '2026-03-10',
              status: 'CANCELED',
            }),
          ],
          input: makeMatchInput({
            effectiveDate: '2026-01-01',
            paidThroughDate: '2026-12-31',
          }),
        },
      ];

      it('produces byte-identical decisions across the corpus', () => {
        const explicitDefaults: MatchingConfig = {
          ...DEFAULT_MATCHING_CONFIG,
          tierTuning: {
            tierConfidences: { ...DEFAULT_TIER_TUNING.tierConfidences },
            tier6Weights: { ...DEFAULT_TIER_TUNING.tier6Weights },
            dateProximityBands: DEFAULT_TIER_TUNING.dateProximityBands.map(
              (band) => ({ ...band }),
            ),
            dateProximityFloor: DEFAULT_TIER_TUNING.dateProximityFloor,
          },
        };

        for (const scenario of corpus) {
          const indexes = buildMatchIndexes(scenario.policies);
          const unset = matchRow(
            scenario.input,
            indexes,
            scenario.overrides ?? [],
            'Ambetter',
            DEFAULT_MATCHING_CONFIG,
          );
          const explicit = matchRow(
            scenario.input,
            indexes,
            scenario.overrides ?? [],
            'Ambetter',
            explicitDefaults,
          );

          // Byte-identical: same JSON, key order included.
          expect(`${scenario.name}: ${JSON.stringify(explicit)}`).toBe(
            `${scenario.name}: ${JSON.stringify(unset)}`,
          );
        }
      });

      it('tierTuning unset reproduces the historical constants across the corpus', () => {
        const decisions = corpus.map((scenario) => {
          const decision = matchRow(
            scenario.input,
            buildMatchIndexes(scenario.policies),
            scenario.overrides ?? [],
            'Ambetter',
            DEFAULT_MATCHING_CONFIG,
          );

          return `${scenario.name}: ${decision.method}@${decision.confidence}→${decision.status}`;
        });

        expect(decisions).toEqual([
          'tier1-override: OVERRIDE@100→AUTO_MATCHED',
          'tier2-date-agent: POLICY_NUMBER_DATE_AGENT@98→AUTO_MATCHED',
          'tier3-date: POLICY_NUMBER_PLUS_EFFECTIVE_DATE@95→AUTO_MATCHED',
          'tier4-agent: POLICY_NUMBER_PLUS_AGENT@85→AUTO_MATCHED',
          'tier5-single: POLICY_NUMBER_SINGLE@90→AUTO_MATCHED',
          // 0.1 (>60d) * 40 + name 20 + DOB 10 = 34
          'tier6-multi-dob-decides: POLICY_NUMBER_MULTI_BEST@34→NEEDS_REVIEW',
          // name 20 + DOB 10 = 30
          'tier6-no-signals: POLICY_NUMBER_MULTI_BEST@30→NEEDS_REVIEW',
          // exact name ≥ 0.98 high band
          'tier7-npn-name: NPN_DATE_NAME@92→AUTO_MATCHED',
          'tier8-name-dob-date: NAME_DOB_DATE@60→NEEDS_REVIEW',
          'tier9-unmatched: UNMATCHED@0→UNMATCHED',
          'narrow-active-status: POLICY_NUMBER_PLUS_AGENT@85→AUTO_MATCHED',
          `narrow-recency: POLICY_NUMBER_NARROWED_RECENT@${DEFAULT_MATCHING_CONFIG.autoMatchThreshold - 1}→NEEDS_REVIEW`,
        ]);
      });
    });

    describe('each knob moves behavior', () => {
      const withTuning = (
        tierTuning: NonNullable<MatchingConfig['tierTuning']>,
      ): MatchingConfig => ({ ...DEFAULT_MATCHING_CONFIG, tierTuning });

      it('tierConfidences.POLICY_NUMBER_DATE_AGENT rescores Tier 2', () => {
        const indexes = buildMatchIndexes([makePolicy()]);
        const result = matchRow(
          makeMatchInput(),
          indexes,
          [],
          'Ambetter',
          withTuning({ tierConfidences: { POLICY_NUMBER_DATE_AGENT: 70 } }),
        );

        expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
        expect(result.confidence).toBe(70);
        expect(result.status).toBe('NEEDS_REVIEW');
      });

      it('tierConfidences.POLICY_NUMBER_DATE rescores Tier 3', () => {
        const indexes = buildMatchIndexes([
          makePolicy({ 'agent.name': 'Different Agency' }),
        ]);
        const result = matchRow(
          makeMatchInput(),
          indexes,
          [],
          'Ambetter',
          withTuning({ tierConfidences: { POLICY_NUMBER_DATE: 50 } }),
        );

        expect(result.method).toBe('POLICY_NUMBER_PLUS_EFFECTIVE_DATE');
        expect(result.confidence).toBe(50);
        expect(result.status).toBe('NEEDS_REVIEW');
      });

      it('tierConfidences.POLICY_NUMBER_AGENT rescores Tier 4', () => {
        const indexes = buildMatchIndexes([
          makePolicy({ effectiveDate: '2025-01-01' }),
        ]);
        const result = matchRow(
          makeMatchInput(),
          indexes,
          [],
          'Ambetter',
          withTuning({ tierConfidences: { POLICY_NUMBER_AGENT: 40 } }),
        );

        expect(result.method).toBe('POLICY_NUMBER_PLUS_AGENT');
        expect(result.confidence).toBe(40);
        expect(result.status).toBe('NEEDS_REVIEW');
      });

      it('tierConfidences.POLICY_NUMBER_SINGLE demotes identifier-only matches (the shared-member-ID case)', () => {
        const indexes = buildMatchIndexes([
          makePolicy({
            'agent.name': 'Different Agency',
            effectiveDate: '2025-01-01',
          }),
        ]);
        const result = matchRow(
          makeMatchInput(),
          indexes,
          [],
          'Ambetter',
          withTuning({ tierConfidences: { POLICY_NUMBER_SINGLE: 50 } }),
        );

        expect(result.method).toBe('POLICY_NUMBER_SINGLE');
        expect(result.confidence).toBe(50);
        expect(result.status).toBe('NEEDS_REVIEW');
      });

      it('tierConfidences.NAME_DOB_DATE promotes Tier 8 into auto-match', () => {
        const indexes = buildMatchIndexes([makePolicy({ policyNumber: 'U1' })]);
        const result = matchRow(
          makeMatchInput({ policyNumber: null, agentNpn: null }),
          indexes,
          [],
          'Ambetter',
          withTuning({ tierConfidences: { NAME_DOB_DATE: 90 } }),
        );

        expect(result.method).toBe('NAME_DOB_DATE');
        expect(result.confidence).toBe(90);
        expect(result.status).toBe('AUTO_MATCHED');
      });

      it('a partial tierConfidences leaves the other tiers at the constants', () => {
        const indexes = buildMatchIndexes([makePolicy()]);
        const result = matchRow(
          makeMatchInput(),
          indexes,
          [],
          'Ambetter',
          withTuning({ tierConfidences: { NAME_DOB_DATE: 90 } }),
        );

        expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
        expect(result.confidence).toBe(98);
      });

      // --- Tier 6 weight/band knobs. The dummy candidate keeps the tier in
      // multi-match mode while staying far behind on every score variant. ---
      const dummyCandidate = makePolicy({
        id: 'dummy-far',
        effectiveDate: '2024-01-01',
        'agent.name': 'Zeta Brokers',
        'lead.name.firstName': 'Zed',
        'lead.name.lastName': 'Quux',
        'lead.dateOfBirth': '1970-01-01',
      });

      it('tier6Weights.agentMatch=0 removes the +30 agent bonus (winner flips)', () => {
        const policies = [
          makePolicy({ id: 'with-agent', effectiveDate: '2025-12-15' }),
          makePolicy({
            id: 'no-agent',
            effectiveDate: '2026-01-08',
            'agent.name': 'Zeta Brokers',
          }),
        ];
        const indexes = buildMatchIndexes(policies);
        const input = makeMatchInput(); // eff 2026-01-01, agent matches 'with-agent'
        const tier6Only: MatchingConfig = {
          ...DEFAULT_MATCHING_CONFIG,
          enabledTiers: ['POLICY_NUMBER_MULTI_BEST'],
        };

        // Default weights: with-agent = 0.7*40 + 30 + 20 + 10 = 88 (cap 70);
        // no-agent = 0.9*40 + 20 + 10 = 66.
        const withBonus = matchRow(input, indexes, [], 'Ambetter', tier6Only);

        expect(withBonus.crmPolicyId).toBe('with-agent');
        expect(withBonus.confidence).toBe(70); // capped

        // Zeroed bonus: with-agent = 58, no-agent = 66 — winner flips.
        const withoutBonus = matchRow(input, indexes, [], 'Ambetter', {
          ...tier6Only,
          tierTuning: { tier6Weights: { agentMatch: 0 } },
        });

        expect(withoutBonus.crmPolicyId).toBe('no-agent');
        expect(withoutBonus.confidence).toBe(66);
      });

      it('tier6Weights.confidenceCap lifts the 70 ceiling', () => {
        const policies = [makePolicy({ id: 'perfect' }), dummyCandidate];
        const indexes = buildMatchIndexes(policies);
        const input = makeMatchInput(); // exact date + agent + name + DOB = 100
        const tier6Only: MatchingConfig = {
          ...DEFAULT_MATCHING_CONFIG,
          enabledTiers: ['POLICY_NUMBER_MULTI_BEST'],
        };

        const capped = matchRow(input, indexes, [], 'Ambetter', tier6Only);

        expect(capped.confidence).toBe(70);
        expect(capped.status).toBe('NEEDS_REVIEW');

        const uncapped = matchRow(input, indexes, [], 'Ambetter', {
          ...tier6Only,
          tierTuning: { tier6Weights: { confidenceCap: 100 } },
        });

        expect(uncapped.crmPolicyId).toBe('perfect');
        expect(uncapped.confidence).toBe(100);
        expect(uncapped.status).toBe('AUTO_MATCHED');
      });

      it('tier6Weights.dateProximity rescales the date signal', () => {
        const policies = [
          makePolicy({ id: 'near-date', effectiveDate: '2026-01-08' }),
          dummyCandidate,
        ];
        const indexes = buildMatchIndexes(policies);
        const input = makeMatchInput({ agentName: null });
        const tier6Only: MatchingConfig = {
          ...DEFAULT_MATCHING_CONFIG,
          enabledTiers: ['POLICY_NUMBER_MULTI_BEST'],
        };

        // Default: 0.9*40 + 20 + 10 = 66.
        expect(
          matchRow(input, indexes, [], 'Ambetter', tier6Only).confidence,
        ).toBe(66);
        // Weight 10: 0.9*10 + 20 + 10 = 39.
        expect(
          matchRow(input, indexes, [], 'Ambetter', {
            ...tier6Only,
            tierTuning: { tier6Weights: { dateProximity: 10 } },
          }).confidence,
        ).toBe(39);
      });

      it('tier6Weights.memberName and dobExact are independently tunable', () => {
        const policies = [
          makePolicy({ id: 'near-date', effectiveDate: '2026-01-08' }),
          dummyCandidate,
        ];
        const indexes = buildMatchIndexes(policies);
        const input = makeMatchInput({ agentName: null });
        const tier6Only: MatchingConfig = {
          ...DEFAULT_MATCHING_CONFIG,
          enabledTiers: ['POLICY_NUMBER_MULTI_BEST'],
        };

        // Default 66; zeroing the name weight drops exactly its 20…
        expect(
          matchRow(input, indexes, [], 'Ambetter', {
            ...tier6Only,
            tierTuning: { tier6Weights: { memberName: 0 } },
          }).confidence,
        ).toBe(46);
        // …and zeroing the DOB bonus drops exactly its 10.
        expect(
          matchRow(input, indexes, [], 'Ambetter', {
            ...tier6Only,
            tierTuning: { tier6Weights: { dobExact: 0 } },
          }).confidence,
        ).toBe(56);
      });

      it('dateProximityBands replaces the band table (tighter carriers score 7-day gaps at the floor)', () => {
        const policies = [
          makePolicy({ id: 'near-date', effectiveDate: '2026-01-08' }),
          dummyCandidate,
        ];
        const indexes = buildMatchIndexes(policies);
        const input = makeMatchInput({ agentName: null });
        const tier6Only: MatchingConfig = {
          ...DEFAULT_MATCHING_CONFIG,
          enabledTiers: ['POLICY_NUMBER_MULTI_BEST'],
        };

        // Default bands: 7 days → 0.9 → 36 + 20 + 10 = 66.
        expect(
          matchRow(input, indexes, [], 'Ambetter', tier6Only).confidence,
        ).toBe(66);
        // Tight bands (≤3 days only): 7 days → floor 0.1 → 4 + 20 + 10 = 34.
        expect(
          matchRow(input, indexes, [], 'Ambetter', {
            ...tier6Only,
            tierTuning: {
              dateProximityBands: [
                { maxDays: 0, score: 1 },
                { maxDays: 3, score: 0.5 },
              ],
            },
          }).confidence,
        ).toBe(34);
      });

      it('dateProximityFloor lifts the beyond-every-band score', () => {
        const policies = [
          makePolicy({ id: 'stale-date', effectiveDate: '2025-06-01' }),
          dummyCandidate,
        ];
        const indexes = buildMatchIndexes(policies);
        const input = makeMatchInput({ agentName: null });
        const tier6Only: MatchingConfig = {
          ...DEFAULT_MATCHING_CONFIG,
          enabledTiers: ['POLICY_NUMBER_MULTI_BEST'],
        };

        // Default floor 0.1 (>60 days): 4 + 20 + 10 = 34.
        expect(
          matchRow(input, indexes, [], 'Ambetter', tier6Only).confidence,
        ).toBe(34);
        // Floor 1: 40 + 20 + 10 = 70.
        expect(
          matchRow(input, indexes, [], 'Ambetter', {
            ...tier6Only,
            tierTuning: { dateProximityFloor: 1 },
          }).confidence,
        ).toBe(70);
      });
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

    it('feeds configured identifier roles from columnMapping (and stays inert without the knob)', () => {
      const mapping: ColumnMapping = {
        'Member ID': {
          crmField: 'applicationId',
          fieldType: 'TEXT',
          fieldKey: 'applicationId',
        },
      };

      const withoutKnob = buildMatchInputFromMapping(
        { 'Member ID': 'app-1' },
        mapping,
      );

      expect(withoutKnob.memberId).toBeNull();

      const withKnob = buildMatchInputFromMapping(
        { 'Member ID': 'app-1' },
        mapping,
        undefined,
        undefined,
        { memberId: 'applicationId' },
      );

      expect(withKnob.memberId).toBe('app-1');
      expect(withKnob.subscriberId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // OMN-12 identity: per-carrier identifier canonicalization
  // -------------------------------------------------------------------------

  describe('buildIdentifierCanonicalizer (OMN-12 identity)', () => {
    it('returns normalizePolicyNumber ITSELF when no knob is active (the bit-for-bit signal)', () => {
      expect(buildIdentifierCanonicalizer(null, undefined)).toBe(
        normalizePolicyNumber,
      );
      // Ambetter's '^U' has no capture group; {} normalization is a no-op.
      expect(buildIdentifierCanonicalizer(/^u/i, {})).toBe(
        normalizePolicyNumber,
      );
    });

    it('extracts the first capture group when the pattern matches, falls back symmetrically when it does not', () => {
      const canonicalize = buildIdentifierCanonicalizer(/^ABC(.+)$/i, {});

      expect(canonicalize('abc123')).toBe('123');
      // CRM side often stores the bare identifier — no capture, but the
      // same trim+uppercase path keeps lookups symmetric.
      expect(canonicalize(' 123 ')).toBe('123');
    });

    it('applies prefix, suffix-pattern, and leading-zero strips after trim+uppercase', () => {
      const canonicalize = buildIdentifierCanonicalizer(null, {
        stripPrefix: 'xyz',
        stripSuffixPattern: '-\\d+$',
        stripLeadingZeros: true,
      });

      expect(canonicalize(' xyz00123-01 ')).toBe('123');
      expect(canonicalize('00123')).toBe('123');
      // Leading-zero strip keeps at least one character.
      expect(canonicalize('0')).toBe('0');
    });

    it("BCBS-style: 'ABC00123456-01' (file) and '123456' (CRM) canonicalize to the same key", () => {
      const canonicalize = buildIdentifierCanonicalizer(/^ABC(.+)$/i, {
        stripSuffixPattern: '-\\d+$',
        stripLeadingZeros: true,
      });

      expect(canonicalize('ABC00123456-01')).toBe('123456');
      expect(canonicalize('123456')).toBe('123456');
    });

    it('returns null for empty/emptied values', () => {
      const canonicalize = buildIdentifierCanonicalizer(null, {
        stripPrefix: 'ABC',
      });

      expect(canonicalize('ABC')).toBeNull();
      expect(canonicalize('   ')).toBeNull();
      expect(canonicalize(null)).toBeNull();
    });

    it('matchRow + buildMatchIndexes with one canonicalizer match BCBS file values to bare CRM policy numbers', () => {
      const canonicalize = buildIdentifierCanonicalizer(/^ABC(.+)$/i, {
        stripSuffixPattern: '-\\d+$',
        stripLeadingZeros: true,
      });
      const indexes = buildMatchIndexes(
        [makePolicy({ id: 'bcbs-policy', policyNumber: '123456' })],
        { canonicalize },
      );

      const result = matchRow(
        makeMatchInput({
          policyNumber: 'ABC00123456-01',
          effectiveDate: null,
          agentName: null,
          agentNpn: null,
          memberDob: null,
        }),
        indexes,
        [],
        'BCBS',
        DEFAULT_MATCHING_CONFIG,
        { canonicalize },
      );

      expect(result.method).toBe('POLICY_NUMBER_SINGLE');
      expect(result.crmPolicyId).toBe('bcbs-policy');
    });
  });

  // -------------------------------------------------------------------------
  // OMN-12 identity: identifier roles + the IDENTIFIER_EXACT tier
  // -------------------------------------------------------------------------

  describe('identifier roles + IDENTIFIER_EXACT tier (OMN-12 identity)', () => {
    const identifierConfig: MatchingConfig = {
      ...DEFAULT_MATCHING_CONFIG,
      identifierRoles: { memberId: 'applicationId' },
    };

    // No policy number / agent / DOB / date signals — only the member ID —
    // so every other tier provably stays out of the way.
    const memberInput = (overrides: Partial<MatchInput> = {}): MatchInput =>
      makeMatchInput({
        policyNumber: null,
        effectiveDate: null,
        agentName: null,
        agentNpn: null,
        memberDob: null,
        memberId: 'app-001',
        ...overrides,
      });

    const memberIndexes = (policies: CrmPolicy[]) =>
      buildMatchIndexes(policies, {
        identifierRoles: identifierConfig.identifierRoles,
      });

    it('buildMatchIndexes builds one canonical-key index per CONFIGURED role only', () => {
      const policies = [makePolicy({ applicationId: ' app-001 ' })];

      expect(buildMatchIndexes(policies).policyByIdentifier.size).toBe(0);

      const indexes = memberIndexes(policies);

      expect(indexes.policyByIdentifier.get('memberId')?.get('APP-001')).toHaveLength(1);
      expect(indexes.policyByIdentifier.has('subscriberId')).toBe(false);
      expect(indexes.policyByIdentifier.has('groupNumber')).toBe(false);
    });

    it('matches a member-ID row to the CRM policy holding it in applicationId (unique hit)', () => {
      const result = matchRow(
        memberInput(),
        memberIndexes([
          makePolicy({
            id: 'member-policy',
            policyNumber: null,
            applicationId: 'APP-001',
          }),
          makePolicy({
            id: 'other-policy',
            policyNumber: null,
            applicationId: 'APP-999',
          }),
        ]),
        [],
        'BCBS',
        identifierConfig,
      );

      expect(result.method).toBe('IDENTIFIER_EXACT');
      expect(result.crmPolicyId).toBe('member-policy');
      expect(result.confidence).toBe(90);
      expect(result.status).toBe('AUTO_MATCHED');
      expect(result.notes).toContain('memberId "APP-001"');
    });

    it('is gated on identifierRoles, NOT enabledTiers — a default config never enters the tier', () => {
      // enabledTiers includes IDENTIFIER_EXACT by default (MATCH_TIER_IDS
      // wholesale), so the gate must be the identifierRoles knob itself.
      const result = matchRow(
        memberInput(),
        memberIndexes([
          makePolicy({
            id: 'member-policy',
            policyNumber: null,
            applicationId: 'APP-001',
          }),
        ]),
        [],
        'BCBS',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.method).toBe('UNMATCHED');
    });

    it('enabledTiers can still disable the tier once identifierRoles is configured', () => {
      const result = matchRow(
        memberInput(),
        memberIndexes([
          makePolicy({
            id: 'member-policy',
            policyNumber: null,
            applicationId: 'APP-001',
          }),
        ]),
        [],
        'BCBS',
        {
          ...identifierConfig,
          enabledTiers: identifierConfig.enabledTiers.filter(
            (tier) => tier !== 'IDENTIFIER_EXACT',
          ),
        },
      );

      expect(result.method).toBe('UNMATCHED');
    });

    it('date-corroborates a shared identifier (mirrors Tier 3)', () => {
      const result = matchRow(
        memberInput({ effectiveDate: '2026-01-01' }),
        memberIndexes([
          makePolicy({
            id: 'term-2025',
            policyNumber: null,
            applicationId: 'APP-001',
            effectiveDate: '2025-01-01',
          }),
          makePolicy({
            id: 'term-2026',
            policyNumber: null,
            applicationId: 'APP-001',
            effectiveDate: '2026-01-01',
          }),
        ]),
        [],
        'BCBS',
        identifierConfig,
      );

      expect(result.method).toBe('IDENTIFIER_EXACT');
      expect(result.crmPolicyId).toBe('term-2026');
      expect(result.status).toBe('AUTO_MATCHED');
      expect(result.notes).toContain('effective dates within');
    });

    it('shared identifier with no date signal falls to best-name and NEEDS_REVIEW (never auto-attach)', () => {
      const result = matchRow(
        memberInput(),
        memberIndexes([
          makePolicy({
            id: 'dep-john',
            policyNumber: null,
            applicationId: 'APP-001',
            'lead.name.firstName': 'John',
            'lead.name.lastName': 'Smith',
          }),
          makePolicy({
            id: 'dep-jane',
            policyNumber: null,
            applicationId: 'APP-001',
            'lead.name.firstName': 'Jane',
            'lead.name.lastName': 'Smith',
          }),
        ]),
        [],
        'BCBS',
        identifierConfig,
      );

      expect(result.method).toBe('IDENTIFIER_EXACT');
      expect(result.crmPolicyId).toBe('dep-john');
      expect(result.status).toBe('NEEDS_REVIEW');
      expect(result.confidence).toBe(
        Math.min(90, DEFAULT_MATCHING_CONFIG.autoMatchThreshold - 1),
      );
      expect(result.notes).toContain('shared by 2 CRM policies');
    });

    it('runs the narrowing chain on identifier candidates (re-enrollment: active beats canceled)', () => {
      const result = matchRow(
        memberInput(),
        memberIndexes([
          makePolicy({
            id: 'canceled-term',
            policyNumber: null,
            applicationId: 'APP-001',
            status: 'CANCELED',
          }),
          makePolicy({
            id: 'active-term',
            policyNumber: null,
            applicationId: 'APP-001',
            status: 'ACTIVE_PLACED',
          }),
        ]),
        [],
        'BCBS',
        identifierConfig,
      );

      expect(result.method).toBe('IDENTIFIER_EXACT');
      expect(result.crmPolicyId).toBe('active-term');
      expect(result.notes).toContain(
        'disambiguated from 2 candidates by active status',
      );
    });

    it('tierTuning.tierConfidences.IDENTIFIER_EXACT rescores the tier', () => {
      const result = matchRow(
        memberInput(),
        memberIndexes([
          makePolicy({
            id: 'member-policy',
            policyNumber: null,
            applicationId: 'APP-001',
          }),
        ]),
        [],
        'BCBS',
        {
          ...identifierConfig,
          tierTuning: { tierConfidences: { IDENTIFIER_EXACT: 70 } },
        },
      );

      expect(result.method).toBe('IDENTIFIER_EXACT');
      expect(result.confidence).toBe(70);
      expect(result.status).toBe('NEEDS_REVIEW');
    });

    it('Tier 1 honors overrides keyed on the stamped identifier value', () => {
      const result = matchRow(
        memberInput(),
        memberIndexes([
          makePolicy({
            id: 'pinned-policy',
            policyNumber: null,
            applicationId: 'APP-OTHER',
          }),
        ]),
        [
          {
            carrierPolicyNumber: 'APP-001',
            carrierName: 'BCBS',
            crmPolicyId: 'pinned-policy',
            isActive: true,
          },
        ],
        'BCBS',
        identifierConfig,
      );

      expect(result.method).toBe('OVERRIDE');
      expect(result.crmPolicyId).toBe('pinned-policy');
      expect(result.confidence).toBe(100);
    });

    it('resolveCarrierIdentifier: policy number first, then configured roles by priority, inert without the knob', () => {
      expect(resolveCarrierIdentifier(makeMatchInput(), undefined)).toBe(
        'U94692964',
      );
      expect(
        resolveCarrierIdentifier(
          makeMatchInput({
            policyNumber: null,
            memberId: ' app-1 ',
            groupNumber: 'GRP-9',
          }),
          { memberId: 'applicationId', groupNumber: 'planIdentifier' },
        ),
      ).toBe('APP-1');
      expect(
        resolveCarrierIdentifier(
          makeMatchInput({ policyNumber: null, groupNumber: 'GRP-9' }),
          { memberId: 'applicationId', groupNumber: 'planIdentifier' },
        ),
      ).toBe('GRP-9');
      // Without identifierRoles the helper is exactly policyNumber ?? null.
      expect(
        resolveCarrierIdentifier(
          makeMatchInput({ policyNumber: null, memberId: 'app-1' }),
          undefined,
        ),
      ).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // OMN-12 post-match strategies: configurable narrowing chain
  // -------------------------------------------------------------------------

  describe('narrowingStrategies (OMN-12 post-match strategies)', () => {
    const reEnrollmentPair = [
      makePolicy({
        id: 'canceled-term',
        status: 'CANCELED',
        effectiveDate: '2025-01-01',
      }),
      makePolicy({
        id: 'active-term',
        status: 'ACTIVE_PLACED',
        effectiveDate: '2025-02-01',
      }),
    ];
    const noSignalInput = makeMatchInput({
      effectiveDate: null,
      agentName: null,
      agentNpn: null,
      memberDob: null,
    });

    it('the default list reproduces the fixed chain (active-status winner)', () => {
      const result = matchRow(
        noSignalInput,
        buildMatchIndexes(reEnrollmentPair),
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      expect(result.crmPolicyId).toBe('active-term');
      expect(result.method).toBe('POLICY_NUMBER_SINGLE');
      expect(result.notes).toContain(
        'disambiguated from 2 candidates by active status',
      );
    });

    it('an empty list disables narrowing (multi-candidate sets fall to Tier 6)', () => {
      const result = matchRow(
        noSignalInput,
        buildMatchIndexes(reEnrollmentPair),
        [],
        'Ambetter',
        { ...DEFAULT_MATCHING_CONFIG, narrowingStrategies: [] },
      );

      expect(result.method).toBe('POLICY_NUMBER_MULTI_BEST');
    });

    it('a subset without activeStatus skips status narrowing', () => {
      const result = matchRow(
        noSignalInput,
        buildMatchIndexes(reEnrollmentPair),
        [],
        'Ambetter',
        { ...DEFAULT_MATCHING_CONFIG, narrowingStrategies: ['activeTerm'] },
      );

      // paidThroughDate is null, so activeTerm cannot decide either.
      expect(result.method).toBe('POLICY_NUMBER_MULTI_BEST');
    });

    it('order matters: recency listed first preempts the term window for all-terminal pairs', () => {
      const canceledPair = [
        makePolicy({
          id: 'jan-term',
          status: 'CANCELED',
          effectiveDate: '2026-01-01',
          expirationDate: '2026-01-31',
        }),
        makePolicy({
          id: 'feb-term',
          status: 'CANCELED',
          effectiveDate: '2026-02-01',
          expirationDate: '2026-12-31',
        }),
      ];
      const input = makeMatchInput({
        effectiveDate: null,
        agentName: null,
        agentNpn: null,
        memberDob: null,
        paidThroughDate: '2026-01-15',
      });

      const defaultResult = matchRow(
        input,
        buildMatchIndexes(canceledPair),
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      // Default order: activeTerm decides (paid-through inside jan window).
      expect(defaultResult.crmPolicyId).toBe('jan-term');
      expect(defaultResult.method).toBe('POLICY_NUMBER_SINGLE');

      const recencyFirst = matchRow(
        input,
        buildMatchIndexes(canceledPair),
        [],
        'Ambetter',
        {
          ...DEFAULT_MATCHING_CONFIG,
          narrowingStrategies: ['mostRecentEffectiveDate', 'activeTerm'],
        },
      );

      // Recency wins AND keeps its heuristic finalizer under reordering.
      expect(recencyFirst.crmPolicyId).toBe('feb-term');
      expect(recencyFirst.method).toBe('POLICY_NUMBER_NARROWED_RECENT');
      expect(recencyFirst.status).toBe('NEEDS_REVIEW');
    });
  });

  // -------------------------------------------------------------------------
  // Wave-5 handoff: per-carrier negativeTerminalStatuses in the narrowing
  // chain
  // -------------------------------------------------------------------------

  describe('negativeTerminalStatuses threading (Wave-5 handoff)', () => {
    const customSet: ReadonlySet<string> = new Set([
      ...NEGATIVE_TERMINAL_STATUSES,
      'LAPSED',
    ]);
    const lapsedPair = [
      makePolicy({ id: 'lapsed-term', status: 'LAPSED' }),
      makePolicy({ id: 'active-term', status: 'ACTIVE_PLACED' }),
    ];
    const noSignalInput = makeMatchInput({
      effectiveDate: null,
      agentName: null,
      agentNpn: null,
      memberDob: null,
    });

    it('selectByActiveStatus honors a custom terminal set (default treats LAPSED as live)', () => {
      expect(selectByActiveStatus(lapsedPair)).toBeNull();
      expect(selectByActiveStatus(lapsedPair, customSet)?.id).toBe(
        'active-term',
      );
    });

    it('selectByMostRecentEffectiveDate honors a custom terminal set', () => {
      const pair = [
        makePolicy({
          id: 'older',
          status: 'LAPSED',
          effectiveDate: '2026-01-01',
        }),
        makePolicy({
          id: 'newer',
          status: 'CANCELED',
          effectiveDate: '2026-02-01',
        }),
      ];

      // LAPSED is not terminal by default → not all-terminal → null.
      expect(selectByMostRecentEffectiveDate(pair)).toBeNull();
      expect(selectByMostRecentEffectiveDate(pair, customSet)?.id).toBe(
        'newer',
      );
    });

    it('matchRow options.negativeTerminalStatuses reaches the narrowing chain', () => {
      const defaultResult = matchRow(
        noSignalInput,
        buildMatchIndexes(lapsedPair),
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );

      // Default set: LAPSED counts as live → 2 "active" → no narrowing.
      expect(defaultResult.method).toBe('POLICY_NUMBER_MULTI_BEST');

      const customResult = matchRow(
        noSignalInput,
        buildMatchIndexes(lapsedPair),
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
        { negativeTerminalStatuses: customSet },
      );

      expect(customResult.crmPolicyId).toBe('active-term');
      expect(customResult.notes).toContain('by active status');
    });

    it('parity: explicit default options ≡ no options', () => {
      const indexes = buildMatchIndexes(lapsedPair);
      const bare = matchRow(
        noSignalInput,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
      );
      const explicit = matchRow(
        noSignalInput,
        indexes,
        [],
        'Ambetter',
        DEFAULT_MATCHING_CONFIG,
        {
          canonicalize: normalizePolicyNumber,
          negativeTerminalStatuses: NEGATIVE_TERMINAL_STATUSES,
        },
      );

      expect(JSON.stringify(explicit)).toBe(JSON.stringify(bare));
    });
  });
});
