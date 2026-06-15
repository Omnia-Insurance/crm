// OMNIA-CUSTOM: per-run config fingerprint + run-warning helpers
// (Linear OMN-11; multi-carrier readiness audit 2026-06-11 §"Persist run
// warnings and a per-run config fingerprint into the stats JSON").
//
// Both jobs stamp `stats.configFingerprint` — a short hash of the PARSED
// CarrierPipelineConfig (the validated boundary output, not the raw stored
// JSON) — at their existing stats-write transition points. Because the same
// stored config must fingerprint identically in parse.job and match.job, the
// hash input is a canonical JSON encoding with stable key order; the match
// job compares its live fingerprint against the parse-time stamp to detect
// mid-run config edits (the "mixed-config run" trap the audit calls out).

import { createHash } from 'crypto';

import type { CarrierPipelineConfig } from 'src/modules/reconciliation/types/carrier-config';

/** Cap on persisted stats.warnings — the stats JSON is a UI surface, not a
 *  log sink. ~20 keeps the run-summary banner readable. */
export const MAX_RUN_WARNINGS = 20;

/** Length of the persisted fingerprint (first N hex chars of sha256). */
export const CONFIG_FINGERPRINT_LENGTH = 12;

/**
 * Canonical JSON encoding with stable key order:
 *   - object keys are sorted lexicographically at every depth,
 *   - `undefined` object values are dropped (JSON semantics),
 *   - arrays keep their order (order is meaningful for e.g. dateFormats),
 *   - RegExp values (CarrierPipelineConfig.policyNumberPattern is compiled
 *     by the boundary) encode as their `String()` form ("/^u/i") so pattern
 *     AND flags participate in the fingerprint.
 *
 * Exported for tests; production callers use `computeConfigFingerprint`.
 */
export const canonicalizeConfigJson = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (value instanceof RegExp) {
    return JSON.stringify(String(value));
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeConfigJson(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeConfigJson(record[key])}`,
      );

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
};

/**
 * Short sha256 hex (first 12 chars) of the canonical JSON of the parsed
 * CarrierPipelineConfig. Stable across key order, so the same stored config
 * fingerprints identically whether parsed by parse.job or match.job.
 */
export const computeConfigFingerprint = (
  config: CarrierPipelineConfig,
): string =>
  createHash('sha256')
    .update(canonicalizeConfigJson(config))
    .digest('hex')
    .slice(0, CONFIG_FINGERPRINT_LENGTH);

/**
 * Merge warning lists for persistence into stats.warnings: first-seen order
 * preserved, exact-duplicate strings dropped, capped at MAX_RUN_WARNINGS
 * (with a final "… and N more" marker when the cap truncates).
 */
export const mergeRunWarnings = (
  ...sources: (readonly string[] | null | undefined)[]
): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const source of sources) {
    for (const warning of source ?? []) {
      if (typeof warning !== 'string' || warning.length === 0) continue;
      if (seen.has(warning)) continue;

      seen.add(warning);
      merged.push(warning);
    }
  }

  if (merged.length <= MAX_RUN_WARNINGS) {
    return merged;
  }

  const overflow = merged.length - (MAX_RUN_WARNINGS - 1);

  return [
    ...merged.slice(0, MAX_RUN_WARNINGS - 1),
    `… and ${overflow} more warning(s) — see worker logs for the full list`,
  ];
};
