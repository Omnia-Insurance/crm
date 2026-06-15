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
  DEFAULT_DIFF_POLICY,
  type DiffPolicy,
} from 'src/modules/reconciliation/engines/diff';
import {
  DEDUP_STRATEGIES,
  DEFAULT_MATCHING_CONFIG,
  IDENTIFIER_ROLE_CRM_FIELDS,
  IDENTIFIER_ROLES,
  MATCH_TIER_IDS,
  NARROWING_STRATEGY_IDS,
  TIER_CONFIDENCE_IDS,
  type MatchingConfig,
} from 'src/modules/reconciliation/engines/matching';
import {
  DEFAULT_STATUS_ENGINE_CONFIG,
  type StatusEngineConfig,
} from 'src/modules/reconciliation/engines/status';
import {
  COMPUTATION_METHOD_IDS,
  ROW_FILTER_OPS,
  rowFilterRuleProblems,
  TRANSFORM_DATE_FORMATS,
  validateComputedFieldParams,
  type ParseSettings,
  type RowFilterRule,
  type TransformRules,
} from 'src/modules/reconciliation/parsers/transforms';
import {
  DEFAULT_STATUS_VOCABULARY,
  KNOWN_CRM_POLICY_STATUSES,
  type StatusVocabulary,
} from 'src/modules/reconciliation/types/policy-statuses';
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
  /** Raw statusConfig.engineParams (engine-specific JSON), or null. NOT yet
   *  validated against the selected engine's paramsSchema — callers validate
   *  at the same fail-fast points as `statusEngineId`
   *  (`validateStatusEngineParams` in engines/status.ts). */
  engineParams: Record<string, unknown> | null;
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
  /** Parse-stage settings (OMN-12): headerRow (1-based, parseXlsxSheet
   *  range), rowFilters + skipFooterRows (transformRows). Validated but
   *  possibly partial — `{}` means pure defaults (DEFAULT_PARSE_SETTINGS =
   *  today's behavior; the defaults merge lives in parsers/transforms.ts). */
  parseSettings: ParseSettings;
  /** Per-carrier diff-engine suppression policy (OMN-12 tuning depth),
   *  stored partial merged over DEFAULT_DIFF_POLICY — an absent/empty
   *  `diffConfig` reproduces the previously-hardcoded guards bit-for-bit.
   *  Threaded by match.job into `computeFieldDiffsFromMapping`. */
  diffPolicy: DiffPolicy;
  /** Per-carrier status vocabulary (OMN-12 tuning depth), stored partial
   *  merged over DEFAULT_STATUS_VOCABULARY (today's
   *  NEGATIVE_TERMINAL_STATUSES / ACTIVE_CRM_STATUSES). Plain arrays so the
   *  config stays fingerprint-serializable; consumers build Sets once
   *  (match.job `loadMatchContext`). Statuses outside the known CRM
   *  vocabulary WARN (workspace-added SELECT options are legitimate).
   *  `activeStatuses` scopes the match job's missing-from-BOB corpus (live
   *  when matchingConfig.enableMissingFromBob is on); `negativeTerminal-
   *  Statuses` reaches diff suppression, deriveCategory/deriveFlags, AND
   *  the matching narrowing chain (threaded via matchRow options — Wave 5). */
  statusVocabulary: StatusVocabulary;
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
// Zod schemas (stored = possibly-partial shapes; unknown keys are stripped,
// and the honesty pass at the end of parseCarrierPipelineConfig warns per
// stripped key so misspelled knobs no longer fail silently)
// ---------------------------------------------------------------------------

const tierBandsSchema = z.object({
  high: z.number(),
  medium: z.number(),
  low: z.number(),
});

/** enabledTiers entries must be canonical tier ids (MATCH_TIER_IDS) — a typo
 *  used to silently disable a tier (audit 2026-06-11 §"enabledTiers is an
 *  unvalidated free-string list"); failing loud is the boundary's contract. */
const matchTierIdSchema = z.enum(MATCH_TIER_IDS, {
  error: (issue) =>
    `unknown match tier "${String(issue.input)}" — valid tier ids: ${MATCH_TIER_IDS.join(', ')}`,
});

// tierTuning (OMN-12): every level is partial; unset knobs fall back to
// DEFAULT_TIER_TUNING (today's constants) per key inside the engine.
const tierConfidencesSchema = z
  .object({
    POLICY_NUMBER_DATE_AGENT: z.number(),
    POLICY_NUMBER_DATE: z.number(),
    POLICY_NUMBER_AGENT: z.number(),
    POLICY_NUMBER_SINGLE: z.number(),
    IDENTIFIER_EXACT: z.number(),
    NAME_DOB_DATE: z.number(),
  })
  .partial();

// Compile-time drift guard: the schema must cover every TierConfidenceId.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TierConfidencesSchemaCoversAllIds = AssertTrue<
  Extends<
    (typeof TIER_CONFIDENCE_IDS)[number],
    keyof z.infer<typeof tierConfidencesSchema>
  >
>;

const tier6WeightsSchema = z
  .object({
    dateProximity: z.number(),
    agentMatch: z.number(),
    memberName: z.number(),
    dobExact: z.number(),
    confidenceCap: z.number(),
  })
  .partial();

const dateProximityBandSchema = z.object({
  maxDays: z.number().min(0),
  score: z.number(),
});

const storedTierTuningSchema = z
  .object({
    tierConfidences: tierConfidencesSchema,
    tier6Weights: tier6WeightsSchema,
    dateProximityBands: z.array(dateProximityBandSchema).min(1),
    dateProximityFloor: z.number(),
  })
  .partial();

// --- identifier roles + canonicalization (OMN-12 identity) ----------------

/** identifierRoles values must be real CrmPolicy snapshot paths
 *  (IDENTIFIER_ROLE_CRM_FIELDS — the identifier-bearing policy fields
 *  fetchPoliciesForMatching provides). An arbitrary dot-path would silently
 *  index nothing, so unknown paths are a hard error. */
const identifierRoleCrmFieldSchema = z.enum(IDENTIFIER_ROLE_CRM_FIELDS, {
  error: (issue) =>
    `unknown identifier CRM field "${String(issue.input)}" — valid snapshot paths: ${IDENTIFIER_ROLE_CRM_FIELDS.join(', ')}`,
});

const identifierRolesSchema = z
  .object({
    memberId: identifierRoleCrmFieldSchema,
    subscriberId: identifierRoleCrmFieldSchema,
    groupNumber: identifierRoleCrmFieldSchema,
  })
  .partial();

// Compile-time drift guard: the schema must cover every IdentifierRole.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _IdentifierRolesSchemaCoversAllRoles = AssertTrue<
  Extends<
    (typeof IDENTIFIER_ROLES)[number],
    keyof z.infer<typeof identifierRolesSchema>
  >
>;

const identifierNormalizationSchema = z
  .object({
    stripLeadingZeros: z.boolean(),
    stripPrefix: z.string().min(1),
    // Compilability is validated below in parseCarrierPipelineConfig
    // (semantic check, mirroring the policyNumberPattern fail-fast).
    stripSuffixPattern: z.string().min(1),
  })
  .partial();

// --- post-match strategies (OMN-12) ----------------------------------------

const dedupStrategySchema = z.enum(DEDUP_STRATEGIES, {
  error: (issue) =>
    `unknown dedup strategy "${String(issue.input)}" — valid strategies: ${DEDUP_STRATEGIES.join(', ')}`,
});

const narrowingStrategySchema = z.enum(NARROWING_STRATEGY_IDS, {
  error: (issue) =>
    `unknown narrowing strategy "${String(issue.input)}" — valid strategies: ${NARROWING_STRATEGY_IDS.join(', ')}`,
});

/** Discovery thresholds are Jaro-Winkler scores — the 0–1 scale the legacy
 *  implementation used (0.95/0.98). A 0–100 value here is almost certainly a
 *  confidence-scale mixup, and (being live knobs now) would silently make
 *  every/no row qualify — hard error, consistent with the boundary contract. */
const discoveryThresholdSchema = z
  .number()
  .min(0, 'discovery thresholds are 0–1 name-similarity scores')
  .max(1, 'discovery thresholds are 0–1 name-similarity scores (not 0–100)');

const storedMatchingConfigSchema = z
  .object({
    enabledTiers: z.array(matchTierIdSchema),
    autoMatchThreshold: z.number(),
    autoRejectThreshold: z.number(),
    dateToleranceDays: z.number(),
    nameMatchThreshold: z.number(),
    enableMissingFromBob: z.boolean(),
    enableDiscovery: z.boolean(),
    agentNameThreshold: z.number(),
    tier7NameBands: tierBandsSchema,
    tier7ConfidenceScores: tierBandsSchema,
    tier7MinNameScore: z.number(),
    startDate: z.string().nullable(),
    discoveryNameThreshold: discoveryThresholdSchema,
    discoveryAutoThreshold: discoveryThresholdSchema,
    tierTuning: storedTierTuningSchema,
    identifierRoles: identifierRolesSchema,
    identifierNormalization: identifierNormalizationSchema,
    dedupStrategy: dedupStrategySchema,
    narrowingStrategies: z.array(narrowingStrategySchema),
  })
  .partial();

const storedStatusConfigSchema = z
  .object({
    fieldMapping: z.record(z.string(), z.string()),
    placedThresholdDays: z.number(),
    // paymentErrorAgeDays was REMOVED here (audit 2026-06-11 §"Validated-
    // but-dead knobs"): no engine reads it, so accepting + merging it was
    // dishonest. Stored values are ignored with a warning (see the honesty
    // pass in parseCarrierPipelineConfig).
    engineId: z.string(),
    // Per-engine params: shape is engine-specific, so the boundary only
    // requires "a JSON object" here; the selected engine's paramsSchema
    // validates the contents at the parse/match fail-fast points (same
    // deferred-validation layering as engineId — this file never imports
    // the engine registry).
    engineParams: z.record(z.string(), z.unknown()),
  })
  .partial();

const computedFieldDefSchema = z.object({
  outputKey: z.string().min(1),
  method: z.string().min(1),
  inputs: z.array(z.string()),
  // Method-specific params (OMN-12) — shape is method-specific, so the zod
  // layer only requires "a JSON object"; validateComputedFieldParams
  // (parsers/transforms.ts) validates the contents per method below.
  params: z.record(z.string(), z.unknown()).optional(),
  type: z.string(),
  crmField: z.string().optional(),
});

const computedFieldsSchema = z.array(computedFieldDefSchema);

const columnMappingEntrySchema = z.object({
  crmField: z.string(),
  fieldType: z.string(),
  fieldKey: z.string(),
});

const columnMappingSchema = z.record(z.string(), columnMappingEntrySchema);

const productMappingEntrySchema = z.object({
  pattern: z.string(),
  productId: z.string(),
  productName: z.string(),
});

const productMappingSchema = z.array(productMappingEntrySchema);

/** dateFormats entries must be canonical tokens (TRANSFORM_DATE_FORMATS,
 *  OMN-12 token grammar) — an unknown token is a hard error, consistent
 *  with the computed-field method and tier-id fail-fasts. */
const transformDateFormatSchema = z.enum(TRANSFORM_DATE_FORMATS, {
  error: (issue) =>
    `unknown date format token "${String(issue.input)}" — supported tokens: ${TRANSFORM_DATE_FORMATS.join(', ')}`,
});

const storedTransformRulesSchema = z
  .object({
    dateFormats: z.array(transformDateFormatSchema).min(1),
    twoDigitYearPivot: z.number().int(),
    booleanTrue: z.array(z.string().min(1)).min(1),
    booleanFalse: z.array(z.string().min(1)).min(1),
    currencyStrip: z.array(z.string().min(1)),
  })
  .partial();

// --- parseSettings (OMN-12): headerRow + row filters --------------------

const rowFilterOpSchema = z.enum(ROW_FILTER_OPS, {
  error: (issue) =>
    `unknown row-filter op "${String(issue.input)}" — known ops: ${ROW_FILTER_OPS.join(', ')}`,
});

const rowFilterRuleSchema = z.object({
  column: z.string().min(1),
  op: rowFilterOpSchema,
  value: z.string().optional(),
  action: z.literal('skip', {
    error: (issue) =>
      `unknown row-filter action "${String(issue.input)}" — the only supported action is "skip"`,
  }),
});

const storedParseSettingsSchema = z
  .object({
    headerRow: z.number().int().min(1),
    rowFilters: z.array(rowFilterRuleSchema),
    skipFooterRows: z.number().int().min(0),
  })
  .partial();

// --- diffConfig (OMN-12 tuning depth): per-carrier diff suppression -------
// Every knob optional; unset knobs fall back to DEFAULT_DIFF_POLICY
// (engines/diff.ts — today's hardcoded guards). leadIdentityFields entries
// must be non-empty crmField dot-paths, and the list itself must be
// non-empty: an empty list would silently disable the subscriber-mismatch
// safety net wholesale (the boolean knobs are the sanctioned off-switches).

const storedDiffConfigSchema = z
  .object({
    suppressAgentFields: z.boolean(),
    suppressPremiumDiffs: z.boolean(),
    suppressBackwardsEffectiveDate: z.boolean(),
    suppressAcaRolloverEffectiveDate: z.boolean(),
    leadIdentityFields: z.array(z.string().min(1)).min(1),
    suppressNegativeToNegativeStatus: z.boolean(),
  })
  .partial();

// --- statusVocabulary (OMN-12 tuning depth): terminal/active status sets --
// Arrays must be non-empty with non-empty entries (an empty set disables
// terminal classification / BOB-presence scoping wholesale — fail loud,
// consistent with the booleanTrue/dateFormats .min(1) rules). Entries
// OUTSIDE the known CRM status vocabulary warn but do not fail — see the
// honesty pass in parseCarrierPipelineConfig.

const storedStatusVocabularySchema = z
  .object({
    negativeTerminalStatuses: z.array(z.string().min(1)).min(1),
    activeStatuses: z.array(z.string().min(1)).min(1),
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ParseSettingsSchemaIsPartialOfSettings = AssertTrue<
  Extends<z.infer<typeof storedParseSettingsSchema>, ParseSettings>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ParseSettingsSchemaCoversAllKeys = AssertTrue<
  Extends<
    Required<z.infer<typeof storedParseSettingsSchema>>,
    Required<ParseSettings>
  >
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _RowFilterRuleSchemaMatchesType = AssertTrue<
  Extends<z.infer<typeof rowFilterRuleSchema>, RowFilterRule>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _DiffConfigSchemaIsPartialOfPolicy = AssertTrue<
  Extends<z.infer<typeof storedDiffConfigSchema>, Partial<DiffPolicy>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _DiffConfigSchemaCoversAllKeys = AssertTrue<
  Extends<Required<z.infer<typeof storedDiffConfigSchema>>, DiffPolicy>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StatusVocabularySchemaIsPartialOfVocabulary = AssertTrue<
  Extends<
    z.infer<typeof storedStatusVocabularySchema>,
    Partial<StatusVocabulary>
  >
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StatusVocabularySchemaCoversAllKeys = AssertTrue<
  Extends<
    Required<z.infer<typeof storedStatusVocabularySchema>>,
    StatusVocabulary
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Unknown-key honesty (audit 2026-06-11 §"Unknown-key and unknown-method
 * warnings"): the stored schemas strip unknown keys (zod default), so a
 * misspelled knob silently falls back to its default. Diff the stored
 * object's keys against the schema shape and warn per unknown key.
 * Non-object values are left to the schema's own error reporting.
 */
const warnUnknownKeys = (
  value: unknown,
  schemaShape: Record<string, unknown>,
  label: string,
  warn: (message: string) => void,
  ignoreKeys: readonly string[] = [],
): void => {
  if (!isPlainObject(value)) return;

  const knownKeys = Object.keys(schemaShape);

  for (const key of Object.keys(value)) {
    if (knownKeys.includes(key) || ignoreKeys.includes(key)) continue;

    warn(
      `${label}.${key} is not a recognized key — ignored ` +
        `(known keys: ${knownKeys.join(', ')})`,
    );
  }
};

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

      // identifierNormalization.stripSuffixPattern must compile (semantic
      // check beyond the zod shape, mirroring the policyNumberPattern
      // fail-fast) — buildIdentifierCanonicalizer compiles it per run and
      // an invalid regex would otherwise blow up mid-row.
      const stripSuffixPattern =
        parsed.data.identifierNormalization?.stripSuffixPattern;

      if (stripSuffixPattern !== undefined) {
        try {
          new RegExp(stripSuffixPattern, 'i');
        } catch (error) {
          problems.push(
            `matchingConfig.identifierNormalization.stripSuffixPattern: ` +
              `"${stripSuffixPattern}" is not a valid regular expression ` +
              `(${error instanceof Error ? error.message : String(error)})`,
          );
        }
      }
    } else {
      problems.push(...formatZodIssues('matchingConfig', parsed.error));
    }

    for (const legacyKey of LEGACY_MATCHING_THRESHOLD_KEYS) {
      if (legacyKey in record.matchingConfig) {
        warn(
          legacyKey === 'placedThresholdDays'
            ? `Carrier config "${configName}": matchingConfig.placedThresholdDays is ignored — ` +
                `status-engine thresholds live on statusConfig.placedThresholdDays (Phase 4.3)`
            : `Carrier config "${configName}": matchingConfig.paymentErrorAgeDays is ignored — ` +
                `it is not read by any engine; use statusConfig.engineParams for ` +
                `engine-specific knobs`,
        );
      }
    }

  }

  // enableMissingFromBob / enableDiscovery / discovery thresholds are LIVE
  // knobs (OMN-12 wired the match job's missing-from-BOB and policy-number
  // discovery phases) — the former "accepted but not yet implemented"
  // warnings are gone. Real semantic check instead: an auto threshold below
  // the suggest threshold means EVERY suggestion auto-qualifies, which is
  // well-defined but almost never intended.
  if (
    matching.enableDiscovery &&
    matching.discoveryAutoThreshold < matching.discoveryNameThreshold
  ) {
    warn(
      `Carrier config "${configName}": matchingConfig.discoveryAutoThreshold ` +
        `(${matching.discoveryAutoThreshold}) is below discoveryNameThreshold ` +
        `(${matching.discoveryNameThreshold}) — every discovery suggestion will ` +
        `keep full (auto) confidence. Raise discoveryAutoThreshold unless that ` +
        `is intentional.`,
    );
  }

  // --- startDate inheritance warning (audit 2026-06-11 §"New carriers
  // silently inherit Ambetter's onboarding-date cutoff"): the default is an
  // Omnia business-history constant, so a config that omits the key (or has
  // no matchingConfig at all) must hear about what it just inherited. ---
  if (
    record.matchingConfig == null ||
    !('startDate' in record.matchingConfig)
  ) {
    warn(
      `Carrier config "${configName}": matchingConfig.startDate not set — inheriting ` +
        `the Ambetter/Omnia onboarding default ${DEFAULT_MATCHING_CONFIG.startDate}; ` +
        `set it explicitly (null = no cutoff)`,
    );
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

  // Dead-knob honesty: stored statusConfig.paymentErrorAgeDays no longer
  // merges (no engine reads it). Warn only when the operator actually
  // changed it — seeds spread DEFAULT_STATUS_ENGINE_CONFIG wholesale, so
  // presence at the code default is seed hygiene, not operator intent.
  if (
    record.statusConfig != null &&
    'paymentErrorAgeDays' in record.statusConfig &&
    (record.statusConfig as Record<string, unknown>).paymentErrorAgeDays !==
      DEFAULT_STATUS_ENGINE_CONFIG.paymentErrorAgeDays
  ) {
    warn(
      `Carrier config "${configName}": statusConfig.paymentErrorAgeDays is not read ` +
        `by any engine; use statusConfig.engineParams for engine-specific knobs`,
    );
  }

  const status: StatusEngineConfig = {
    placedThresholdDays:
      storedStatus.placedThresholdDays ??
      DEFAULT_STATUS_ENGINE_CONFIG.placedThresholdDays,
    // Pinned to the code default: the knob is dead (no engine reads it) and
    // was removed from the stored schema; the key survives only because
    // StatusEngineConfig (engines/status.ts) still carries it.
    paymentErrorAgeDays: DEFAULT_STATUS_ENGINE_CONFIG.paymentErrorAgeDays,
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

      // Unknown-method fail-fast (audit 2026-06-11 §"Unknown-key and
      // unknown-method warnings"): applyComputedFields silently skips
      // unregistered methods while role validation still counts the
      // outputKey as resolvable — a typo'd method would feed null into the
      // status engine. Hard error, consistent with the engine-id fail-fast.
      for (const [index, def] of parsed.data.entries()) {
        if (!COMPUTATION_METHOD_IDS.includes(def.method)) {
          problems.push(
            `fieldConfig (computed-field definitions).${index}.method: unknown ` +
              `computed-field method "${def.method}" — known methods: ` +
              `${COMPUTATION_METHOD_IDS.join(', ')}`,
          );
          continue;
        }

        // Per-method params validation (OMN-12): a missing/malformed params
        // object (bad conditional op, uncompilable arithmetic expr, out-of-
        // range input ref, params on a param-less method) is a hard error —
        // applyComputedFields would otherwise silently compute null.
        problems.push(
          ...validateComputedFieldParams(def).map(
            (problem) =>
              `fieldConfig (computed-field definitions).${index}.${problem}`,
          ),
        );
      }
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

  // --- parseSettings (OMN-12): headerRow + row filters ---
  // {} = pure DEFAULT_PARSE_SETTINGS behavior (header on row 1, no
  // filtering). Beyond the zod shape, each row-filter rule gets semantic
  // validation (per-op value-requiredness, 'matches' regex compilability) —
  // hard errors, mirroring the policyNumberPattern compile fail-fast.
  let parseSettings: ParseSettings = {};

  if (record.parseSettings != null) {
    const parsed = storedParseSettingsSchema.safeParse(record.parseSettings);

    if (parsed.success) {
      parseSettings = parsed.data;

      for (const [index, rule] of (parsed.data.rowFilters ?? []).entries()) {
        problems.push(
          ...rowFilterRuleProblems(rule).map(
            (problem) => `parseSettings.rowFilters.${index}: ${problem}`,
          ),
        );
      }
    } else {
      problems.push(...formatZodIssues('parseSettings', parsed.error));
    }
  }

  // --- diffConfig (OMN-12 tuning depth): per-carrier diff suppression ---
  // Absent/empty = DEFAULT_DIFF_POLICY = the previously-hardcoded guards.
  let diffPolicy: DiffPolicy = DEFAULT_DIFF_POLICY;

  if (record.diffConfig != null) {
    const parsed = storedDiffConfigSchema.safeParse(record.diffConfig);

    if (parsed.success) {
      diffPolicy = { ...DEFAULT_DIFF_POLICY, ...parsed.data };
    } else {
      problems.push(...formatZodIssues('diffConfig', parsed.error));
    }
  }

  // --- statusVocabulary (OMN-12 tuning depth): terminal/active sets ---
  // Absent/empty = DEFAULT_STATUS_VOCABULARY = today's shared sets
  // (types/policy-statuses.ts).
  let statusVocabulary: StatusVocabulary = DEFAULT_STATUS_VOCABULARY;

  if (record.statusVocabulary != null) {
    const parsed = storedStatusVocabularySchema.safeParse(
      record.statusVocabulary,
    );

    if (parsed.success) {
      statusVocabulary = { ...DEFAULT_STATUS_VOCABULARY, ...parsed.data };

      // Unknown-status honesty: WARN (never fail) for statuses outside the
      // known CRM vocabulary — workspace-added SELECT options are the whole
      // point of the knob, but a typo'd status would silently never match.
      for (const [listName, statuses] of Object.entries(parsed.data)) {
        for (const status of statuses ?? []) {
          if (!KNOWN_CRM_POLICY_STATUSES.has(status)) {
            warn(
              `Carrier config "${configName}": statusVocabulary.${listName} contains ` +
                `"${status}", which is outside the known policy-status vocabulary ` +
                `(${[...KNOWN_CRM_POLICY_STATUSES].join(', ')}). Allowed — workspace-` +
                `added SELECT options are legitimate — but verify the SELECT option ` +
                `exists and the spelling matches exactly.`,
            );
          }
        }
      }

      // activeStatuses is LIVE (OMN-12): the match job's missing-from-BOB
      // phase scopes its "should be in the file" corpus to this set when
      // matchingConfig.enableMissingFromBob is on — no dead-knob warning.
      // Reshaping it while the knob is off is inert but harmless (the knob
      // documents the dependency), so no warning there either.
    } else {
      problems.push(...formatZodIssues('statusVocabulary', parsed.error));
    }
  }

  // --- unknown-key honesty pass (audit 2026-06-11 §"Unknown-key and
  // unknown-method warnings"): every object level the stored schemas strip
  // silently gets a per-key warning. Keys with dedicated warnings above
  // (legacy thresholds, the dead paymentErrorAgeDays) are excluded so they
  // are not double-reported. ---
  const labelPrefix = `Carrier config "${configName}"`;

  warnUnknownKeys(
    record.matchingConfig,
    storedMatchingConfigSchema.shape,
    `${labelPrefix}: matchingConfig`,
    warn,
    LEGACY_MATCHING_THRESHOLD_KEYS,
  );

  if (isPlainObject(record.matchingConfig)) {
    const storedMatching = record.matchingConfig as Record<string, unknown>;

    warnUnknownKeys(
      storedMatching.tier7NameBands,
      tierBandsSchema.shape,
      `${labelPrefix}: matchingConfig.tier7NameBands`,
      warn,
    );
    warnUnknownKeys(
      storedMatching.tier7ConfidenceScores,
      tierBandsSchema.shape,
      `${labelPrefix}: matchingConfig.tier7ConfidenceScores`,
      warn,
    );
    warnUnknownKeys(
      storedMatching.tierTuning,
      storedTierTuningSchema.shape,
      `${labelPrefix}: matchingConfig.tierTuning`,
      warn,
    );
    warnUnknownKeys(
      storedMatching.identifierRoles,
      identifierRolesSchema.shape,
      `${labelPrefix}: matchingConfig.identifierRoles`,
      warn,
    );
    warnUnknownKeys(
      storedMatching.identifierNormalization,
      identifierNormalizationSchema.shape,
      `${labelPrefix}: matchingConfig.identifierNormalization`,
      warn,
    );

    if (isPlainObject(storedMatching.tierTuning)) {
      warnUnknownKeys(
        storedMatching.tierTuning.tierConfidences,
        tierConfidencesSchema.shape,
        `${labelPrefix}: matchingConfig.tierTuning.tierConfidences`,
        warn,
      );
      warnUnknownKeys(
        storedMatching.tierTuning.tier6Weights,
        tier6WeightsSchema.shape,
        `${labelPrefix}: matchingConfig.tierTuning.tier6Weights`,
        warn,
      );
    }
  }

  warnUnknownKeys(
    record.statusConfig,
    storedStatusConfigSchema.shape,
    `${labelPrefix}: statusConfig`,
    warn,
    // Dedicated dead-knob handling above (warned only when non-default).
    ['paymentErrorAgeDays'],
  );

  warnUnknownKeys(
    record.transformRules,
    storedTransformRulesSchema.shape,
    `${labelPrefix}: transformRules`,
    warn,
  );

  warnUnknownKeys(
    record.parseSettings,
    storedParseSettingsSchema.shape,
    `${labelPrefix}: parseSettings`,
    warn,
  );

  warnUnknownKeys(
    record.diffConfig,
    storedDiffConfigSchema.shape,
    `${labelPrefix}: diffConfig`,
    warn,
  );

  warnUnknownKeys(
    record.statusVocabulary,
    storedStatusVocabularySchema.shape,
    `${labelPrefix}: statusVocabulary`,
    warn,
  );

  if (
    isPlainObject(record.parseSettings) &&
    Array.isArray(record.parseSettings.rowFilters)
  ) {
    for (const [index, entry] of record.parseSettings.rowFilters.entries()) {
      warnUnknownKeys(
        entry,
        rowFilterRuleSchema.shape,
        `${labelPrefix}: parseSettings.rowFilters.${index}`,
        warn,
      );
    }
  }

  if (Array.isArray(record.fieldConfig)) {
    for (const [index, entry] of record.fieldConfig.entries()) {
      warnUnknownKeys(
        entry,
        computedFieldDefSchema.shape,
        `${labelPrefix}: fieldConfig.${index}`,
        warn,
      );
    }
  }

  if (isPlainObject(record.columnMapping)) {
    for (const [header, entry] of Object.entries(record.columnMapping)) {
      // Legacy alias-list values are arrays — the helper no-ops on them
      // (the legacy-shape downgrade warning above already covers that case).
      warnUnknownKeys(
        entry,
        columnMappingEntrySchema.shape,
        `${labelPrefix}: columnMapping.${header}`,
        warn,
      );
    }
  }

  if (Array.isArray(record.productMapping)) {
    for (const [index, entry] of record.productMapping.entries()) {
      warnUnknownKeys(
        entry,
        productMappingEntrySchema.shape,
        `${labelPrefix}: productMapping.${index}`,
        warn,
      );
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
    engineParams: storedStatus.engineParams ?? null,
    matching,
    status,
    policyNumberPattern,
    productMapping,
    startDate: matching.startDate,
    transformRules,
    parseSettings,
    diffPolicy,
    statusVocabulary,
  };
};
