/**
 * The single validated boundary between stored carrier-config JSON and the
 * reconciliation pipeline (Phase 4.2 — audit 2026-06-10 §"matchingConfig
 * cast to MatchingConfig wholesale").
 *
 * Carrier-config fields are admin-editable RAW_JSON on a workspace record:
 * they can be partial (saved before a field existed), hand-edited, or
 * outright malformed. Every pipeline consumer must go through
 * `parseCarrierPipelineConfig` instead of casting:
 *
 *   - partial configs are merged over code defaults (`.partial()` schemas +
 *     DEFAULT_MATCHING_CONFIG / DEFAULT_STATUS_ENGINE_CONFIG),
 *   - malformed configs throw `CarrierConfigValidationError` with the exact
 *     key and problem, so the run fails fast with an actionable message
 *     instead of an opaque mid-row TypeError,
 *   - `policyNumberPattern` is compiled (and validated) to a RegExp once,
 *   - the status engine id is resolved here (statusConfig.engineId →
 *     parserVersion → legacy 'ambetter-bob-v1' with a deprecation warning);
 *     validating it against the engine registry stays in the caller
 *     (`isKnownStatusEngine` in engines/status.ts) so this file never
 *     imports the registry.
 *
 * Consumed by `match.job.ts#loadMatchContext` and `parse.job.ts` — both call
 * `parseCarrierPipelineConfig(carrierConfig)` once and read validated fields
 * off the result.
 */

import { z } from 'zod';

import {
  DEFAULT_MATCHING_CONFIG,
  type MatchingConfig,
} from 'src/modules/reconciliation/engines/matching';
import {
  DEFAULT_STATUS_ENGINE_CONFIG,
  type StatusEngineConfig,
} from 'src/modules/reconciliation/engines/status';
import type { TransformRules } from 'src/modules/reconciliation/parsers/transforms';
import type {
  CarrierConfigRecord,
  ColumnMapping,
  ComputedFieldDef,
  ProductMappingEntry,
  StatusConfig,
} from 'src/modules/reconciliation/types/reconciliation';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type CarrierPipelineConfig = {
  /** Resolved status engine id. NOT yet validated against the engine
   *  registry — callers must check `isKnownStatusEngine` (engines/status.ts)
   *  and fail fast. */
  statusEngineId: string;
  /** Carrier-level column mapping (import-dialog prefill). Pipeline runs use
   *  the per-reconciliation snapshot instead; legacy-shaped carrier mappings
   *  (pre-ColumnMappingEntry seeds) resolve to null with a warning. */
  columnMapping: ColumnMapping | null;
  /** Computed-field definitions (stored on the legacy-named `fieldConfig`). */
  computedFields: ComputedFieldDef[] | null;
  /** Status engine role → row key (statusConfig.fieldMapping). */
  statusFieldMapping: Record<string, string>;
  /** Matching engine config, stored partial merged over DEFAULT_MATCHING_CONFIG. */
  matching: MatchingConfig;
  /** Status-engine thresholds — single home StatusConfig, merged over
   *  DEFAULT_STATUS_ENGINE_CONFIG (Phase 4.3 killed the MatchingConfig
   *  duplicates). */
  status: StatusEngineConfig;
  /** Compiled policy-number validation pattern (case-insensitive), or null. */
  policyNumberPattern: RegExp | null;
  /** Per-carrier plan-name → CRM product resolution. */
  productMapping: ProductMappingEntry[] | null;
  /** Resolved start-date cutoff (alias of `matching.startDate`); null = no
   *  cutoff. Default is the Omnia/Ambetter onboarding date — see
   *  DEFAULT_MATCHING_CONFIG.startDate. */
  startDate: string | null;
  /** Per-carrier transform vocabulary (Phase 4.8), validated but still
   *  possibly partial — `{}` means pure defaults. Feed to `transformRows` /
   *  `buildTransforms`, which merge over DEFAULT_TRANSFORM_RULES (the
   *  defaults merge has a single home in parsers/transforms.ts). */
  transformRules: TransformRules;
};

export type ParseCarrierPipelineConfigOptions = {
  /** Receives non-fatal config problems (legacy fallbacks, ignored keys). */
  onWarning?: (message: string) => void;
};

export class CarrierConfigValidationError extends Error {
  constructor(configName: string, problems: string[]) {
    super(
      `Invalid carrier config "${configName}": ${problems.join('; ')}. ` +
        `Fix the carrier config record and re-run the reconciliation.`,
    );
    this.name = 'CarrierConfigValidationError';
  }
}

// ---------------------------------------------------------------------------
// Zod schemas (stored = possibly-partial shapes; unknown keys are stripped)
// ---------------------------------------------------------------------------

const tierBandsSchema = z.object({
  high: z.number(),
  medium: z.number(),
  low: z.number(),
});

const storedMatchingConfigSchema = z
  .object({
    enabledTiers: z.array(z.string()),
    autoMatchThreshold: z.number(),
    autoRejectThreshold: z.number(),
    dateToleranceDays: z.number(),
    nameMatchThreshold: z.number(),
    enableMissingFromBob: z.boolean(),
    agentNameThreshold: z.number(),
    tier7NameBands: tierBandsSchema,
    tier7ConfidenceScores: tierBandsSchema,
    tier7MinNameScore: z.number(),
    startDate: z.string().nullable(),
    discoveryNameThreshold: z.number(),
    discoveryAutoThreshold: z.number(),
  })
  .partial();

const storedStatusConfigSchema = z
  .object({
    fieldMapping: z.record(z.string(), z.string()),
    placedThresholdDays: z.number(),
    paymentErrorAgeDays: z.number(),
    engineId: z.string(),
  })
  .partial();

const computedFieldDefSchema = z.object({
  outputKey: z.string().min(1),
  method: z.string().min(1),
  inputs: z.array(z.string()),
  type: z.string(),
  crmField: z.string().optional(),
});

const computedFieldsSchema = z.array(computedFieldDefSchema);

const columnMappingSchema = z.record(
  z.string(),
  z.object({
    crmField: z.string(),
    fieldType: z.string(),
    fieldKey: z.string(),
  }),
);

const productMappingSchema = z.array(
  z.object({
    pattern: z.string(),
    productId: z.string(),
    productName: z.string(),
  }),
);

const storedTransformRulesSchema = z
  .object({
    dateFormats: z.array(z.enum(['MM/DD/YYYY', 'DD/MM/YYYY'])).min(1),
    twoDigitYearPivot: z.number().int(),
    booleanTrue: z.array(z.string().min(1)).min(1),
    booleanFalse: z.array(z.string().min(1)).min(1),
    currencyStrip: z.array(z.string().min(1)),
  })
  .partial();

// Compile-time drift guards: the stored schemas must stay assignable to the
// Partial<> of the live types, and must cover every key (adding a knob to
// MatchingConfig/StatusConfig without a schema entry fails these lines).
type Extends<A, B> = A extends B ? true : false;
type AssertTrue<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MatchingSchemaIsPartialOfConfig = AssertTrue<
  Extends<z.infer<typeof storedMatchingConfigSchema>, Partial<MatchingConfig>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MatchingSchemaCoversAllKeys = AssertTrue<
  Extends<Required<z.infer<typeof storedMatchingConfigSchema>>, MatchingConfig>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StatusSchemaIsPartialOfConfig = AssertTrue<
  Extends<z.infer<typeof storedStatusConfigSchema>, Partial<StatusConfig>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StatusSchemaCoversAllKeys = AssertTrue<
  Extends<Required<z.infer<typeof storedStatusConfigSchema>>, StatusConfig>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TransformSchemaIsPartialOfRules = AssertTrue<
  Extends<z.infer<typeof storedTransformRulesSchema>, TransformRules>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TransformSchemaCoversAllKeys = AssertTrue<
  Extends<
    Required<z.infer<typeof storedTransformRulesSchema>>,
    Required<TransformRules>
  >
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 'ambetter-bob-v1' fallback for legacy configs with neither
 *  statusConfig.engineId nor parserVersion. */
const LEGACY_DEFAULT_STATUS_ENGINE_ID = 'ambetter-bob-v1';

/** Threshold keys that used to live (duplicated) on MatchingConfig before
 *  Phase 4.3 moved their single home to StatusConfig. */
const LEGACY_MATCHING_THRESHOLD_KEYS = [
  'placedThresholdDays',
  'paymentErrorAgeDays',
] as const;

const formatZodIssues = (fieldName: string, error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';

    return `${fieldName}${path}: ${issue.message}`;
  });

// ---------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------

export const parseCarrierPipelineConfig = (
  record: CarrierConfigRecord,
  options: ParseCarrierPipelineConfigOptions = {},
): CarrierPipelineConfig => {
  const warn = options.onWarning ?? (() => undefined);
  const configName = record.name ?? record.id ?? 'unknown';
  const problems: string[] = [];

  // --- matchingConfig: partial merge over defaults ---
  let matching: MatchingConfig = DEFAULT_MATCHING_CONFIG;

  if (record.matchingConfig != null) {
    const parsed = storedMatchingConfigSchema.safeParse(record.matchingConfig);

    if (parsed.success) {
      matching = { ...DEFAULT_MATCHING_CONFIG, ...parsed.data };
    } else {
      problems.push(...formatZodIssues('matchingConfig', parsed.error));
    }

    for (const legacyKey of LEGACY_MATCHING_THRESHOLD_KEYS) {
      if (legacyKey in record.matchingConfig) {
        warn(
          `Carrier config "${configName}": matchingConfig.${legacyKey} is ignored — ` +
            `status-engine thresholds live on statusConfig.${legacyKey} (Phase 4.3)`,
        );
      }
    }
  }

  // --- statusConfig: partial merge over threshold defaults ---
  let storedStatus: Partial<StatusConfig> = {};

  if (record.statusConfig != null) {
    const parsed = storedStatusConfigSchema.safeParse(record.statusConfig);

    if (parsed.success) {
      storedStatus = parsed.data;
    } else {
      problems.push(...formatZodIssues('statusConfig', parsed.error));
    }
  }

  const status: StatusEngineConfig = {
    placedThresholdDays:
      storedStatus.placedThresholdDays ??
      DEFAULT_STATUS_ENGINE_CONFIG.placedThresholdDays,
    paymentErrorAgeDays:
      storedStatus.paymentErrorAgeDays ??
      DEFAULT_STATUS_ENGINE_CONFIG.paymentErrorAgeDays,
  };

  // --- status engine id: engineId → parserVersion → legacy default ---
  let statusEngineId: string;

  if (storedStatus.engineId) {
    statusEngineId = storedStatus.engineId;
  } else if (record.parserVersion) {
    statusEngineId = record.parserVersion;
    warn(
      `Carrier config "${configName}" has no statusConfig.engineId — falling back to ` +
        `parserVersion "${record.parserVersion}". This fallback is deprecated; ` +
        `seed statusConfig.engineId explicitly.`,
    );
  } else {
    statusEngineId = LEGACY_DEFAULT_STATUS_ENGINE_ID;
    warn(
      `Carrier config "${configName}" has neither statusConfig.engineId nor ` +
        `parserVersion — falling back to legacy default "${LEGACY_DEFAULT_STATUS_ENGINE_ID}". ` +
        `This fallback is deprecated; seed statusConfig.engineId explicitly.`,
    );
  }

  // --- computedFields (stored on the legacy-named fieldConfig column) ---
  let computedFields: ComputedFieldDef[] | null = null;

  if (record.fieldConfig != null) {
    const parsed = computedFieldsSchema.safeParse(record.fieldConfig);

    if (parsed.success) {
      computedFields = parsed.data.length > 0 ? parsed.data : null;
    } else {
      problems.push(
        ...formatZodIssues(
          'fieldConfig (computed-field definitions)',
          parsed.error,
        ),
      );
    }
  }

  // --- policyNumberPattern: must be a compilable regex ---
  let policyNumberPattern: RegExp | null = null;

  if (record.policyNumberPattern != null) {
    if (typeof record.policyNumberPattern !== 'string') {
      problems.push(
        `policyNumberPattern: expected a regular-expression string, got ${typeof record.policyNumberPattern}`,
      );
    } else if (record.policyNumberPattern.length > 0) {
      try {
        policyNumberPattern = new RegExp(record.policyNumberPattern, 'i');
      } catch (error) {
        problems.push(
          `policyNumberPattern: "${record.policyNumberPattern}" is not a valid regular expression ` +
            `(${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }
  }

  // --- carrier-level columnMapping (prefill only) ---
  // Legacy seeds stored an alias-list shape (name → string[]) that predates
  // ColumnMappingEntry; runs never read this (they use the per-
  // reconciliation snapshot), so a non-conforming value downgrades to null
  // with a warning instead of failing the run. Seed-shape repair is item 4.6.
  let columnMapping: ColumnMapping | null = null;

  if (record.columnMapping != null) {
    const parsed = columnMappingSchema.safeParse(record.columnMapping);

    if (parsed.success) {
      columnMapping = parsed.data;
    } else {
      warn(
        `Carrier config "${configName}": columnMapping is not in the live ` +
          `ColumnMappingEntry shape (legacy alias-list seed?) — ignoring it for ` +
          `prefill. ${formatZodIssues('columnMapping', parsed.error)[0]}`,
      );
    }
  }

  // --- productMapping ---
  let productMapping: ProductMappingEntry[] | null = null;

  if (record.productMapping != null) {
    const parsed = productMappingSchema.safeParse(record.productMapping);

    if (parsed.success) {
      productMapping = parsed.data.length > 0 ? parsed.data : null;
    } else {
      problems.push(...formatZodIssues('productMapping', parsed.error));
    }
  }

  // --- transformRules: per-carrier transform vocabulary (Phase 4.8) ---
  // {} = pure DEFAULT_TRANSFORM_RULES behavior. Note: the legacy seed shape
  // ({ dates, currency, ... }) carries only unknown keys, which zod strips —
  // it harmlessly parses to {} until the 4.6 seed replaces it.
  let transformRules: TransformRules = {};

  if (record.transformRules != null) {
    const parsed = storedTransformRulesSchema.safeParse(record.transformRules);

    if (parsed.success) {
      transformRules = parsed.data;
    } else {
      problems.push(...formatZodIssues('transformRules', parsed.error));
    }
  }

  if (problems.length > 0) {
    throw new CarrierConfigValidationError(configName, problems);
  }

  return {
    statusEngineId,
    columnMapping,
    computedFields,
    statusFieldMapping: storedStatus.fieldMapping ?? {},
    matching,
    status,
    policyNumberPattern,
    productMapping,
    startDate: matching.startDate,
    transformRules,
  };
};
