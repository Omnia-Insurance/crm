/**
 * Tests for the config-driven generic parser.
 * Includes parity tests proving identical output to the legacy Ambetter parser.
 */

import {
  parseAmbetterBob,
  DEFAULT_AMBETTER_COLUMN_MAPPING,
} from 'src/modules/reconciliation/parsers/ambetter';
import { parseGenericBob } from 'src/modules/reconciliation/parsers/generic';
import { AMBETTER_FIELD_CONFIG } from 'src/modules/reconciliation/config/ambetter.field-config';

// Real Ambetter BOB rows from the 03/10/2026 export
const REAL_ROWS = [
  {
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U94753487',
    'Plan Name': 'Ambetter Balanced Care 12 (2021) + Vision + Adult Dental',
    'Insured First Name': 'Sara',
    'Insured Last Name': 'Ghoston',
    'Broker Effective Date': '2/1/2026',
    'Policy Effective Date': '4/1/2021',
    'Policy Term Date': '8/31/2021',
    'Paid Through Date': '8/31/2021',
    'Member Date Of Birth': '12/30/1963',
    'Eligible for Commission': 'No',
    'Member Phone Number': '2149953244',
    'Member Email': 'ghostonsara8@gmail.com',
  },
  {
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U71951365',
    'Plan Name': 'Everyday Bronze',
    'Insured First Name': 'Brittany',
    'Insured Last Name': 'Smith',
    'Broker Effective Date': '1/1/2026',
    'Policy Effective Date': '6/1/2024',
    'Policy Term Date': '12/31/2026',
    'Paid Through Date': '12/31/2026',
    'Member Date Of Birth': '6/4/1985',
    'Eligible for Commission': 'Yes',
  },
  {
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U73500709',
    'Plan Name': 'Everyday Bronze',
    'Insured First Name': 'Jeremy',
    'Insured Last Name': 'Boudreaux',
    'Broker Effective Date': '1/1/2026',
    'Policy Effective Date': '1/1/2026',
    'Policy Term Date': '12/31/2026',
    'Paid Through Date': '1/31/2026',
    'Member Date Of Birth': '2/10/1988',
    'Eligible for Commission': 'Yes',
    'Member Phone Number': '9853340462',
    'Member Email': 'boudreauxjeremy40@gmail.com',
  },
];

describe('generic parser', () => {
  describe('basic functionality', () => {
    it('parses rows using field config', () => {
      const { normalized, errors } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      expect(errors).toHaveLength(0);
      expect(normalized).toHaveLength(3);
    });

    it('applies text transforms', () => {
      const { normalized } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      expect(normalized[0].memberFirstName).toBe('Sara');
      expect(normalized[0].memberLastName).toBe('Ghoston');
      expect(normalized[0].brokerName).toBe('Alexandria Marrero');
    });

    it('applies date transforms', () => {
      const { normalized } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      expect(normalized[0].policyEffectiveDate).toBe('2021-04-01');
      expect(normalized[0].brokerEffectiveDate).toBe('2026-02-01');
      expect(normalized[0].paidThroughDate).toBe('2021-08-31');
    });

    it('applies boolean transforms', () => {
      const { normalized } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      expect(normalized[0].eligibleForCommission).toBe(false);
      expect(normalized[1].eligibleForCommission).toBe(true);
    });

    it('computes trueEffectiveDate via maxDate', () => {
      const { normalized } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      // Sara: MAX('2026-02-01', '2021-04-01') = '2026-02-01'
      expect(normalized[0].trueEffectiveDate).toBe('2026-02-01');
      // Brittany: MAX('2026-01-01', '2024-06-01') = '2026-01-01'
      expect(normalized[1].trueEffectiveDate).toBe('2026-01-01');
      // Jeremy: MAX('2026-01-01', '2026-01-01') = '2026-01-01'
      expect(normalized[2].trueEffectiveDate).toBe('2026-01-01');
    });

    it('handles missing optional fields as null', () => {
      const { normalized } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      // Brittany has no phone or email
      expect(normalized[1].memberPhone).toBeNull();
      expect(normalized[1].memberEmail).toBeNull();
    });

    it('sets rowNumber and display name', () => {
      const { normalized } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      expect(normalized[0].rowNumber).toBe(1);
      expect(normalized[0].name).toBe('U94753487 - row 1');
      expect(normalized[2].rowNumber).toBe(3);
      expect(normalized[2].name).toBe('U73500709 - row 3');
    });

    it('preserves rawPayload', () => {
      const { normalized } = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      expect(normalized[0].rawPayload['Broker Name']).toBe('Alexandria Marrero');
    });
  });

  describe('parity with legacy Ambetter parser', () => {
    // Fields that both parsers produce (the legacy parser has some extra fields
    // like exchangeSubscriberId that duplicate subscriberNumber — we check the
    // canonical set that matters for pipeline correctness)
    const PARITY_FIELDS = [
      'carrierPolicyNumber',
      'memberFirstName',
      'memberLastName',
      'memberDob',
      'brokerName',
      'brokerNpn',
      'brokerEffectiveDate',
      'policyEffectiveDate',
      'trueEffectiveDate',
      'paidThroughDate',
      'termDate',
      'eligibleForCommission',
      'planName',
      'memberPhone',
      'memberEmail',
      'monthlyPremium',
      'memberResponsibility',
      'numberOfMembers',
      'state',
      'county',
      'payableAgent',
      'subscriberNumber',
      'onOffExchange',
    ];

    it('produces identical field values for all 3 real BOB rows', () => {
      const legacy = parseAmbetterBob(REAL_ROWS, DEFAULT_AMBETTER_COLUMN_MAPPING);
      const generic = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      expect(legacy.normalized).toHaveLength(3);
      expect(generic.normalized).toHaveLength(3);

      for (let i = 0; i < 3; i++) {
        const legacyRow = legacy.normalized[i];
        const genericRow = generic.normalized[i];

        for (const field of PARITY_FIELDS) {
          expect({
            row: i,
            field,
            generic: genericRow[field],
          }).toEqual({
            row: i,
            field,
            generic: (legacyRow as Record<string, unknown>)[field] ?? null,
          });
        }
      }
    });

    it('produces identical rowNumber and name', () => {
      const legacy = parseAmbetterBob(REAL_ROWS, DEFAULT_AMBETTER_COLUMN_MAPPING);
      const generic = parseGenericBob(REAL_ROWS, AMBETTER_FIELD_CONFIG);

      for (let i = 0; i < 3; i++) {
        expect(generic.normalized[i].rowNumber).toBe(legacy.normalized[i].rowNumber);
        expect(generic.normalized[i].name).toBe(legacy.normalized[i].name);
      }
    });
  });
});
