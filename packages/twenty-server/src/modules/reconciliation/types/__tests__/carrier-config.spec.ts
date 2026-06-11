// OMNIA-CUSTOM: tests for the validated carrier-config boundary
// (remediation plan 4.2 — audit 2026-06-10 §"carrierConfig.matchingConfig
// cast to MatchingConfig wholesale", §"Status-engine thresholds are
// split-brained", §"Omnia onboarding date is baked in").

import { DEFAULT_MATCHING_CONFIG } from 'src/modules/reconciliation/engines/matching';
import { DEFAULT_STATUS_ENGINE_CONFIG } from 'src/modules/reconciliation/engines/status';
import {
  CarrierConfigValidationError,
  parseCarrierPipelineConfig,
} from 'src/modules/reconciliation/types/carrier-config';
import type { CarrierConfigRecord } from 'src/modules/reconciliation/types/reconciliation';

const baseRecord = (
  overrides: Partial<CarrierConfigRecord> = {},
): CarrierConfigRecord => ({
  id: 'carrier-config-id',
  name: 'Ambetter',
  parserVersion: null,
  fieldConfig: null,
  matchingConfig: null,
  statusConfig: null,
  carrierId: null,
  policyNumberPattern: null,
  columnMapping: null,
  productMapping: null,
  ...overrides,
});

describe('parseCarrierPipelineConfig', () => {
  describe('defaults (all-null record)', () => {
    it('falls back to full defaults and the legacy engine id', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(baseRecord(), {
        onWarning: (m) => warnings.push(m),
      });

      expect(config.matching).toEqual(DEFAULT_MATCHING_CONFIG);
      expect(config.status).toEqual(DEFAULT_STATUS_ENGINE_CONFIG);
      expect(config.statusEngineId).toBe('ambetter-bob-v1');
      expect(config.statusFieldMapping).toEqual({});
      expect(config.policyNumberPattern).toBeNull();
      expect(config.computedFields).toBeNull();
      expect(config.columnMapping).toBeNull();
      expect(config.productMapping).toBeNull();
      // Omnia/Ambetter onboarding date — the single remaining source.
      expect(config.startDate).toBe('2025-07-09');
      // Legacy fallback must be loudly deprecated.
      expect(warnings.join(' ')).toContain('deprecated');
    });
  });

  describe('matchingConfig partial merge', () => {
    it('merges a partial config over defaults (the audit crash case)', () => {
      // A stored config like { autoMatchThreshold: 90 } used to replace the
      // defaults wholesale, leaving enabledTiers undefined and crashing
      // matchRow with "Cannot read properties of undefined (reading
      // 'includes')" on the first row.
      const config = parseCarrierPipelineConfig(
        baseRecord({ matchingConfig: { autoMatchThreshold: 90 } }),
      );

      expect(config.matching.autoMatchThreshold).toBe(90);
      expect(config.matching.enabledTiers).toEqual(
        DEFAULT_MATCHING_CONFIG.enabledTiers,
      );
      expect(config.matching.tier7NameBands).toEqual(
        DEFAULT_MATCHING_CONFIG.tier7NameBands,
      );
    });

    it('throws an actionable error naming the bad key', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              enabledTiers: 'POLICY_NUMBER_SINGLE',
            } as never,
          }),
        ),
      ).toThrow(/matchingConfig\.enabledTiers/);
    });

    it('throws CarrierConfigValidationError with the config name', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ matchingConfig: { dateToleranceDays: '30' } as never }),
        ),
      ).toThrow(CarrierConfigValidationError);
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ matchingConfig: { dateToleranceDays: '30' } as never }),
        ),
      ).toThrow(
        /Invalid carrier config "Ambetter".*matchingConfig\.dateToleranceDays/,
      );
    });

    it('aggregates multiple problems into one error', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: { enabledTiers: 42 } as never,
            policyNumberPattern: '[',
          }),
        ),
      ).toThrow(/matchingConfig\.enabledTiers.*policyNumberPattern/s);
    });

    it('warns that legacy threshold keys on matchingConfig are ignored', () => {
      // placedThresholdDays/paymentErrorAgeDays moved to StatusConfig in
      // Phase 4.3 — old seeded configs still carry them in matchingConfig.
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { placedThresholdDays: 99 } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      // The legacy key must NOT leak into the resolved thresholds.
      expect(config.status.placedThresholdDays).toBe(
        DEFAULT_STATUS_ENGINE_CONFIG.placedThresholdDays,
      );
      expect(
        warnings.some(
          (w) =>
            w.includes('placedThresholdDays') && w.includes('statusConfig'),
        ),
      ).toBe(true);
    });
  });

  describe('startDate (Phase 4.4)', () => {
    it('explicit null disables the cutoff', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ matchingConfig: { startDate: null } }),
      );

      expect(config.startDate).toBeNull();
      expect(config.matching.startDate).toBeNull();
    });

    it('explicit value is honored and aliased to the top level', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ matchingConfig: { startDate: '2026-01-01' } }),
      );

      expect(config.startDate).toBe('2026-01-01');
      expect(config.matching.startDate).toBe('2026-01-01');
    });
  });

  describe('status thresholds (single home: statusConfig — Phase 4.3)', () => {
    it('reads thresholds from statusConfig, defaulting missing ones', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          statusConfig: { placedThresholdDays: 45 },
        }),
      );

      expect(config.status.placedThresholdDays).toBe(45);
      expect(config.status.paymentErrorAgeDays).toBe(
        DEFAULT_STATUS_ENGINE_CONFIG.paymentErrorAgeDays,
      );
    });

    it('throws naming the bad statusConfig key', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            statusConfig: { placedThresholdDays: 'thirty' } as never,
          }),
        ),
      ).toThrow(/statusConfig\.placedThresholdDays/);
    });

    it('exposes statusConfig.fieldMapping as statusFieldMapping', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          statusConfig: {
            fieldMapping: { effectiveDate: 'True Effective Date' },
          },
        }),
      );

      expect(config.statusFieldMapping).toEqual({
        effectiveDate: 'True Effective Date',
      });
    });
  });

  describe('status engine id resolution (Phase 4.3)', () => {
    it('statusConfig.engineId wins, with no deprecation warning', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          parserVersion: 'ambetter-bob-v1',
          statusConfig: { engineId: 'oscar-bob-v1' },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.statusEngineId).toBe('oscar-bob-v1');
      expect(warnings).toEqual([]);
    });

    it('falls back to parserVersion with a deprecation warning', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({ parserVersion: 'ambetter-bob-v1' }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.statusEngineId).toBe('ambetter-bob-v1');
      expect(warnings.join(' ')).toMatch(/parserVersion.*deprecated/s);
    });

    it('does NOT validate the id against the engine registry (callers do)', () => {
      // Unknown ids resolve here; loadMatchContext fail-fasts on them via
      // isKnownStatusEngine so the run dies at MATCH with a clear message.
      const config = parseCarrierPipelineConfig(
        baseRecord({ statusConfig: { engineId: 'not-a-real-engine' } }),
      );

      expect(config.statusEngineId).toBe('not-a-real-engine');
    });
  });

  describe('policyNumberPattern', () => {
    it('compiles a valid pattern case-insensitively', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ policyNumberPattern: '^U' }),
      );

      expect(config.policyNumberPattern).toBeInstanceOf(RegExp);
      expect(config.policyNumberPattern!.test('u94692964')).toBe(true);
      expect(config.policyNumberPattern!.test('X94692964')).toBe(false);
    });

    it('throws an actionable error for an invalid regex', () => {
      expect(() =>
        parseCarrierPipelineConfig(baseRecord({ policyNumberPattern: '[' })),
      ).toThrow(/policyNumberPattern.*"\[".*not a valid regular expression/s);
    });

    it('treats an empty pattern as no pattern', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ policyNumberPattern: '' }),
      );

      expect(config.policyNumberPattern).toBeNull();
    });
  });

  describe('computedFields (fieldConfig column)', () => {
    const validComputedField = {
      outputKey: 'True Effective Date',
      method: 'maxDate',
      inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
      type: 'date',
      crmField: 'effectiveDate',
    };

    it('passes valid definitions through', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ fieldConfig: [validComputedField] }),
      );

      expect(config.computedFields).toEqual([validComputedField]);
    });

    it('throws when fieldConfig is not an array', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: { oops: true } as never,
          }),
        ),
      ).toThrow(/fieldConfig \(computed-field definitions\)/);
    });

    it('throws naming the bad entry and key', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: [
              { ...validComputedField, outputKey: undefined },
            ] as never,
          }),
        ),
      ).toThrow(/fieldConfig \(computed-field definitions\)\.0\.outputKey/);
    });

    it('normalizes an empty array to null', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ fieldConfig: [] }),
      );

      expect(config.computedFields).toBeNull();
    });
  });

  describe('columnMapping (carrier-level prefill)', () => {
    it('passes the live ColumnMappingEntry shape through', () => {
      const mapping = {
        'Policy Number': {
          crmField: 'policyNumber',
          fieldType: 'TEXT',
          fieldKey: 'policyNumber',
        },
      };
      const config = parseCarrierPipelineConfig(
        baseRecord({ columnMapping: mapping }),
      );

      expect(config.columnMapping).toEqual(mapping);
    });

    it('downgrades the legacy alias-list seed shape to null with a warning (not a throw)', () => {
      // The seed still writes { name: ['Header', ...] } (item 4.6 owns the
      // fix). Runs never read the carrier-level mapping, so this must not
      // brick the pipeline.
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          columnMapping: {
            carrierPolicyNumber: ['Policy Number'],
          } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.columnMapping).toBeNull();
      expect(warnings.join(' ')).toContain('columnMapping');
    });
  });

  describe('productMapping', () => {
    it('passes valid entries through', () => {
      const mapping = [
        { pattern: 'bronze', productId: 'product-1', productName: 'Bronze' },
      ];
      const config = parseCarrierPipelineConfig(
        baseRecord({ productMapping: mapping }),
      );

      expect(config.productMapping).toEqual(mapping);
    });

    it('throws naming the bad key', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            productMapping: [{ pattern: 'bronze' }] as never,
          }),
        ),
      ).toThrow(/productMapping\.0\.productId/);
    });
  });

  describe('transformRules (Phase 4.8)', () => {
    it('defaults to {} (pure DEFAULT_TRANSFORM_RULES behavior) when absent', () => {
      expect(parseCarrierPipelineConfig(baseRecord()).transformRules).toEqual(
        {},
      );
    });

    it('passes validated partial rules through', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          transformRules: {
            dateFormats: ['DD/MM/YYYY'],
            booleanTrue: ['y'],
            booleanFalse: ['n'],
          },
        }),
      );

      expect(config.transformRules).toEqual({
        dateFormats: ['DD/MM/YYYY'],
        booleanTrue: ['y'],
        booleanFalse: ['n'],
      });
    });

    it('throws an actionable error naming the bad key', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            transformRules: { dateFormats: ['YYYY/DD/MM'] } as never,
          }),
        ),
      ).toThrow(CarrierConfigValidationError);
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            transformRules: { dateFormats: ['YYYY/DD/MM'] } as never,
          }),
        ),
      ).toThrow(/transformRules\.dateFormats/);
    });

    it('rejects empty vocabulary arrays (would disable the type wholesale)', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ transformRules: { booleanTrue: [] } }),
        ),
      ).toThrow(/transformRules\.booleanTrue/);
    });

    it('strips the legacy seed shape to {} (unknown keys ignored)', () => {
      // Pre-4.6 seeds wrote { dates, trueEffectiveDate, eligibleForCommission,
      // currency } — never read by anything. The boundary must not fail runs
      // on configs still carrying it.
      const config = parseCarrierPipelineConfig(
        baseRecord({
          transformRules: {
            dates: { format: ['MM/DD/YYYY'], excelSerial: true },
            currency: { stripSymbols: ['$', ','] },
          },
        }),
      );

      expect(config.transformRules).toEqual({});
    });
  });
});
