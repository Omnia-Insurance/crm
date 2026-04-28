import {
  matchRow,
  buildMatchIndexes,
  agentNameMatches,
  memberNameScore,
  datesWithinDays,
  isValidAmbetterPolicyNumber,
  DEFAULT_MATCHING_CONFIG,
  type CrmPolicy,
  type BobRow,
} from 'src/modules/reconciliation/engines/matching';

const makePolicy = (overrides: Partial<CrmPolicy> = {}): CrmPolicy => ({
  id: 'policy-1',
  policyNumber: 'U94692964',
  applicationId: null,
  effectiveDate: '2026-01-01',
  expirationDate: null,
  status: 'ACTIVE_PLACED',
  applicantCount: null,
  leadFirstName: 'John',
  leadLastName: 'Smith',
  leadDob: '1990-05-15',
  leadState: null,
  agentName: 'Omnia Insurance Group',
  agentNpn: '12345678',
  planIdentifier: null,
  leadPhone: null,
  leadEmail: null,
  leadId: null,
  ...overrides,
});

const makeBobRow = (overrides: Partial<BobRow> = {}): BobRow => ({
  carrierPolicyNumber: 'U94692964',
  brokerName: 'Omnia Insurance Group',
  brokerNpn: '12345678',
  trueEffectiveDate: '2026-01-01',
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
      expect(agentNameMatches('Omnia Insurance LLC', 'Omnia Insurance')).toBe(true);
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
      expect(memberNameScore('John', 'Smith', 'John', 'Smith')).toBeGreaterThan(0.95);
    });

    it('returns decent score for minor typos', () => {
      expect(memberNameScore('Marry', 'Jane', 'Mary', 'Jane')).toBeGreaterThan(0.85);
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
      const row = makeBobRow();

      const result = matchRow(row, indexes, [], 'Ambetter', DEFAULT_MATCHING_CONFIG);

      expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
      expect(result.confidence).toBe(98);
      expect(result.status).toBe('AUTO_MATCHED');
      expect(result.crmPolicyId).toBe('policy-1');
    });

    it('Tier 3: matches on policy# + date when agent differs', () => {
      const policies = [makePolicy({ agentName: 'Different Agency' })];
      const indexes = buildMatchIndexes(policies);
      const row = makeBobRow();

      const result = matchRow(row, indexes, [], 'Ambetter', DEFAULT_MATCHING_CONFIG);

      expect(result.method).toBe('POLICY_NUMBER_PLUS_EFFECTIVE_DATE');
      expect(result.confidence).toBe(95);
    });

    it('Tier 5: single policy# match when date and agent differ', () => {
      const policies = [makePolicy({
        agentName: 'Different Agency',
        effectiveDate: '2025-01-01',
      })];
      const indexes = buildMatchIndexes(policies);
      const row = makeBobRow();

      const result = matchRow(row, indexes, [], 'Ambetter', DEFAULT_MATCHING_CONFIG);

      expect(result.method).toBe('POLICY_NUMBER_SINGLE');
      expect(result.confidence).toBe(90);
    });

    it('Tier 9: unmatched when no signals match', () => {
      const policies = [makePolicy({
        policyNumber: 'U99999999',
        agentNpn: '00000000',
        leadDob: '1970-01-01',
        leadFirstName: 'Alice',
        leadLastName: 'Wonderland',
      })];
      const indexes = buildMatchIndexes(policies);
      const row = makeBobRow();

      const result = matchRow(row, indexes, [], 'Ambetter', DEFAULT_MATCHING_CONFIG);

      expect(result.method).toBe('UNMATCHED');
      expect(result.confidence).toBe(0);
      expect(result.crmPolicyId).toBeNull();
    });

    it('Tier 1: override takes precedence', () => {
      const policies = [makePolicy()];
      const indexes = buildMatchIndexes(policies);
      const row = makeBobRow();
      const overrides = [{
        carrierPolicyNumber: 'U94692964',
        carrierName: 'Ambetter',
        crmPolicyId: 'policy-1',
        isActive: true,
      }];

      const result = matchRow(row, indexes, overrides, 'Ambetter', DEFAULT_MATCHING_CONFIG);

      expect(result.method).toBe('OVERRIDE');
      expect(result.confidence).toBe(100);
    });

    it('Tier 6: disambiguates multiple policies with same number', () => {
      const policies = [
        makePolicy({ id: 'policy-1', effectiveDate: '2026-01-01' }),
        makePolicy({ id: 'policy-2', effectiveDate: '2025-01-01', agentName: 'Other Agent' }),
      ];
      const indexes = buildMatchIndexes(policies);
      const row = makeBobRow();

      const result = matchRow(row, indexes, [], 'Ambetter', DEFAULT_MATCHING_CONFIG);

      // Should pick policy-1 (closer date + matching agent)
      expect(result.method).toBe('POLICY_NUMBER_DATE_AGENT');
      expect(result.crmPolicyId).toBe('policy-1');
    });
  });
});
