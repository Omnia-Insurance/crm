// OMNIA-CUSTOM: tests for the per-run config fingerprint + run-warning
// helpers (OMN-11). The critical invariant: the SAME stored config must
// fingerprint identically in parse.job and match.job, regardless of object
// key order — canonical JSON is what makes the parse-vs-match drift
// comparison meaningful.

import { DEFAULT_DIFF_POLICY } from 'src/modules/reconciliation/engines/diff';
import {
  DEFAULT_MATCHING_CONFIG,
  type MatchingConfig,
} from 'src/modules/reconciliation/engines/matching';
import { DEFAULT_STATUS_ENGINE_CONFIG } from 'src/modules/reconciliation/engines/status';
import type { CarrierPipelineConfig } from 'src/modules/reconciliation/types/carrier-config';
import { DEFAULT_STATUS_VOCABULARY } from 'src/modules/reconciliation/types/policy-statuses';
import {
  canonicalizeConfigJson,
  computeConfigFingerprint,
  CONFIG_FINGERPRINT_LENGTH,
  MAX_RUN_WARNINGS,
  mergeRunWarnings,
} from 'src/modules/reconciliation/utils/config-fingerprint.util';

const baseConfig = (
  overrides: Partial<CarrierPipelineConfig> = {},
): CarrierPipelineConfig => ({
  statusEngineId: 'ambetter-bob-v1',
  columnMapping: null,
  computedFields: null,
  statusFieldMapping: {
    effectiveDate: 'Effective Date',
    paidThroughDate: 'Paid Through Date',
  },
  engineParams: null,
  matching: DEFAULT_MATCHING_CONFIG,
  status: DEFAULT_STATUS_ENGINE_CONFIG,
  policyNumberPattern: /^U/i,
  productMapping: null,
  startDate: '2025-07-09',
  transformRules: {},
  parseSettings: {},
  diffPolicy: DEFAULT_DIFF_POLICY,
  statusVocabulary: DEFAULT_STATUS_VOCABULARY,
  ...overrides,
});

describe('canonicalizeConfigJson', () => {
  it('sorts object keys at every depth (stable key order)', () => {
    const a = { outer: { b: 1, a: 2 }, alpha: [{ z: 1, y: 2 }] };
    const b = { alpha: [{ y: 2, z: 1 }], outer: { a: 2, b: 1 } };

    expect(canonicalizeConfigJson(a)).toBe(canonicalizeConfigJson(b));
  });

  it('keeps array order significant', () => {
    expect(canonicalizeConfigJson(['MM/DD/YYYY', 'DD/MM/YYYY'])).not.toBe(
      canonicalizeConfigJson(['DD/MM/YYYY', 'MM/DD/YYYY']),
    );
  });

  it('encodes RegExp values with source AND flags', () => {
    expect(canonicalizeConfigJson(/^U/i)).toBe('"/^U/i"');
    expect(canonicalizeConfigJson(/^U/i)).not.toBe(
      canonicalizeConfigJson(/^U/),
    );
  });

  it('drops undefined object values and encodes null as null', () => {
    expect(canonicalizeConfigJson({ a: undefined, b: null })).toBe(
      '{"b":null}',
    );
  });
});

describe('computeConfigFingerprint', () => {
  it('produces a short lowercase hex fingerprint', () => {
    const fingerprint = computeConfigFingerprint(baseConfig());

    expect(fingerprint).toMatch(/^[0-9a-f]+$/);
    expect(fingerprint).toHaveLength(CONFIG_FINGERPRINT_LENGTH);
  });

  it('is stable across object key order (parse.job vs match.job parity)', () => {
    const config = baseConfig({
      statusFieldMapping: {
        effectiveDate: 'Effective Date',
        paidThroughDate: 'Paid Through Date',
      },
    });
    const reordered = baseConfig({
      statusFieldMapping: {
        paidThroughDate: 'Paid Through Date',
        effectiveDate: 'Effective Date',
      },
    });

    expect(computeConfigFingerprint(config)).toBe(
      computeConfigFingerprint(reordered),
    );
  });

  it('is deterministic for repeated calls on the same config', () => {
    const config = baseConfig();

    expect(computeConfigFingerprint(config)).toBe(
      computeConfigFingerprint(config),
    );
  });

  it('changes when a knob changes', () => {
    const matching: MatchingConfig = {
      ...DEFAULT_MATCHING_CONFIG,
      autoMatchThreshold: 90,
    };

    expect(computeConfigFingerprint(baseConfig())).not.toBe(
      computeConfigFingerprint(baseConfig({ matching })),
    );
  });

  it('changes when only the policy-number pattern changes', () => {
    expect(
      computeConfigFingerprint(baseConfig({ policyNumberPattern: /^U/i })),
    ).not.toBe(
      computeConfigFingerprint(baseConfig({ policyNumberPattern: /^OSC-/i })),
    );
  });
});

describe('mergeRunWarnings', () => {
  it('dedupes exact duplicates while preserving first-seen order', () => {
    expect(mergeRunWarnings(['a', 'b', 'a'], ['b', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('tolerates null/undefined sources and drops empty strings', () => {
    expect(mergeRunWarnings(null, undefined, ['', 'x'])).toEqual(['x']);
  });

  it('caps the merged list and appends an overflow marker', () => {
    const many = Array.from({ length: 30 }, (_, i) => `warning ${i}`);
    const merged = mergeRunWarnings(many);

    expect(merged).toHaveLength(MAX_RUN_WARNINGS);
    expect(merged[MAX_RUN_WARNINGS - 1]).toMatch(/and 11 more warning/);
    // The first MAX-1 entries pass through untouched.
    expect(merged.slice(0, MAX_RUN_WARNINGS - 1)).toEqual(
      many.slice(0, MAX_RUN_WARNINGS - 1),
    );
  });

  it('returns exactly MAX_RUN_WARNINGS entries without a marker at the cap', () => {
    const exact = Array.from({ length: MAX_RUN_WARNINGS }, (_, i) => `w${i}`);

    expect(mergeRunWarnings(exact)).toEqual(exact);
  });
});
