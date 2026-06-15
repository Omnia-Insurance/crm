// OMNIA-CUSTOM: tests for the validated carrier-config boundary
// (remediation plan 4.2 — audit 2026-06-10 §"carrierConfig.matchingConfig
// cast to MatchingConfig wholesale", §"Status-engine thresholds are
// split-brained", §"Omnia onboarding date is baked in").

import { DEFAULT_DIFF_POLICY } from 'src/modules/reconciliation/engines/diff';
import {
  DEFAULT_MATCHING_CONFIG,
  MATCH_TIER_IDS,
} from 'src/modules/reconciliation/engines/matching';
import { DEFAULT_STATUS_ENGINE_CONFIG } from 'src/modules/reconciliation/engines/status';
import {
  CarrierConfigValidationError,
  parseCarrierPipelineConfig,
} from 'src/modules/reconciliation/types/carrier-config';
import {
  ACTIVE_CRM_STATUSES,
  DEFAULT_STATUS_VOCABULARY,
  NEGATIVE_TERMINAL_STATUSES,
} from 'src/modules/reconciliation/types/policy-statuses';
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

  describe('statusConfig.engineParams (per-engine params channel)', () => {
    it('surfaces engineParams raw — engine-schema validation is deferred to callers', () => {
      // Same deliberate layering as statusEngineId: this file never imports
      // the engine registry, so the contents are validated by
      // validateStatusEngineParams at the parse/match fail-fast points.
      const config = parseCarrierPipelineConfig(
        baseRecord({
          statusConfig: {
            engineId: 'ambetter-bob-v1',
            engineParams: { placedThresholdDays: 5, anythingGoesHere: true },
          },
        }),
      );

      expect(config.engineParams).toEqual({
        placedThresholdDays: 5,
        anythingGoesHere: true,
      });
    });

    it('defaults to null when absent (legacy configs untouched)', () => {
      expect(parseCarrierPipelineConfig(baseRecord()).engineParams).toBeNull();
      expect(
        parseCarrierPipelineConfig(
          baseRecord({ statusConfig: { engineId: 'ambetter-bob-v1' } }),
        ).engineParams,
      ).toBeNull();
    });

    it('throws an actionable error when engineParams is not a JSON object', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            statusConfig: { engineParams: 'placedThresholdDays=5' } as never,
          }),
        ),
      ).toThrow(/statusConfig\.engineParams/);
    });
  });

  describe('status engine id resolution (Phase 4.3)', () => {
    it('statusConfig.engineId wins, with no deprecation warning', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          parserVersion: 'ambetter-bob-v1',
          // Explicit startDate so the inheritance warning stays out of the
          // way — this test pins the absence of engine-id warnings only.
          matchingConfig: { startDate: null },
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

  describe('enabledTiers canonical tier-id validation (OMN-10)', () => {
    it('accepts canonical tier ids', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            enabledTiers: ['OVERRIDE', 'NAME_DOB_DATE'],
            startDate: null,
          },
        }),
      );

      expect(config.matching.enabledTiers).toEqual([
        'OVERRIDE',
        'NAME_DOB_DATE',
      ]);
    });

    it("hard-fails a typo'd tier id, naming the bad entry and listing valid ids", () => {
      const callWithTypo = () =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              enabledTiers: ['OVERRIDE', 'POLICY_NUMBER_DATE_AGNET'],
            } as never,
          }),
        );

      expect(callWithTypo).toThrow(CarrierConfigValidationError);
      expect(callWithTypo).toThrow(
        /matchingConfig\.enabledTiers\.1: unknown match tier "POLICY_NUMBER_DATE_AGNET"/,
      );
      // The full valid-id vocabulary is in the message.
      expect(callWithTypo).toThrow(new RegExp(MATCH_TIER_IDS.join(', ')));
    });

    it('hard-fails a MatchMethod name pasted where a tier id belongs', () => {
      // 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE' is the tier-3 METHOD name; the
      // tier id is 'POLICY_NUMBER_DATE' — the audit's exact trap.
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              enabledTiers: ['POLICY_NUMBER_PLUS_EFFECTIVE_DATE'],
            } as never,
          }),
        ),
      ).toThrow(/unknown match tier "POLICY_NUMBER_PLUS_EFFECTIVE_DATE"/);
    });

    it('the seeded Ambetter tier list (full defaults) is bit-for-bit canonical', () => {
      // The Ambetter seed writes DEFAULT_MATCHING_CONFIG wholesale, so its
      // enabledTiers ARE set — and must always be the canonical ids.
      expect(DEFAULT_MATCHING_CONFIG.enabledTiers).toEqual([...MATCH_TIER_IDS]);
    });
  });

  describe('startDate inheritance warning (OMN-10)', () => {
    const parseCollectingWarnings = (
      overrides: Parameters<typeof baseRecord>[0],
    ): string[] => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(baseRecord(overrides), {
        onWarning: (m) => warnings.push(m),
      });

      return warnings.filter((w) => w.includes('matchingConfig.startDate'));
    };

    it('warns when matchingConfig is missing entirely', () => {
      const warnings = parseCollectingWarnings({ matchingConfig: null });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('matchingConfig.startDate not set');
      expect(warnings[0]).toContain('2025-07-09');
      expect(warnings[0]).toContain('null = no cutoff');
    });

    it('warns when matchingConfig lacks the startDate key', () => {
      const warnings = parseCollectingWarnings({
        matchingConfig: { autoMatchThreshold: 90 },
      });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(
        'inheriting the Ambetter/Omnia onboarding default',
      );
    });

    it('does not warn for an explicit null (no cutoff)', () => {
      expect(
        parseCollectingWarnings({ matchingConfig: { startDate: null } }),
      ).toEqual([]);
    });

    it('does not warn for an explicit date', () => {
      expect(
        parseCollectingWarnings({
          matchingConfig: { startDate: '2026-01-01' },
        }),
      ).toEqual([]);
    });
  });

  describe('unknown-key warnings (OMN-10 honesty pass)', () => {
    it('warns per misspelled matchingConfig knob and falls back to the default', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { autoMatchTreshold: 99, startDate: null } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      // The typo'd knob is stripped — defaults stay in effect…
      expect(config.matching.autoMatchThreshold).toBe(
        DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
      );
      // …but no longer silently: the warning names the key and lists the
      // recognized vocabulary (which contains the intended spelling).
      const unknownKeyWarnings = warnings.filter((w) =>
        w.includes('matchingConfig.autoMatchTreshold is not a recognized key'),
      );

      expect(unknownKeyWarnings).toHaveLength(1);
      expect(unknownKeyWarnings[0]).toContain('autoMatchThreshold');
    });

    it('does not double-warn the legacy threshold keys (dedicated warning)', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { placedThresholdDays: 99, startDate: null } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(
        warnings.filter((w) => w.includes('placedThresholdDays')),
      ).toHaveLength(1);
    });

    it('warns on unknown statusConfig keys', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { startDate: null },
          statusConfig: { engineid: 'ambetter-bob-v1' } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      const unknownKeyWarnings = warnings.filter((w) =>
        w.includes('statusConfig.engineid is not a recognized key'),
      );

      expect(unknownKeyWarnings).toHaveLength(1);
      expect(unknownKeyWarnings[0]).toContain('engineId');
    });

    it('warns on the legacy transformRules seed shape (still parses to {})', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { startDate: null },
          transformRules: {
            dates: { format: ['MM/DD/YYYY'] },
            currency: { stripSymbols: ['$'] },
          },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.transformRules).toEqual({});
      expect(warnings.some((w) => w.includes('transformRules.dates'))).toBe(
        true,
      );
      expect(warnings.some((w) => w.includes('transformRules.currency'))).toBe(
        true,
      );
    });

    it('warns on unknown keys inside computed-field defs and nested tierTuning levels', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            startDate: null,
            tierTuning: {
              bogusKnob: true,
              tierConfidences: { POLICY_NUMBER_SINGLE: 50, NOT_A_TIER: 1 },
            },
          } as never,
          fieldConfig: [
            {
              outputKey: 'True Effective Date',
              method: 'maxDate',
              inputs: ['brokerEffectiveDate'],
              type: 'date',
              extraneous: 'oops',
            },
          ],
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(
        warnings.some((w) => w.includes('matchingConfig.tierTuning.bogusKnob')),
      ).toBe(true);
      expect(
        warnings.some((w) =>
          w.includes('matchingConfig.tierTuning.tierConfidences.NOT_A_TIER'),
        ),
      ).toBe(true);
      expect(warnings.some((w) => w.includes('fieldConfig.0.extraneous'))).toBe(
        true,
      );
    });
  });

  describe('computed-field method validation (OMN-10)', () => {
    it("hard-fails a typo'd method, naming it and listing the known methods", () => {
      const callWithTypo = () =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: [
              {
                outputKey: 'True Effective Date',
                method: 'maxdate',
                inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
                type: 'date',
              },
            ],
          }),
        );

      expect(callWithTypo).toThrow(CarrierConfigValidationError);
      expect(callWithTypo).toThrow(
        /fieldConfig \(computed-field definitions\)\.0\.method: unknown computed-field method "maxdate"/,
      );
      expect(callWithTypo).toThrow(/maxDate, minDate, coalesce/);
    });

    it('accepts every registered method', () => {
      for (const method of ['maxDate', 'minDate', 'coalesce']) {
        expect(() =>
          parseCarrierPipelineConfig(
            baseRecord({
              fieldConfig: [
                { outputKey: 'X', method, inputs: ['a'], type: 'date' },
              ],
            }),
          ),
        ).not.toThrow();
      }
    });
  });

  describe('dead knobs (OMN-10)', () => {
    it('ignores stored statusConfig.paymentErrorAgeDays and warns when the operator changed it', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { startDate: null },
          statusConfig: { paymentErrorAgeDays: 99 } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      // The stored value no longer merges — the surface stays pinned to the
      // code default (nothing reads it anyway).
      expect(config.status.paymentErrorAgeDays).toBe(
        DEFAULT_STATUS_ENGINE_CONFIG.paymentErrorAgeDays,
      );
      expect(
        warnings.some((w) =>
          w.includes(
            'statusConfig.paymentErrorAgeDays is not read by any engine; ' +
              'use statusConfig.engineParams for engine-specific knobs',
          ),
        ),
      ).toBe(true);
    });

    it('stays silent when paymentErrorAgeDays sits at the seed default (seed hygiene, not operator intent)', () => {
      // The Ambetter + generic seeds spread DEFAULT_STATUS_ENGINE_CONFIG
      // wholesale, so presence-at-default must not warn on every run.
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { startDate: null },
          statusConfig: {
            paymentErrorAgeDays:
              DEFAULT_STATUS_ENGINE_CONFIG.paymentErrorAgeDays,
          } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(warnings.filter((w) => w.includes('paymentErrorAgeDays'))).toEqual(
        [],
      );
    });

    it('matchingConfig.paymentErrorAgeDays (legacy home) now points at engineParams', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { paymentErrorAgeDays: 5, startDate: null } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      const legacyWarnings = warnings.filter((w) =>
        w.includes('matchingConfig.paymentErrorAgeDays'),
      );

      expect(legacyWarnings).toHaveLength(1);
      expect(legacyWarnings[0]).toContain('not read by any engine');
      expect(legacyWarnings[0]).toContain('engineParams');
    });

    it('accepts a flipped enableMissingFromBob silently — the knob is live now (OMN-12)', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { enableMissingFromBob: true, startDate: null },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.matching.enableMissingFromBob).toBe(true);
      expect(
        warnings.filter((w) => w.includes('enableMissingFromBob')),
      ).toEqual([]);
    });

    it('accepts enableDiscovery and merges it over the false default (OMN-12)', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { enableDiscovery: true, startDate: null },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.matching.enableDiscovery).toBe(true);
      expect(warnings.filter((w) => w.includes('enableDiscovery'))).toEqual(
        [],
      );
      expect(
        parseCarrierPipelineConfig(baseRecord()).matching.enableDiscovery,
      ).toBe(false);
    });

    it('accepts tuned discovery thresholds silently — the knobs are live now (OMN-12)', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: { discoveryNameThreshold: 0.5, startDate: null },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.matching.discoveryNameThreshold).toBe(0.5);
      expect(
        warnings.filter((w) => w.includes('discoveryNameThreshold')),
      ).toEqual([]);
    });

    it('hard-fails discovery thresholds outside the 0-1 name-similarity scale', () => {
      const callWithConfidenceScale = () =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: { discoveryNameThreshold: 95, startDate: null },
          }),
        );

      expect(callWithConfidenceScale).toThrow(CarrierConfigValidationError);
      expect(callWithConfidenceScale).toThrow(
        /matchingConfig\.discoveryNameThreshold.*0–1.*not 0–100/,
      );

      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: { discoveryAutoThreshold: -0.5, startDate: null },
          }),
        ),
      ).toThrow(/matchingConfig\.discoveryAutoThreshold/);
    });

    it('warns when discoveryAutoThreshold undercuts discoveryNameThreshold with discovery enabled', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            enableDiscovery: true,
            discoveryNameThreshold: 0.95,
            discoveryAutoThreshold: 0.9,
            startDate: null,
          },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(
        warnings.some(
          (w) =>
            w.includes('discoveryAutoThreshold') &&
            w.includes('below discoveryNameThreshold'),
        ),
      ).toBe(true);

      // Same inversion with discovery OFF is inert config — no warning.
      const offWarnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            discoveryNameThreshold: 0.95,
            discoveryAutoThreshold: 0.9,
            startDate: null,
          },
        }),
        { onWarning: (m) => offWarnings.push(m) },
      );

      expect(
        offWarnings.filter((w) => w.includes('discoveryAutoThreshold')),
      ).toEqual([]);
    });

    it('stays silent when the discovery knobs sit at their defaults (seeds spread them)', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            enableMissingFromBob: DEFAULT_MATCHING_CONFIG.enableMissingFromBob,
            enableDiscovery: DEFAULT_MATCHING_CONFIG.enableDiscovery,
            discoveryNameThreshold:
              DEFAULT_MATCHING_CONFIG.discoveryNameThreshold,
            discoveryAutoThreshold:
              DEFAULT_MATCHING_CONFIG.discoveryAutoThreshold,
            startDate: null,
          },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(
        warnings.filter(
          (w) =>
            w.includes('enableMissingFromBob') ||
            w.includes('enableDiscovery') ||
            w.includes('discoveryNameThreshold') ||
            w.includes('discoveryAutoThreshold'),
        ),
      ).toEqual([]);
    });
  });

  describe('matchingConfig.tierTuning (OMN-12)', () => {
    it("defaults to {} — today's constants", () => {
      expect(
        parseCarrierPipelineConfig(baseRecord()).matching.tierTuning,
      ).toEqual({});
    });

    it('passes a validated partial tierTuning through', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            startDate: null,
            tierTuning: {
              tierConfidences: { POLICY_NUMBER_SINGLE: 50 },
              tier6Weights: { agentMatch: 0 },
              dateProximityBands: [
                { maxDays: 0, score: 1 },
                { maxDays: 10, score: 0.5 },
              ],
              dateProximityFloor: 0,
            },
          },
        }),
      );

      expect(config.matching.tierTuning).toEqual({
        tierConfidences: { POLICY_NUMBER_SINGLE: 50 },
        tier6Weights: { agentMatch: 0 },
        dateProximityBands: [
          { maxDays: 0, score: 1 },
          { maxDays: 10, score: 0.5 },
        ],
        dateProximityFloor: 0,
      });
    });

    it('throws naming the bad tierTuning key', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              tierTuning: {
                tierConfidences: { POLICY_NUMBER_SINGLE: 'high' },
              },
              startDate: null,
            } as never,
          }),
        ),
      ).toThrow(
        /matchingConfig\.tierTuning\.tierConfidences\.POLICY_NUMBER_SINGLE/,
      );
    });

    it('rejects an empty dateProximityBands table', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              tierTuning: { dateProximityBands: [] },
              startDate: null,
            },
          }),
        ),
      ).toThrow(/matchingConfig\.tierTuning\.dateProximityBands/);
    });

    it('rejects a negative band maxDays', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              tierTuning: {
                dateProximityBands: [{ maxDays: -1, score: 0.5 }],
              },
              startDate: null,
            },
          }),
        ),
      ).toThrow(/matchingConfig\.tierTuning\.dateProximityBands\.0\.maxDays/);
    });
  });
});

// ---------------------------------------------------------------------------
// OMN-12 parse vocabulary: dateFormats token grammar, parseSettings,
// computed-field params
// ---------------------------------------------------------------------------

describe('parseCarrierPipelineConfig — OMN-12 parse vocabulary', () => {
  describe('transformRules.dateFormats token grammar', () => {
    it('accepts every supported token', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          transformRules: {
            dateFormats: [
              'MM/DD/YYYY',
              'DD/MM/YYYY',
              'YYYY-MM-DD',
              'YYYY/MM/DD',
              'MM-DD-YYYY',
              'DD-MM-YYYY',
              'MMM D YYYY',
              'D MMM YYYY',
            ],
          },
        }),
      );

      expect(config.transformRules.dateFormats).toHaveLength(8);
    });

    it('hard-fails an unknown token, naming it and listing supported tokens', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            transformRules: { dateFormats: ['MM/DD/YYYY', 'YYYY.MM.DD'] },
          }),
        ),
      ).toThrow(
        /transformRules\.dateFormats\.1: unknown date format token "YYYY\.MM\.DD" — supported tokens: MM\/DD\/YYYY/,
      );
    });
  });

  describe('parseSettings', () => {
    it('defaults to {} (pure DEFAULT_PARSE_SETTINGS behavior) when absent', () => {
      expect(parseCarrierPipelineConfig(baseRecord()).parseSettings).toEqual(
        {},
      );
    });

    it('passes validated settings through', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          parseSettings: {
            headerRow: 3,
            skipFooterRows: 2,
            rowFilters: [
              {
                column: 'Policy Number',
                op: 'matches',
                value: '^(Total|Subtotal)',
                action: 'skip',
              },
              { column: 'Policy Number', op: 'empty', action: 'skip' },
            ],
          },
        }),
      );

      expect(config.parseSettings.headerRow).toBe(3);
      expect(config.parseSettings.skipFooterRows).toBe(2);
      expect(config.parseSettings.rowFilters).toHaveLength(2);
    });

    it('rejects a headerRow below 1 (1-based) and non-integers', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ parseSettings: { headerRow: 0 } }),
        ),
      ).toThrow(/parseSettings\.headerRow/);

      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ parseSettings: { headerRow: 2.5 } }),
        ),
      ).toThrow(/parseSettings\.headerRow/);
    });

    it('rejects a negative skipFooterRows', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ parseSettings: { skipFooterRows: -1 } }),
        ),
      ).toThrow(/parseSettings\.skipFooterRows/);
    });

    it('hard-fails an unknown row-filter op, listing the vocabulary', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            parseSettings: {
              rowFilters: [
                { column: 'A', op: 'equalz', value: 'x', action: 'skip' },
              ],
            },
          }),
        ),
      ).toThrow(
        /parseSettings\.rowFilters\.0\.op: unknown row-filter op "equalz" — known ops: empty, notEmpty, equals, contains, startsWith, matches/,
      );
    });

    it('hard-fails an action other than "skip"', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            parseSettings: {
              rowFilters: [{ column: 'A', op: 'empty', action: 'drop' }],
            },
          }),
        ),
      ).toThrow(/parseSettings\.rowFilters\.0\.action/);
    });

    it('hard-fails per-op value misuse (missing for equals, present for empty)', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            parseSettings: {
              rowFilters: [{ column: 'A', op: 'equals', action: 'skip' }],
            },
          }),
        ),
      ).toThrow(
        /parseSettings\.rowFilters\.0: op "equals" requires a non-empty string "value"/,
      );

      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            parseSettings: {
              rowFilters: [
                { column: 'A', op: 'notEmpty', value: 'x', action: 'skip' },
              ],
            },
          }),
        ),
      ).toThrow(/parseSettings\.rowFilters\.0: op "notEmpty" takes no "value"/);
    });

    it('hard-fails an uncompilable matches regex (compile-once fail-fast)', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            parseSettings: {
              rowFilters: [
                {
                  column: 'A',
                  op: 'matches',
                  value: '(unclosed',
                  action: 'skip',
                },
              ],
            },
          }),
        ),
      ).toThrow(
        /parseSettings\.rowFilters\.0: value "\(unclosed" is not a valid regular expression/,
      );
    });

    it('warns on unknown parseSettings keys and unknown rule keys (honesty pass)', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          parseSettings: {
            headerRows: 3, // typo'd knob
            rowFilters: [
              {
                column: 'A',
                op: 'empty',
                action: 'skip',
                pattern: '^Total', // typo'd rule key
              },
            ],
          },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'parseSettings.headerRows is not a recognized key',
          ),
          expect.stringContaining(
            'parseSettings.rowFilters.0.pattern is not a recognized key',
          ),
        ]),
      );
    });
  });

  describe('computed-field params validation (OMN-12)', () => {
    it('accepts every new method with valid params', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          fieldConfig: [
            {
              outputKey: 'Full Name',
              method: 'concat',
              inputs: ['First Name', 'Last Name'],
              params: { separator: ' ' },
              type: 'text',
            },
            {
              outputKey: 'Best Date',
              method: 'firstNonEmpty',
              inputs: ['A', 'B'],
              type: 'date',
            },
            {
              outputKey: 'Effective Source',
              method: 'conditional',
              inputs: ['A', 'B'],
              params: {
                if: { column: 'Status', op: 'equals', value: 'active' },
                then: '$1',
                else: '$2',
              },
              type: 'date',
            },
            {
              outputKey: 'Monthly',
              method: 'arithmetic',
              inputs: ['Annual'],
              params: { expr: '$1 / 12' },
              type: 'number',
            },
          ],
        }),
      );

      expect(config.computedFields).toHaveLength(4);
    });

    it('hard-fails params on a param-less method, naming the entry', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: [
              {
                outputKey: 'X',
                method: 'maxDate',
                inputs: ['A'],
                params: { separator: ' ' },
                type: 'date',
              },
            ],
          }),
        ),
      ).toThrow(
        /fieldConfig \(computed-field definitions\)\.0\.params: method "maxDate" takes no params/,
      );
    });

    it('hard-fails a bad conditional op with the full vocabulary', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: [
              {
                outputKey: 'X',
                method: 'conditional',
                inputs: ['A'],
                params: {
                  if: { column: 'S', op: 'equalz', value: 'x' },
                  then: '$1',
                  else: null,
                },
                type: 'text',
              },
            ],
          }),
        ),
      ).toThrow(
        /fieldConfig \(computed-field definitions\)\.0\.params\.if\.op "equalz" is not a recognized op/,
      );
    });

    it('hard-fails an unsafe or out-of-range arithmetic expr', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: [
              {
                outputKey: 'X',
                method: 'arithmetic',
                inputs: ['A'],
                params: { expr: 'require("fs")' },
                type: 'number',
              },
            ],
          }),
        ),
      ).toThrow(/identifiers\/functions are not allowed/);

      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: [
              {
                outputKey: 'X',
                method: 'arithmetic',
                inputs: ['A'],
                params: { expr: '$1 + $2' },
                type: 'number',
              },
            ],
          }),
        ),
      ).toThrow(/references input \$2 but only 1 input\(s\) are declared/);
    });

    it("still hard-fails a typo'd method (params are not even inspected)", () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            fieldConfig: [
              {
                outputKey: 'X',
                method: 'concatenate',
                inputs: ['A'],
                params: { separator: ' ' },
                type: 'text',
              },
            ],
          }),
        ),
      ).toThrow(/unknown computed-field method "concatenate"/);
    });
  });
});

describe('parseCarrierPipelineConfig — OMN-12 tuning depth', () => {
  describe('diffConfig (per-carrier diff suppression policy)', () => {
    it("defaults to DEFAULT_DIFF_POLICY when absent — today's hardcoded guards", () => {
      const config = parseCarrierPipelineConfig(baseRecord());

      expect(config.diffPolicy).toEqual(DEFAULT_DIFF_POLICY);
      expect(config.diffPolicy).toMatchObject({
        suppressAgentFields: true,
        suppressPremiumDiffs: true,
        suppressBackwardsEffectiveDate: true,
        suppressAcaRolloverEffectiveDate: true,
        suppressNegativeToNegativeStatus: true,
      });
      expect(config.diffPolicy.leadIdentityFields).toContain(
        'lead.name.firstName',
      );
    });

    it('an empty diffConfig object is bit-for-bit the defaults', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ diffConfig: {} }),
      );

      expect(config.diffPolicy).toEqual(DEFAULT_DIFF_POLICY);
    });

    it('merges a partial diffConfig over defaults', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({ diffConfig: { suppressAgentFields: false } }),
      );

      expect(config.diffPolicy.suppressAgentFields).toBe(false);
      expect(config.diffPolicy.suppressPremiumDiffs).toBe(true);
      expect(config.diffPolicy.leadIdentityFields).toEqual(
        DEFAULT_DIFF_POLICY.leadIdentityFields,
      );
    });

    it('accepts a custom leadIdentityFields list', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          diffConfig: { leadIdentityFields: ['lead.dateOfBirth'] },
        }),
      );

      expect(config.diffPolicy.leadIdentityFields).toEqual([
        'lead.dateOfBirth',
      ]);
    });

    it('throws an actionable error naming a mistyped knob', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ diffConfig: { suppressAgentFields: 'no' } }),
        ),
      ).toThrow(CarrierConfigValidationError);
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ diffConfig: { suppressAgentFields: 'no' } }),
        ),
      ).toThrow(/diffConfig\.suppressAgentFields/);
    });

    it('rejects an empty leadIdentityFields list (would silently disable the safety net)', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({ diffConfig: { leadIdentityFields: [] } }),
        ),
      ).toThrow(/diffConfig\.leadIdentityFields/);
    });

    it('rejects empty-string crmField paths in leadIdentityFields', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            diffConfig: { leadIdentityFields: ['lead.dateOfBirth', ''] },
          }),
        ),
      ).toThrow(/diffConfig\.leadIdentityFields/);
    });

    it('warns per unknown diffConfig key and falls back to the default', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({ diffConfig: { suppressAgent: false } }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.diffPolicy.suppressAgentFields).toBe(true);
      expect(
        warnings.some(
          (w) =>
            w.includes('diffConfig.suppressAgent') &&
            w.includes('not a recognized key'),
        ),
      ).toBe(true);
    });
  });

  describe('statusVocabulary (terminal/active status sets)', () => {
    it("defaults to the shared policy-status sets when absent — today's behavior", () => {
      const config = parseCarrierPipelineConfig(baseRecord());

      expect(config.statusVocabulary).toEqual(DEFAULT_STATUS_VOCABULARY);
      expect(config.statusVocabulary.negativeTerminalStatuses).toEqual([
        ...NEGATIVE_TERMINAL_STATUSES,
      ]);
      expect(config.statusVocabulary.activeStatuses).toEqual([
        ...ACTIVE_CRM_STATUSES,
      ]);
    });

    it('merges a partial vocabulary over defaults', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          statusVocabulary: {
            negativeTerminalStatuses: ['CANCELED', 'DECLINED'],
          },
        }),
      );

      expect(config.statusVocabulary.negativeTerminalStatuses).toEqual([
        'CANCELED',
        'DECLINED',
      ]);
      expect(config.statusVocabulary.activeStatuses).toEqual([
        ...ACTIVE_CRM_STATUSES,
      ]);
    });

    it('warns — does NOT fail — on a status outside the known vocabulary (workspace SELECT additions)', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          statusVocabulary: {
            negativeTerminalStatuses: ['CANCELED', 'GRACE_PERIOD'],
          },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      // The unknown status is kept — the knob exists precisely so
      // workspace-added SELECT options can participate.
      expect(config.statusVocabulary.negativeTerminalStatuses).toContain(
        'GRACE_PERIOD',
      );
      expect(
        warnings.some(
          (w) =>
            w.includes('statusVocabulary.negativeTerminalStatuses') &&
            w.includes('"GRACE_PERIOD"'),
        ),
      ).toBe(true);
    });

    it('does not warn when every listed status is known', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          statusVocabulary: {
            negativeTerminalStatuses: [...NEGATIVE_TERMINAL_STATUSES],
          },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(
        warnings.some((w) => w.includes('outside the known policy-status')),
      ).toBe(false);
    });

    it('rejects an empty status list (would disable terminal classification wholesale)', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            statusVocabulary: { negativeTerminalStatuses: [] },
          }),
        ),
      ).toThrow(/statusVocabulary\.negativeTerminalStatuses/);
    });

    it('rejects empty-string statuses', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            statusVocabulary: { negativeTerminalStatuses: ['CANCELED', ''] },
          }),
        ),
      ).toThrow(/statusVocabulary\.negativeTerminalStatuses/);
    });

    it("warns on unknown statusVocabulary keys (e.g. the audit proposal's old 'terminalStatuses' spelling)", () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          statusVocabulary: { terminalStatuses: ['CANCELED'] },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.statusVocabulary).toEqual(DEFAULT_STATUS_VOCABULARY);
      expect(
        warnings.some((w) =>
          w.includes('statusVocabulary.terminalStatuses'),
        ),
      ).toBe(true);
    });

    it('accepts a reshaped activeStatuses without a dead-knob warning — missing-from-BOB consumes it (OMN-12)', () => {
      const warnings: string[] = [];
      const config = parseCarrierPipelineConfig(
        baseRecord({
          statusVocabulary: { activeStatuses: ['ACTIVE', 'GRACE_PERIOD'] },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(config.statusVocabulary.activeStatuses).toEqual([
        'ACTIVE',
        'GRACE_PERIOD',
      ]);
      // The unknown-status typo warning still fires for GRACE_PERIOD…
      expect(
        warnings.some(
          (w) => w.includes('activeStatuses') && w.includes('GRACE_PERIOD'),
        ),
      ).toBe(true);
      // …but the former "accepted but not yet read" dead-knob warning is gone.
      expect(warnings.some((w) => w.includes('not yet read'))).toBe(false);
    });

    it('stays silent on activeStatuses restating the default', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          statusVocabulary: { activeStatuses: [...ACTIVE_CRM_STATUSES] },
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(warnings.some((w) => w.includes('activeStatuses'))).toBe(false);
    });
  });
});

describe('parseCarrierPipelineConfig — OMN-12 identity + post-match strategies', () => {
  describe('matchingConfig.identifierRoles', () => {
    it('merges a valid role → snapshot-path map over the empty default', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            identifierRoles: {
              memberId: 'applicationId',
              groupNumber: 'planIdentifier',
            },
          },
        }),
      );

      expect(config.matching.identifierRoles).toEqual({
        memberId: 'applicationId',
        groupNumber: 'planIdentifier',
      });
      // Untouched siblings keep their defaults.
      expect(config.matching.dedupStrategy).toBe('keepNewestEffectiveDate');
    });

    it('defaults to {} (policy-number-only identity) when unset', () => {
      const config = parseCarrierPipelineConfig(baseRecord());

      expect(config.matching.identifierRoles).toEqual({});
    });

    it('fails fast on a CRM path that is not a snapshot field, listing the valid paths', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              identifierRoles: { memberId: 'policy.memberNumber' },
            } as never,
          }),
        ),
      ).toThrow(
        /identifierRoles\.memberId.*unknown identifier CRM field "policy\.memberNumber".*applicationId, planIdentifier, externalPolicyId/s,
      );
    });

    it('warns on unknown keys inside identifierRoles (honesty pass)', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            identifierRoles: { memberID: 'applicationId' },
          } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(
        warnings.some(
          (w) =>
            w.includes('matchingConfig.identifierRoles.memberID') &&
            w.includes('not a recognized key'),
        ),
      ).toBe(true);
    });
  });

  describe('matchingConfig.identifierNormalization', () => {
    it('merges valid knobs and defaults to {} (no-ops)', () => {
      expect(
        parseCarrierPipelineConfig(baseRecord()).matching
          .identifierNormalization,
      ).toEqual({});

      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            identifierNormalization: {
              stripLeadingZeros: true,
              stripPrefix: 'ABC',
              stripSuffixPattern: '-\\d+$',
            },
          },
        }),
      );

      expect(config.matching.identifierNormalization).toEqual({
        stripLeadingZeros: true,
        stripPrefix: 'ABC',
        stripSuffixPattern: '-\\d+$',
      });
    });

    it('fails fast when stripSuffixPattern is not a compilable regex', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              identifierNormalization: { stripSuffixPattern: '[unclosed' },
            },
          }),
        ),
      ).toThrow(
        /identifierNormalization\.stripSuffixPattern.*not a valid regular expression/s,
      );
    });

    it('warns on unknown keys inside identifierNormalization (honesty pass)', () => {
      const warnings: string[] = [];

      parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            identifierNormalization: { stripLeadingZeroes: true },
          } as never,
        }),
        { onWarning: (m) => warnings.push(m) },
      );

      expect(
        warnings.some(
          (w) =>
            w.includes(
              'matchingConfig.identifierNormalization.stripLeadingZeroes',
            ) && w.includes('not a recognized key'),
        ),
      ).toBe(true);
    });
  });

  describe('matchingConfig.dedupStrategy', () => {
    it('accepts each canonical strategy and defaults to keepNewestEffectiveDate', () => {
      expect(
        parseCarrierPipelineConfig(baseRecord()).matching.dedupStrategy,
      ).toBe('keepNewestEffectiveDate');

      for (const strategy of [
        'keepNewestEffectiveDate',
        'keepAll',
        'keepFirst',
      ]) {
        expect(
          parseCarrierPipelineConfig(
            baseRecord({
              matchingConfig: { dedupStrategy: strategy } as never,
            }),
          ).matching.dedupStrategy,
        ).toBe(strategy);
      }
    });

    it('fails fast on an unknown strategy, listing the valid ones', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: { dedupStrategy: 'keepNewest' } as never,
          }),
        ),
      ).toThrow(
        /dedupStrategy.*unknown dedup strategy "keepNewest".*keepNewestEffectiveDate, keepAll, keepFirst/s,
      );
    });
  });

  describe('matchingConfig.narrowingStrategies', () => {
    it('accepts an ordered subset (and the empty list) and defaults to the current chain', () => {
      expect(
        parseCarrierPipelineConfig(baseRecord()).matching.narrowingStrategies,
      ).toEqual(['activeStatus', 'activeTerm', 'mostRecentEffectiveDate']);

      expect(
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              narrowingStrategies: ['mostRecentEffectiveDate', 'activeStatus'],
            },
          }),
        ).matching.narrowingStrategies,
      ).toEqual(['mostRecentEffectiveDate', 'activeStatus']);

      expect(
        parseCarrierPipelineConfig(
          baseRecord({ matchingConfig: { narrowingStrategies: [] } }),
        ).matching.narrowingStrategies,
      ).toEqual([]);
    });

    it('fails fast on an unknown strategy id, listing the valid ones', () => {
      expect(() =>
        parseCarrierPipelineConfig(
          baseRecord({
            matchingConfig: {
              narrowingStrategies: ['activeStatus', 'newestFirst'],
            } as never,
          }),
        ),
      ).toThrow(
        /narrowingStrategies.*unknown narrowing strategy "newestFirst".*activeStatus, activeTerm, mostRecentEffectiveDate/s,
      );
    });
  });

  describe('tierTuning.tierConfidences.IDENTIFIER_EXACT', () => {
    it('validates and merges the new tier-confidence key', () => {
      const config = parseCarrierPipelineConfig(
        baseRecord({
          matchingConfig: {
            tierTuning: { tierConfidences: { IDENTIFIER_EXACT: 75 } },
          },
        }),
      );

      expect(
        config.matching.tierTuning?.tierConfidences?.IDENTIFIER_EXACT,
      ).toBe(75);
    });
  });
});
