import {
  computeFieldDiffsFromMapping,
  summarizeDiffs,
} from 'src/modules/reconciliation/engines/diff';
import type { ColumnMapping } from 'src/modules/reconciliation/types/reconciliation';

describe('diff engine', () => {
  const baseColumnMapping: ColumnMapping = {
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
    member_last: {
      crmField: 'lead.name.lastName',
      fieldType: 'FULL_NAME',
      fieldKey: 'update:lastName-name (lead)',
    },
    broker_name: {
      crmField: 'agent.name',
      fieldType: 'TEXT',
      fieldKey: 'update:name (agent)',
    },
    eff_date: {
      crmField: 'effectiveDate',
      fieldType: 'DATE',
      fieldKey: 'effectiveDate',
    },
  };

  const baseBobRow = {
    policy_no: 'U94692964',
    member_first: 'John',
    member_last: 'Smith',
    broker_name: 'Omnia Insurance',
    eff_date: '2026-01-01',
  };

  const baseCrmPolicy = {
    status: 'ACTIVE_PLACED',
    expirationDate: null,
    effectiveDate: '2026-01-01',
    policyNumber: 'U94692964',
    'lead.name.firstName': 'John',
    'lead.name.lastName': 'Smith',
    'agent.name': 'Omnia Insurance',
  };

  it('returns no diffs when everything matches', () => {
    const diffs = computeFieldDiffsFromMapping(
      baseBobRow,
      baseCrmPolicy,
      null,
      baseColumnMapping,
    );

    expect(diffs).toHaveLength(0);
  });

  it('detects status change from status engine', () => {
    const statusDecision = {
      derivedStatus: 'CANCELED' as const,
      derivedExpireDate: '2026-03-01',
      cancelPreviousPolicyId: null,
      statusChangeReason: 'Not eligible for commission',
    };

    const diffs = computeFieldDiffsFromMapping(
      baseBobRow,
      baseCrmPolicy,
      statusDecision,
      baseColumnMapping,
    );

    const statusDiff = diffs.find((d) => d.crmField === 'status');
    const expireDiff = diffs.find((d) => d.crmField === 'expirationDate');

    expect(statusDiff).toBeDefined();
    expect(statusDiff?.bobValue).toBe('CANCELED');
    expect(statusDiff?.crmValue).toBe('ACTIVE_PLACED');
    expect(statusDiff?.action).toBe('COMPUTED');
    expect(statusDiff?.severity).toBe('CRITICAL');

    expect(expireDiff).toBeDefined();
    expect(expireDiff?.bobValue).toBe('2026-03-01');
  });

  describe('negative-to-negative status transitions', () => {
    // Reviewers were rejecting these by hand: PAYMENT_ERROR_CANCELED,
    // DECLINED, and INCOMPLETE all describe a policy that is over. Moving
    // between them or to plain CANCELED strips legacy context without
    // changing the underlying outcome.
    const canceledDecision = {
      derivedStatus: 'CANCELED' as const,
      derivedExpireDate: '2026-03-01',
      cancelPreviousPolicyId: null,
      statusChangeReason: 'Not eligible for commission',
    };

    it.each([
      ['PAYMENT_ERROR_CANCELED'],
      ['DECLINED'],
      ['INCOMPLETE'],
      ['CANCELED'],
    ])('suppresses status diff when CRM is %s and engine derives CANCELED', (crmStatus) => {
      const diffs = computeFieldDiffsFromMapping(
        baseBobRow,
        { ...baseCrmPolicy, status: crmStatus },
        canceledDecision,
        baseColumnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'status')).toBeUndefined();
    });

    it('still emits a status diff when CRM is a negative terminal but engine derives ACTIVE_*', () => {
      // Sanity check: going from a terminal state back to active still
      // surfaces (could be a real reinstatement worth reviewing).
      const reinstatedDecision = {
        derivedStatus: 'ACTIVE_PLACED' as const,
        derivedExpireDate: null,
        cancelPreviousPolicyId: null,
        statusChangeReason: 'reinstated',
      };

      const diffs = computeFieldDiffsFromMapping(
        baseBobRow,
        { ...baseCrmPolicy, status: 'PAYMENT_ERROR_CANCELED' },
        reinstatedDecision,
        baseColumnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'status')).toBeDefined();
    });
  });

  it('detects member name discrepancy past fuzzy threshold', () => {
    const diffs = computeFieldDiffsFromMapping(
      { ...baseBobRow, member_first: 'Beatrice' },
      baseCrmPolicy,
      null,
      baseColumnMapping,
    );

    const nameDiff = diffs.find((d) => d.crmField === 'lead.name.firstName');

    expect(nameDiff).toBeDefined();
    expect(nameDiff?.bobValue).toBe('Beatrice');
    expect(nameDiff?.crmValue).toBe('John');
    expect(nameDiff?.action).toBe('UPDATE');
    expect(nameDiff?.crmObjectType).toBe('lead');
  });

  it('detects effective-date discrepancy', () => {
    const diffs = computeFieldDiffsFromMapping(
      { ...baseBobRow, eff_date: '2026-02-01' },
      baseCrmPolicy,
      null,
      baseColumnMapping,
    );

    const dateDiff = diffs.find((d) => d.crmField === 'effectiveDate');

    expect(dateDiff).toBeDefined();
    expect(dateDiff?.bobValue).toBe('2026-02-01');
    expect(dateDiff?.crmValue).toBe('2026-01-01');
  });

  describe('currency (premium.amountMicros)', () => {
    const currencyMapping: ColumnMapping = {
      ...baseColumnMapping,
      premium_amount: {
        crmField: 'premium.amountMicros',
        fieldType: 'CURRENCY',
        fieldKey: 'Amount (premium)',
      },
    };

    // Currency diffs are suppressed wholesale — see diff.ts for the
    // rationale (CRM `premium` = member responsibility from legacy
    // backfill vs. BOB columns shipping both gross and member amounts).
    it('suppresses currency diffs even when amounts differ', () => {
      const diffs = computeFieldDiffsFromMapping(
        { ...baseBobRow, premium_amount: 200 },
        { ...baseCrmPolicy, 'premium.amountMicros': 156_500_000 },
        null,
        currencyMapping,
      );

      expect(
        diffs.find((d) => d.crmField === 'premium.amountMicros'),
      ).toBeUndefined();
    });
  });

  describe('backwards effectiveDate suppression', () => {
    // Carriers like Ambetter carry forward the original enrollment date in
    // policy_effective_date even after a renewal. Without this suppression
    // the diff engine would propose moving the renewal CRM record's
    // effectiveDate backwards to the prior plan year — almost always wrong.
    it('suppresses backwards effectiveDate moves on column-mapped diffs', () => {
      const diffs = computeFieldDiffsFromMapping(
        // BOB carries forward 2025 enrollment …
        { ...baseBobRow, eff_date: '2025-10-01' },
        // … but CRM is the 2026 renewal record.
        { ...baseCrmPolicy, effectiveDate: '2026-01-01' },
        null,
        baseColumnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'effectiveDate')).toBeUndefined();
    });

    it('still emits a diff for forward effectiveDate corrections', () => {
      const diffs = computeFieldDiffsFromMapping(
        { ...baseBobRow, eff_date: '2026-03-01' },
        { ...baseCrmPolicy, effectiveDate: '2026-01-01' },
        null,
        baseColumnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'effectiveDate')).toBeDefined();
    });

    it('suppresses backwards effectiveDate moves on computed-field diffs', () => {
      // Ambetter wires effectiveDate through a computed field
      // (trueEffectiveDate = maxDate(broker, policy)). Without the guard on
      // the computed-field loop the diff still slips through.
      const columnMapping: ColumnMapping = {
        // No direct effectiveDate mapping — the computed field claims it.
        policy_no: {
          crmField: 'policyNumber',
          fieldType: 'TEXT',
          fieldKey: 'policyNumber',
        },
      };
      const computedFields = [
        {
          outputKey: 'trueEffectiveDate',
          method: 'maxDate',
          inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
          type: 'date',
          crmField: 'effectiveDate',
        },
      ];

      const diffs = computeFieldDiffsFromMapping(
        {
          policy_no: 'U94692964',
          trueEffectiveDate: '2025-10-01',
        },
        { ...baseCrmPolicy, effectiveDate: '2026-01-01' },
        null,
        columnMapping,
        computedFields,
      );

      expect(diffs.find((d) => d.crmField === 'effectiveDate')).toBeUndefined();
    });
  });

  describe('multi-member subscriber mismatch', () => {
    // Regression for UZ1687884: family policy with applicantCount=2.
    // CRM has the dependent (Antoine Williams, DOB 2005) attached as the
    // primary lead. BOB describes the subscriber (Shabretta Williams, DOB
    // 1983). Engine used to propose overwriting Antoine's name + DOB with
    // Shabretta's, destroying the dependent's identity. Expected: lead
    // identity diffs suppressed, synthetic INFO_ONLY notice emitted so
    // the UI surfaces the linkage problem for human review.
    const familyColumnMapping: ColumnMapping = {
      member_first: {
        crmField: 'lead.name.firstName',
        fieldType: 'FULL_NAME',
        fieldKey: 'update:firstName-name (lead)',
      },
      member_last: {
        crmField: 'lead.name.lastName',
        fieldType: 'FULL_NAME',
        fieldKey: 'update:lastName-name (lead)',
      },
      member_dob: {
        crmField: 'lead.dateOfBirth',
        fieldType: 'DATE',
        fieldKey: 'update:dateOfBirth (lead)',
      },
      broker_name: {
        crmField: 'agent.name',
        fieldType: 'TEXT',
        fieldKey: 'update:name (agent)',
      },
      eff_date: {
        crmField: 'effectiveDate',
        fieldType: 'DATE',
        fieldKey: 'effectiveDate',
      },
    };

    const subscriberRow = {
      member_first: 'Shabretta',
      member_last: 'Williams',
      member_dob: '1983-06-16',
      broker_name: 'Kevin Desku',
      eff_date: '2026-01-01',
    };

    const dependentLeadOnPolicy = {
      status: 'ACTIVE_PLACED',
      effectiveDate: '2026-01-01',
      expirationDate: null,
      applicantCount: 2,
      'lead.name.firstName': 'Antoine',
      'lead.name.lastName': 'Williams',
      'lead.dateOfBirth': '2005-08-29',
      'agent.name': 'Kevin Desku',
    };

    it('suppresses lead identity diffs when applicantCount > 1 and DOB clearly differs', () => {
      const diffs = computeFieldDiffsFromMapping(
        subscriberRow,
        dependentLeadOnPolicy,
        null,
        familyColumnMapping,
      );

      expect(
        diffs.find((d) => d.crmField === 'lead.name.firstName'),
      ).toBeUndefined();
      expect(
        diffs.find((d) => d.crmField === 'lead.name.lastName'),
      ).toBeUndefined();
      expect(
        diffs.find((d) => d.crmField === 'lead.dateOfBirth'),
      ).toBeUndefined();
    });

    it('emits a synthetic INFO_ONLY diff that the apply step ignores (crmField=null)', () => {
      const diffs = computeFieldDiffsFromMapping(
        subscriberRow,
        dependentLeadOnPolicy,
        null,
        familyColumnMapping,
      );

      const notice = diffs.find(
        (d) => d.field === '__multiMemberSubscriberMismatch',
      );

      expect(notice).toBeDefined();
      expect(notice?.action).toBe('INFO_ONLY');
      expect(notice?.crmField).toBeNull();
      expect(notice?.bobValue).toContain('Shabretta');
      expect(notice?.bobValue).toContain('1983-06-16');
      expect(notice?.crmValue).toContain('Antoine');
      expect(notice?.crmValue).toContain('2005-08-29');
      expect(notice?.note).toMatch(/2 members/);
    });

    it('does NOT suppress when applicantCount = 1 (single-member policy)', () => {
      const singleMemberPolicy = {
        ...dependentLeadOnPolicy,
        applicantCount: 1,
      };

      const diffs = computeFieldDiffsFromMapping(
        subscriberRow,
        singleMemberPolicy,
        null,
        familyColumnMapping,
      );

      // Real corrections still propose updates on solo policies.
      expect(
        diffs.find((d) => d.crmField === 'lead.name.firstName'),
      ).toBeDefined();
      expect(
        diffs.find((d) => d.field === '__multiMemberSubscriberMismatch'),
      ).toBeUndefined();
    });

    it('does NOT suppress when DOBs differ by less than a year (typo-shaped)', () => {
      const closeDobPolicy = {
        ...dependentLeadOnPolicy,
        'lead.dateOfBirth': '1983-08-16', // 2 months from BOB
      };

      const diffs = computeFieldDiffsFromMapping(
        subscriberRow,
        closeDobPolicy,
        null,
        familyColumnMapping,
      );

      // Small DOB delta is more likely a data-entry slip than a wrong
      // person — let the diff surface for normal review.
      expect(
        diffs.find((d) => d.crmField === 'lead.dateOfBirth'),
      ).toBeDefined();
      expect(
        diffs.find((d) => d.field === '__multiMemberSubscriberMismatch'),
      ).toBeUndefined();
    });

    it('does NOT suppress non-lead diffs even when subscriber mismatch fires', () => {
      const diffs = computeFieldDiffsFromMapping(
        { ...subscriberRow, eff_date: '2026-02-15' },
        dependentLeadOnPolicy,
        null,
        familyColumnMapping,
      );

      // Subscriber-mismatch suppression is scoped to lead identity —
      // policy-level fields still surface normally.
      expect(
        diffs.find((d) => d.crmField === 'effectiveDate'),
      ).toBeDefined();
    });

    it('does not fire when applicantCount is missing (legacy policies)', () => {
      const noCountPolicy = { ...dependentLeadOnPolicy };

      delete (noCountPolicy as Record<string, unknown>).applicantCount;

      const diffs = computeFieldDiffsFromMapping(
        subscriberRow,
        noCountPolicy,
        null,
        familyColumnMapping,
      );

      expect(
        diffs.find((d) => d.field === '__multiMemberSubscriberMismatch'),
      ).toBeUndefined();
      expect(
        diffs.find((d) => d.crmField === 'lead.name.firstName'),
      ).toBeDefined();
    });
  });

  describe('cross-term namesake conflict', () => {
    // Regression for U73572258: two CRM policies share the same policy
    // number across plan years. BOB row's eff date + agent + contact info
    // match the brianna-falcon policy, but its NAME ("Andy Guebara")
    // matches the lead on the other policy under the same number. Engine
    // used to propose overwriting brianna's name + DOB with Andy's,
    // destroying brianna's identity even though Andy already exists in
    // CRM as a separate lead.
    const sharedPolicyNumberMapping: ColumnMapping = {
      member_first: {
        crmField: 'lead.name.firstName',
        fieldType: 'FULL_NAME',
        fieldKey: 'update:firstName-name (lead)',
      },
      member_last: {
        crmField: 'lead.name.lastName',
        fieldType: 'FULL_NAME',
        fieldKey: 'update:lastName-name (lead)',
      },
      member_dob: {
        crmField: 'lead.dateOfBirth',
        fieldType: 'DATE',
        fieldKey: 'update:dateOfBirth (lead)',
      },
    };

    const matchedBriannaPolicy = {
      status: 'CANCELED',
      effectiveDate: '2026-03-01',
      expirationDate: '2026-03-01',
      applicantCount: 1,
      policyNumber: 'U73572258',
      'lead.name.firstName': 'brianna',
      'lead.name.lastName': 'falcon',
      'lead.dateOfBirth': '1966-11-07',
    };

    const namesakeAndyPolicy = {
      id: 'c8979322-policy',
      status: 'PAYMENT_ERROR_CANCELED',
      effectiveDate: '2026-02-01',
      expirationDate: '2026-02-01',
      policyNumber: 'U73572258',
      'lead.name.firstName': 'Andy',
      'lead.name.lastName': 'Guebara',
      'lead.dateOfBirth': '1966-11-07',
    };

    const bobRowAndy = {
      member_first: 'Andy',
      member_last: 'Guebara',
      member_dob: '1966-11-07',
    };

    it('suppresses lead identity diffs when BOB name matches a namesake under the same policy number', () => {
      const diffs = computeFieldDiffsFromMapping(
        bobRowAndy,
        matchedBriannaPolicy,
        null,
        sharedPolicyNumberMapping,
        undefined,
        [namesakeAndyPolicy],
      );

      expect(
        diffs.find((d) => d.crmField === 'lead.name.firstName'),
      ).toBeUndefined();
      expect(
        diffs.find((d) => d.crmField === 'lead.name.lastName'),
      ).toBeUndefined();
    });

    it('emits a synthetic INFO_ONLY notice naming the namesake', () => {
      const diffs = computeFieldDiffsFromMapping(
        bobRowAndy,
        matchedBriannaPolicy,
        null,
        sharedPolicyNumberMapping,
        undefined,
        [namesakeAndyPolicy],
      );

      const notice = diffs.find(
        (d) => d.field === '__multiMemberSubscriberMismatch',
      );

      expect(notice).toBeDefined();
      expect(notice?.action).toBe('INFO_ONLY');
      expect(notice?.crmField).toBeNull();
      expect(notice?.label).toContain('Cross-term namesake');
      expect(notice?.note).toContain('Andy Guebara');
      expect(notice?.bobValue).toContain('Andy');
      expect(notice?.crmValue).toContain('brianna');
    });

    it('does NOT fire when no namesakes are passed (single-policy reconciliation)', () => {
      const diffs = computeFieldDiffsFromMapping(
        bobRowAndy,
        matchedBriannaPolicy,
        null,
        sharedPolicyNumberMapping,
      );

      // Without namesake context, this looks like a normal name correction
      // and the diff should still surface for review.
      expect(
        diffs.find((d) => d.crmField === 'lead.name.firstName'),
      ).toBeDefined();
      expect(
        diffs.find((d) => d.field === '__multiMemberSubscriberMismatch'),
      ).toBeUndefined();
    });

    it('does NOT fire when matched lead name already matches BOB (legitimate match)', () => {
      const matchedAndyPolicy = {
        ...matchedBriannaPolicy,
        'lead.name.firstName': 'Andy',
        'lead.name.lastName': 'Guebara',
      };

      const diffs = computeFieldDiffsFromMapping(
        bobRowAndy,
        matchedAndyPolicy,
        null,
        sharedPolicyNumberMapping,
        undefined,
        // brianna falcon as namesake, but matched lead already matches
        // BOB so there's no conflict — names line up with the right one.
        [
          {
            id: 'b892d548-policy',
            'lead.name.firstName': 'brianna',
            'lead.name.lastName': 'falcon',
            'lead.dateOfBirth': '1966-11-07',
          },
        ],
      );

      expect(
        diffs.find((d) => d.field === '__multiMemberSubscriberMismatch'),
      ).toBeUndefined();
    });

    it('does NOT fire when no namesake lead matches BOB (genuine name correction)', () => {
      const unrelatedNamesake = {
        id: 'unrelated-policy',
        'lead.name.firstName': 'Charles',
        'lead.name.lastName': 'Different',
        'lead.dateOfBirth': '1980-01-01',
      };

      const diffs = computeFieldDiffsFromMapping(
        bobRowAndy,
        matchedBriannaPolicy,
        null,
        sharedPolicyNumberMapping,
        undefined,
        [unrelatedNamesake],
      );

      // No namesake matches BOB → likely a real name correction → diff
      // should still surface for review.
      expect(
        diffs.find((d) => d.crmField === 'lead.name.firstName'),
      ).toBeDefined();
      expect(
        diffs.find((d) => d.field === '__multiMemberSubscriberMismatch'),
      ).toBeUndefined();
    });

    it('multi-member detection still wins when both could fire', () => {
      const multiMemberPolicy = {
        ...matchedBriannaPolicy,
        applicantCount: 2,
        'lead.dateOfBirth': '2005-01-01',
      };

      const diffs = computeFieldDiffsFromMapping(
        bobRowAndy,
        multiMemberPolicy,
        null,
        sharedPolicyNumberMapping,
        undefined,
        [namesakeAndyPolicy],
      );

      const notice = diffs.find(
        (d) => d.field === '__multiMemberSubscriberMismatch',
      );

      // Multi-member is more specific (applicantCount + DOB delta) so it
      // takes precedence over the cross-term namesake explanation.
      expect(notice?.label).toContain('Multi-member');
    });
  });

  describe('agent identity suppression', () => {
    // Agents sometimes sell under another agent's NPN (the agent-of-record
    // arrangement). The carrier reports the AOR; CRM tracks the actual
    // selling agent. Diffs against agent.* would propose overwriting the
    // selling agent with the AOR — never what we want.
    it('suppresses agent.name diffs even when the values clearly differ', () => {
      const columnMapping: ColumnMapping = {
        broker_name: {
          crmField: 'agent.name',
          fieldType: 'TEXT',
          fieldKey: 'update:name (agent)',
        },
      };

      const diffs = computeFieldDiffsFromMapping(
        { broker_name: 'Nicholas James' },
        { 'agent.name': 'Dania Chavarri' },
        null,
        columnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'agent.name')).toBeUndefined();
    });

    it('suppresses agent.npn diffs', () => {
      const columnMapping: ColumnMapping = {
        broker_npn: {
          crmField: 'agent.npn',
          fieldType: 'TEXT',
          fieldKey: 'update:npn (agent)',
        },
      };

      const diffs = computeFieldDiffsFromMapping(
        { broker_npn: '15293460' },
        { 'agent.npn': '19668254' },
        null,
        columnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'agent.npn')).toBeUndefined();
    });

    it('suppresses agent.* diffs from computed fields too', () => {
      const diffs = computeFieldDiffsFromMapping(
        { computed_agent: 'Nicholas James' },
        { 'agent.name': 'Dania Chavarri' },
        null,
        {},
        [
          {
            outputKey: 'computed_agent',
            method: 'coalesce',
            inputs: ['broker_name'],
            type: 'string',
            crmField: 'agent.name',
          },
        ],
      );

      expect(diffs.find((d) => d.crmField === 'agent.name')).toBeUndefined();
    });
  });

  describe('name-like field classification', () => {
    // Regression: agent.name used to be a literal-equality special case in
    // the isNameField check. After unifying the helper to a path-suffix check,
    // verify it still picks fuzzyName comparison (so trailing entity suffixes
    // like " LLC" don't produce false-positive diffs).
    it('uses fuzzyName comparison for agent.name (no diff for entity-suffix variant)', () => {
      const columnMapping: ColumnMapping = {
        broker_name: {
          crmField: 'agent.name',
          fieldType: 'TEXT',
          fieldKey: 'update:name (agent)',
        },
      };

      const diffs = computeFieldDiffsFromMapping(
        { broker_name: 'Omnia Insurance LLC' },
        { 'agent.name': 'Omnia Insurance' },
        null,
        columnMapping,
      );

      expect(diffs.find((d) => d.crmField === 'agent.name')).toBeUndefined();
    });

    // Regression: when the BOB row carries the hyphenated suffix
    // ("Archer-Mckenley") and the CRM has the canonical short form
    // ("Archer"), the fuzzy matcher used to fail because of the equal
    // word-count tiebreak. The hyphen check must work either direction.
    it('matches hyphenated suffix regardless of which side carries it', () => {
      const columnMapping: ColumnMapping = {
        broker_name: {
          crmField: 'agent.name',
          fieldType: 'TEXT',
          fieldKey: 'update:name (agent)',
        },
      };

      const bobLonger = computeFieldDiffsFromMapping(
        { broker_name: 'Chancelyn Archer-Mckenley' },
        { 'agent.name': 'Chancelyn Archer' },
        null,
        columnMapping,
      );
      expect(
        bobLonger.find((d) => d.crmField === 'agent.name'),
      ).toBeUndefined();

      const crmLonger = computeFieldDiffsFromMapping(
        { broker_name: 'Chancelyn Archer' },
        { 'agent.name': 'Chancelyn Archer-Mckenley' },
        null,
        columnMapping,
      );
      expect(
        crmLonger.find((d) => d.crmField === 'agent.name'),
      ).toBeUndefined();
    });
  });

  describe('summarizeDiffs', () => {
    it('returns empty string for no diffs', () => {
      expect(summarizeDiffs([])).toBe('');
    });

    it('summarizes up to 3 diffs inline', () => {
      const diffs = computeFieldDiffsFromMapping(
        { ...baseBobRow, member_first: 'Jane', member_last: 'Doe' },
        baseCrmPolicy,
        null,
        baseColumnMapping,
      );

      const summary = summarizeDiffs(diffs);

      expect(summary).toContain('member_first');
      expect(summary).toContain('Jane');
    });
  });
});
