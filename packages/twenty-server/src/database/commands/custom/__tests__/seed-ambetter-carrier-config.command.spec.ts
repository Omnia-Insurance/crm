// OMNIA-CUSTOM: tests for the Ambetter carrier-config seed merge logic
// (remediation plan 4.6 — audit 2026-06-10 §"Seed writes legacy
// columnMapping shape ... re-running destroys the user-captured mapping").

import {
  AMBETTER_COLUMN_MAPPING,
  AMBETTER_COMPUTED_FIELDS,
  AMBETTER_STATUS_FIELD_MAPPING,
  AMBETTER_TRANSFORM_RULES,
  buildCarrierConfigUpdate,
  mergeColumnMapping,
  mergeStatusConfig,
  mergeTransformRules,
} from 'src/database/commands/custom/seed-ambetter-carrier-config.command';
import { DEFAULT_MATCHING_CONFIG } from 'src/modules/reconciliation/engines/matching';
import { parseCarrierPipelineConfig } from 'src/modules/reconciliation/types/carrier-config';
import type { CarrierConfigRecord } from 'src/modules/reconciliation/types/reconciliation';

describe('seed-ambetter-carrier-config merge logic', () => {
  describe('seeded data shape (4.6a)', () => {
    it('seeds columnMapping in the live ColumnMappingEntry shape', () => {
      for (const [header, entry] of Object.entries(AMBETTER_COLUMN_MAPPING)) {
        expect(typeof header).toBe('string');
        expect(entry).toMatchObject({
          crmField: expect.any(String),
          fieldType: expect.any(String),
          fieldKey: expect.any(String),
        });
      }

      // Spot-check the load-bearing entries
      expect(AMBETTER_COLUMN_MAPPING['Policy Number']).toEqual({
        crmField: 'policyNumber',
        fieldType: 'TEXT',
        fieldKey: 'policyNumber',
      });
      expect(AMBETTER_COLUMN_MAPPING['Insured First Name'].crmField).toBe(
        'lead.name.firstName',
      );
      expect(AMBETTER_COLUMN_MAPPING['Broker NPN'].crmField).toBe('agent.npn');
    });

    it('produces an update payload that passes the validated config boundary', () => {
      const { value } = buildCarrierConfigUpdate({});

      const record = {
        id: 'config-id',
        name: 'Ambetter',
        carrierId: null,
        ...value,
      } as unknown as CarrierConfigRecord;

      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(record, {
        onWarning: (m) => warnings.push(m),
      });

      expect(config.statusEngineId).toBe('ambetter-bob-v1');
      expect(config.columnMapping).toEqual(AMBETTER_COLUMN_MAPPING);
      expect(config.computedFields).toEqual(AMBETTER_COMPUTED_FIELDS);
      expect(config.statusFieldMapping).toEqual(AMBETTER_STATUS_FIELD_MAPPING);
      expect(config.transformRules).toEqual(AMBETTER_TRANSFORM_RULES);
      expect(config.policyNumberPattern?.test('U12345')).toBe(true);
      // No legacy-shape warnings — the seeded shapes are the live ones.
      expect(warnings).toEqual([]);
    });

    it('does not write the never-read statusRules/explanationRules columns (4.6c)', () => {
      const { value } = buildCarrierConfigUpdate({});

      expect(value).not.toHaveProperty('statusRules');
      expect(value).not.toHaveProperty('explanationRules');
      // transformRules is KEPT — 4.8 consumes it.
      expect(value).toHaveProperty('transformRules');
      expect(value.transformRules).toEqual(AMBETTER_TRANSFORM_RULES);
    });
  });

  describe('columnMapping merge (4.6b)', () => {
    it('never overwrites user-captured entries; fills missing headers only', () => {
      // User imported an underscore-format CSV: their capture has different
      // headers AND a divergent entry for a header the seed also knows.
      const userMapping = {
        policy_number: {
          crmField: 'policyNumber',
          fieldType: 'TEXT',
          fieldKey: 'policyNumber',
        },
        'Paid Through Date': {
          crmField: 'paidThroughDate',
          fieldType: 'DATE_TIME', // user-captured, differs from seed
          fieldKey: 'paidThroughDate',
        },
      };

      const { value, preserved } = mergeColumnMapping(userMapping);

      // User entries win verbatim
      expect(value.policy_number).toEqual(userMapping.policy_number);
      expect(value['Paid Through Date']).toEqual(
        userMapping['Paid Through Date'],
      );
      // Missing seed headers are filled in
      expect(value['Insured First Name']).toEqual(
        AMBETTER_COLUMN_MAPPING['Insured First Name'],
      );
      expect(preserved.join(' ')).toContain('user-captured');
    });

    it('replaces the legacy alias-list seed shape outright', () => {
      const legacy = {
        carrierPolicyNumber: ['Policy Number'],
        brokerName: ['Broker Name'],
      };

      const { value, preserved } = mergeColumnMapping(legacy);

      expect(value).toEqual(AMBETTER_COLUMN_MAPPING);
      expect(preserved.join(' ')).toContain('legacy alias-list');
    });

    it('seeds the full mapping when nothing exists', () => {
      expect(mergeColumnMapping(null).value).toEqual(AMBETTER_COLUMN_MAPPING);
      expect(mergeColumnMapping(undefined).value).toEqual(
        AMBETTER_COLUMN_MAPPING,
      );
      expect(mergeColumnMapping({}).value).toEqual(AMBETTER_COLUMN_MAPPING);
    });
  });

  describe('statusConfig merge (4.6b)', () => {
    it('never overwrites user-captured fieldMapping roles; fills missing roles only', () => {
      // The import dialog header-resolved paidThroughDate for an
      // underscore-format file. A re-run must not stomp it back to
      // title-case.
      const existing = {
        engineId: 'ambetter-bob-v1',
        fieldMapping: {
          paidThroughDate: 'paid_through_date',
          effectiveDate: 'True Effective Date',
        },
      };

      const { value, preserved } = mergeStatusConfig(existing);
      const fieldMapping = value.fieldMapping as Record<string, string>;

      expect(fieldMapping.paidThroughDate).toBe('paid_through_date');
      expect(fieldMapping.effectiveDate).toBe('True Effective Date');
      // Roles the user capture didn't include are filled from the seed
      expect(fieldMapping.termDate).toBe('Policy Term Date');
      expect(fieldMapping.brokerEffectiveDate).toBe('Broker Effective Date');
      expect(preserved.join(' ')).toContain('paidThroughDate');
    });

    it('preserves existing thresholds and engineId, filling missing keys', () => {
      const { value } = mergeStatusConfig({
        placedThresholdDays: 45,
        fieldMapping: {},
      });

      expect(value.placedThresholdDays).toBe(45);
      expect(value.paymentErrorAgeDays).toBe(10); // filled from defaults
      expect(value.engineId).toBe('ambetter-bob-v1'); // filled
    });

    it('seeds the full statusConfig when nothing exists', () => {
      const { value } = mergeStatusConfig(null);

      expect(value.engineId).toBe('ambetter-bob-v1');
      expect(value.fieldMapping).toEqual(AMBETTER_STATUS_FIELD_MAPPING);
    });
  });

  describe('transformRules merge (4.8)', () => {
    it('replaces the legacy { dates, currency } shape with the live vocabulary', () => {
      const legacy = {
        dates: { format: ['MM/DD/YYYY'], excelSerial: true },
        eligibleForCommission: { booleanMapping: { yes: true, no: false } },
        currency: { stripSymbols: ['$', ','] },
      };

      expect(mergeTransformRules(legacy).value).toEqual(
        AMBETTER_TRANSFORM_RULES,
      );
    });

    it('preserves recognized live-shape keys, filling the rest', () => {
      const { value, preserved } = mergeTransformRules({
        booleanTrue: ['y', 'yes'],
      });

      expect(value.booleanTrue).toEqual(['y', 'yes']);
      expect(value.dateFormats).toEqual(AMBETTER_TRANSFORM_RULES.dateFormats);
      expect(preserved.join(' ')).toContain('booleanTrue');
    });
  });

  describe('matchingConfig merge (4.6b)', () => {
    it('preserves admin-tuned knobs, filling missing keys from defaults', () => {
      const { value, preserved } = buildCarrierConfigUpdate({
        matchingConfig: { autoMatchThreshold: 99 },
      });
      const matching = value.matchingConfig as Record<string, unknown>;

      expect(matching.autoMatchThreshold).toBe(99);
      expect(matching.dateToleranceDays).toBe(
        DEFAULT_MATCHING_CONFIG.dateToleranceDays,
      );
      expect(preserved.join(' ')).toContain('autoMatchThreshold');
    });
  });
});
