// OMNIA-CUSTOM: Generic carrier-config seed command (multi-carrier readiness
// audit 2026-06-11 §"Generic seed-carrier-config command with pre-flight
// validation"; onboarding playbook docs/reconciliation/carrier-onboarding.md
// step 2). Creates or merge-updates a carrierConfig workspace record from a
// JSON definition file, refusing to write anything that fails the exact
// validation the pipeline applies at run time.
//
// Pre-flight (before any write):
//   - the assembled record must pass `parseCarrierPipelineConfig` (the
//     run-time boundary) — every onWarning is printed, every problem refuses,
//   - the resolved status-engine id must be registered (`isKnownStatusEngine`),
//   - `statusConfig.engineId` must be EXPLICIT in the definition (omitting it
//     silently runs the Ambetter engine via the legacy fallback — the
//     operability audit's silent-fallback gap),
//   - `matchingConfig.startDate` must be an EXPLICIT key (null allowed) —
//     omitting it silently inherits Ambetter's onboarding cutoff 2025-07-09
//     and drops older BOB rows (the silent-Ambetter-default trap),
//   - `statusConfig.fieldMapping` must be non-empty (an empty mapping passes
//     run-time validation and blanket-derives statuses),
//   - the carrier record must resolve (by carrierName or carrierId).
//
// Write path mirrors workspace:seed-ambetter-carrier-config: create when no
// record with the definition's name exists; otherwise MERGE with the same
// preserve-user-data semantics (existing values WIN; the seed only fills
// missing keys; preserved data is logged). The merge helpers below are the
// seed-parameterized equivalents of the exported Ambetter helpers
// (buildCarrierConfigUpdate / mergeColumnMapping / mergeStatusConfig /
// mergeMatchingConfig / mergeTransformRules) — that file is a frozen
// reference, so these take the seed values as an argument instead of closing
// over the AMBETTER_* literals. Parity with the Ambetter helpers is pinned by
// the spec (feeding the Ambetter seed payload through the generic path
// reproduces buildCarrierConfigUpdate bit-for-bit).
//
// Run with:
//   npx nx run twenty-server:command -- workspace:seed-carrier-config \
//     --file path/to/carrier-config.json [--validate-only] [--dry-run] \
//     [-w <workspace-id>]

import * as fs from 'fs';

import { Command, Option } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { type MergeResult } from 'src/database/commands/custom/seed-ambetter-carrier-config.command';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { DEFAULT_MATCHING_CONFIG } from 'src/modules/reconciliation/engines/matching';
import {
  DEFAULT_STATUS_ENGINE_CONFIG,
  isKnownStatusEngine,
  STATUS_ENGINE_IDS,
} from 'src/modules/reconciliation/engines/status';
import { DEFAULT_TRANSFORM_RULES } from 'src/modules/reconciliation/parsers/transforms';
import {
  CarrierConfigValidationError,
  parseCarrierPipelineConfig,
} from 'src/modules/reconciliation/types/carrier-config';
import {
  type CarrierConfigRecord,
  type ColumnMapping,
} from 'src/modules/reconciliation/types/reconciliation';

// ---------------------------------------------------------------------------
// Definition file shape (the operator-facing knobs from the onboarding
// playbook, docs/reconciliation/carrier-onboarding.md step 2)
// ---------------------------------------------------------------------------

export type CarrierConfigDefinition = {
  /** carrierConfig record name. Immutable in practice — learned rules and
   *  match overrides join on it; renaming silently orphans them. */
  name: string;
  /** Carrier record name to resolve carrierId by lookup… */
  carrierName?: string;
  /** …or the carrier record id directly (wins over carrierName). */
  carrierId?: string;
  /** MUST contain an explicit engineId and a non-empty fieldMapping
   *  (role → file header / computed outputKey). */
  statusConfig: Record<string, unknown>;
  /** MUST contain an explicit startDate key (null = no cutoff). */
  matchingConfig: Record<string, unknown>;
  /** Per-carrier transform vocabulary (dateFormats, boolean tokens, …). */
  transformRules?: Record<string, unknown>;
  /** Computed-field definitions (ComputedFieldDef[] shape). */
  fieldConfig?: Record<string, unknown>[];
  /** Case-insensitive identifier-gate regex (e.g. Ambetter '^U'). */
  policyNumberPattern?: string | null;
  /** Plan-name substring → CRM product entries. */
  productMapping?: Record<string, unknown>[];
  /** Optional import-dialog prefill, live ColumnMappingEntry shape. */
  columnMapping?: Record<string, unknown>;
  /** File-shape settings: headerRow, rowFilters, skipFooterRows. */
  parseSettings?: Record<string, unknown>;
  /** Per-carrier diff suppression policy (defaults preserve current behavior). */
  diffConfig?: Record<string, unknown>;
  /** Per-carrier CRM status sets (negativeTerminalStatuses, activeStatuses). */
  statusVocabulary?: Record<string, unknown>;
};

const DEFINITION_KEYS: readonly string[] = [
  'name',
  'carrierName',
  'carrierId',
  'statusConfig',
  'matchingConfig',
  'transformRules',
  'fieldConfig',
  'policyNumberPattern',
  'productMapping',
  'columnMapping',
  'parseSettings',
  'diffConfig',
  'statusVocabulary',
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Live ColumnMapping shape check used for the definition file: every entry
 *  must carry the {crmField, fieldType, fieldKey} strings the import dialog
 *  captures, otherwise the prefill is silently ignored at run time. */
const isDefinitionColumnMapping = (value: unknown): value is ColumnMapping =>
  isPlainObject(value) &&
  Object.values(value).every(
    (entry) =>
      isPlainObject(entry) &&
      typeof entry.crmField === 'string' &&
      typeof entry.fieldType === 'string' &&
      typeof entry.fieldKey === 'string',
  );

/** Same semantics as the (private) Ambetter helper: a non-empty mapping whose
 *  values all carry crmField. The legacy alias-list seed shape fails this. */
const isLiveColumnMapping = (value: unknown): value is ColumnMapping =>
  isPlainObject(value) &&
  Object.values(value).length > 0 &&
  Object.values(value).every(
    (entry) => isPlainObject(entry) && typeof entry.crmField === 'string',
  );

// ---------------------------------------------------------------------------
// Structural validation (definition-file shape; refusals are the traps the
// readiness audit calls out — silent Ambetter fallbacks)
// ---------------------------------------------------------------------------

export type ValidateDefinitionResult = {
  /** Non-null only when there are no problems. */
  definition: CarrierConfigDefinition | null;
  problems: string[];
  warnings: string[];
};

export const validateCarrierConfigDefinition = (
  raw: unknown,
): ValidateDefinitionResult => {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(raw)) {
    return {
      definition: null,
      problems: [
        'definition must be a JSON object: { name, carrierName | carrierId, statusConfig, matchingConfig, ... }',
      ],
      warnings,
    };
  }

  for (const key of Object.keys(raw)) {
    if (!DEFINITION_KEYS.includes(key)) {
      warnings.push(
        `unknown definition key "${key}" will be ignored (known keys: ${DEFINITION_KEYS.join(', ')})`,
      );
    }
  }

  if (!isNonEmptyString(raw.name)) {
    problems.push(
      'name: required non-empty string — the carrierConfig record name. Learned rules and ' +
        'match overrides join on it, so treat it as immutable once runs exist.',
    );
  }

  if (!isNonEmptyString(raw.carrierName) && !isNonEmptyString(raw.carrierId)) {
    problems.push(
      'carrierName or carrierId: required — the config must link to a carrier record ' +
        '(a null carrierId hard-fails the run at match time).',
    );
  }

  if (!isPlainObject(raw.statusConfig)) {
    problems.push(
      'statusConfig: required object with an explicit engineId and a non-empty fieldMapping.',
    );
  } else {
    if (!isNonEmptyString(raw.statusConfig.engineId)) {
      problems.push(
        'statusConfig.engineId: required — omitting it silently falls back to the Ambetter ' +
          `engine ("ambetter-bob-v1") at run time. Set it explicitly (registered engines: ${STATUS_ENGINE_IDS.join(', ')}).`,
      );
    }

    const fieldMapping = raw.statusConfig.fieldMapping;

    if (
      !isPlainObject(fieldMapping) ||
      Object.keys(fieldMapping).length === 0 ||
      !Object.values(fieldMapping).every((header) => isNonEmptyString(header))
    ) {
      problems.push(
        'statusConfig.fieldMapping: required non-empty role → file-header map — an empty ' +
          'mapping passes run-time validation and blanket-derives statuses (rows without an ' +
          'effective date default to ACTIVE_APPROVED; rows without a paid-through date derive PAYMENT_ERROR_*).',
      );
    }
  }

  if (!isPlainObject(raw.matchingConfig)) {
    problems.push(
      'matchingConfig: required object with an explicit startDate key (null = no cutoff).',
    );
  } else if (
    !Object.prototype.hasOwnProperty.call(raw.matchingConfig, 'startDate')
  ) {
    problems.push(
      'matchingConfig.startDate: key is required (explicit null allowed) — omitting it silently ' +
        "inherits Ambetter's onboarding cutoff 2025-07-09 and drops every BOB row effective " +
        "before that date (counted only in stats.skippedBeforeStartDate). Set the carrier's " +
        'real onboarding date, or null for no cutoff.',
    );
  }

  if (
    raw.columnMapping != null &&
    !isDefinitionColumnMapping(raw.columnMapping)
  ) {
    problems.push(
      'columnMapping: must use the live ColumnMappingEntry shape — header → { crmField, fieldType, fieldKey } ' +
        '(legacy alias-list shapes are silently ignored by the pipeline).',
    );
  }

  if (raw.fieldConfig != null && !Array.isArray(raw.fieldConfig)) {
    problems.push(
      'fieldConfig: must be an array of computed-field definitions ({ outputKey, method, inputs, type, crmField? }).',
    );
  }

  if (raw.productMapping != null && !Array.isArray(raw.productMapping)) {
    problems.push(
      'productMapping: must be an array of { pattern, productId, productName }.',
    );
  }

  if (raw.transformRules != null && !isPlainObject(raw.transformRules)) {
    problems.push('transformRules: must be an object (TransformRules shape).');
  }

  if (
    raw.policyNumberPattern != null &&
    typeof raw.policyNumberPattern !== 'string'
  ) {
    problems.push(
      'policyNumberPattern: must be a regular-expression string (or null/omitted).',
    );
  }

  if (problems.length > 0) {
    return { definition: null, problems, warnings };
  }

  return {
    definition: raw as unknown as CarrierConfigDefinition,
    problems,
    warnings,
  };
};

// ---------------------------------------------------------------------------
// Record assembly (create payload). Like the Ambetter seed, defaults are
// spread UNDER the definition's values so every knob is visible and editable
// on the workspace record — and because the definition is forced to carry
// explicit startDate/engineId, no Ambetter business constant can leak in.
// ---------------------------------------------------------------------------

export type AssembledCarrierConfigSeed = {
  name: string;
  parserVersion: string;
  fieldConfig: Record<string, unknown>[];
  matchingConfig: Record<string, unknown>;
  statusConfig: Record<string, unknown>;
  policyNumberPattern: string | null;
  productMapping: Record<string, unknown>[];
  columnMapping: ColumnMapping;
  transformRules: Record<string, unknown>;
  parseSettings: Record<string, unknown>;
  diffConfig: Record<string, unknown>;
  statusVocabulary: Record<string, unknown>;
};

export const assembleCarrierConfigRecord = (
  definition: CarrierConfigDefinition,
): AssembledCarrierConfigSeed => ({
  name: definition.name,
  // Legacy engine-id fallback channel — kept in sync with statusConfig.engineId
  // exactly like the Ambetter seed writes parserVersion.
  parserVersion: String(definition.statusConfig.engineId ?? ''),
  fieldConfig: definition.fieldConfig ?? [],
  matchingConfig: { ...DEFAULT_MATCHING_CONFIG, ...definition.matchingConfig },
  // Spread only the live engine knob — paymentErrorAgeDays is dead (no engine
  // reads it; the boundary warns when a non-default value is stored).
  statusConfig: {
    placedThresholdDays: DEFAULT_STATUS_ENGINE_CONFIG.placedThresholdDays,
    ...definition.statusConfig,
  },
  policyNumberPattern: definition.policyNumberPattern ?? null,
  productMapping: definition.productMapping ?? [],
  columnMapping: (definition.columnMapping ?? {}) as ColumnMapping,
  parseSettings: definition.parseSettings ?? {},
  diffConfig: definition.diffConfig ?? {},
  statusVocabulary: definition.statusVocabulary ?? {},
  transformRules: {
    ...DEFAULT_TRANSFORM_RULES,
    ...(definition.transformRules ?? {}),
  },
});

// ---------------------------------------------------------------------------
// Pre-flight: run the EXACT validation the pipeline applies at run time
// (parseCarrierPipelineConfig) plus the engine-registry check, collecting
// warnings instead of letting them vanish into worker logs.
// ---------------------------------------------------------------------------

export type CarrierConfigPreflightResult = {
  problems: string[];
  warnings: string[];
  /** Engine id as the pipeline would resolve it (null if parsing failed). */
  statusEngineId: string | null;
  /** Start-date cutoff as the pipeline would resolve it. */
  startDate: string | null;
};

export const preflightCarrierConfigPayload = (
  configName: string,
  payload: Record<string, unknown>,
): CarrierConfigPreflightResult => {
  const problems: string[] = [];
  const warnings: string[] = [];
  let statusEngineId: string | null = null;
  let startDate: string | null = null;

  const record = {
    id: 'pre-flight',
    carrierId: null,
    name: configName,
    ...payload,
  } as unknown as CarrierConfigRecord;

  try {
    const parsed = parseCarrierPipelineConfig(record, {
      onWarning: (message) => warnings.push(message),
    });

    statusEngineId = parsed.statusEngineId;
    startDate = parsed.startDate;

    if (!isKnownStatusEngine(parsed.statusEngineId)) {
      problems.push(
        `statusConfig.engineId "${parsed.statusEngineId}" is not a registered status engine ` +
          `(registered: ${STATUS_ENGINE_IDS.join(', ')}). Register the engine in engines/status.ts ` +
          'and deploy before seeding this config — an unknown id fails every run at PARSE and MATCH.',
      );
    }
  } catch (error) {
    if (error instanceof CarrierConfigValidationError) {
      problems.push(error.message);
    } else {
      throw error;
    }
  }

  return { problems, warnings, statusEngineId, startDate };
};

// ---------------------------------------------------------------------------
// Merge helpers — seed-parameterized equivalents of the exported Ambetter
// helpers (same preserve-user-data semantics, same preserved-note wording;
// parity is pinned by the spec). The rule everywhere: existing (possibly
// user-captured or admin-tuned) values WIN; the seed only fills missing keys.
// ---------------------------------------------------------------------------

export const mergeColumnMappingWithSeed = (
  seed: ColumnMapping,
  existing: unknown,
): MergeResult<ColumnMapping> => {
  if (isLiveColumnMapping(existing)) {
    const existingHeaders = Object.keys(existing);
    const added = Object.keys(seed).filter((header) => !(header in existing));

    return {
      // Existing (user-captured) entries win; seed only adds missing headers.
      value: { ...seed, ...existing },
      preserved: [
        `columnMapping: kept ${existingHeaders.length} user-captured entries` +
          (added.length > 0
            ? `, added ${added.length} missing seed entries (${added.join(', ')})`
            : ''),
      ],
    };
  }

  const hadLegacy = isPlainObject(existing) && Object.keys(existing).length > 0;

  return {
    value: seed,
    preserved: hadLegacy
      ? [
          'columnMapping: replaced legacy alias-list seed shape (never user-captured) with the live ColumnMappingEntry shape',
        ]
      : [],
  };
};

export const mergeStatusConfigWithSeed = (
  seed: Record<string, unknown>,
  existing: unknown,
): MergeResult<Record<string, unknown>> => {
  const seedFieldMapping = isPlainObject(seed.fieldMapping)
    ? (seed.fieldMapping as Record<string, string>)
    : {};

  if (!isPlainObject(existing)) {
    return {
      value: { ...seed, fieldMapping: seedFieldMapping },
      preserved: [],
    };
  }

  const preserved: string[] = [];
  const existingFieldMapping = isPlainObject(existing.fieldMapping)
    ? (existing.fieldMapping as Record<string, string>)
    : null;

  if (existingFieldMapping && Object.keys(existingFieldMapping).length > 0) {
    preserved.push(
      `statusConfig.fieldMapping: kept user-captured roles ${Object.keys(
        existingFieldMapping,
      ).join(', ')}`,
    );
  }

  const scalarKeys = Object.keys(existing).filter(
    (key) => key !== 'fieldMapping',
  );

  if (scalarKeys.length > 0) {
    preserved.push(`statusConfig: kept existing ${scalarKeys.join(', ')}`);
  }

  return {
    value: {
      ...seed,
      ...existing, // existing thresholds/engineId win (fill missing only)
      fieldMapping: existingFieldMapping
        ? // Existing role → header captures win; seed fills missing roles.
          { ...seedFieldMapping, ...existingFieldMapping }
        : seedFieldMapping,
    },
    preserved,
  };
};

export const mergeMatchingConfigWithSeed = (
  seed: Record<string, unknown>,
  existing: unknown,
): MergeResult<Record<string, unknown>> => {
  if (!isPlainObject(existing) || Object.keys(existing).length === 0) {
    return { value: { ...seed }, preserved: [] };
  }

  return {
    // Existing (possibly admin-tuned) knobs win; seed fills missing ones.
    value: { ...seed, ...existing },
    preserved: [
      `matchingConfig: kept existing ${Object.keys(existing).join(', ')}`,
    ],
  };
};

const TRANSFORM_RULE_KEYS: readonly string[] = Object.keys(
  DEFAULT_TRANSFORM_RULES,
);

export const mergeTransformRulesWithSeed = (
  seed: Record<string, unknown>,
  existing: unknown,
): MergeResult<Record<string, unknown>> => {
  if (!isPlainObject(existing)) {
    return { value: { ...seed }, preserved: [] };
  }

  const recognized = Object.fromEntries(
    Object.entries(existing).filter(([key]) =>
      TRANSFORM_RULE_KEYS.includes(key),
    ),
  );

  if (Object.keys(recognized).length === 0) {
    // Legacy { dates, currency, ... } shape — seed-written, never read,
    // never user-captured. Replace with the live vocabulary.
    return { value: { ...seed }, preserved: [] };
  }

  return {
    value: { ...seed, ...recognized },
    preserved: [
      `transformRules: kept existing ${Object.keys(recognized).join(', ')}`,
    ],
  };
};

/**
 * Build the update payload for an existing carrierConfig record from a
 * definition. Seed-owned fields (parserVersion, fieldConfig,
 * policyNumberPattern, productMapping) are overwritten; user-capturable /
 * admin-tunable fields (columnMapping, statusConfig, matchingConfig,
 * transformRules) are merged fill-missing-keys-only — identical semantics
 * to the Ambetter seed's buildCarrierConfigUpdate.
 */
export const buildGenericCarrierConfigUpdate = (
  definition: CarrierConfigDefinition,
  existing: Record<string, unknown>,
): MergeResult<Record<string, unknown>> => {
  const seed = assembleCarrierConfigRecord(definition);
  const columnMapping = mergeColumnMappingWithSeed(
    seed.columnMapping,
    existing.columnMapping,
  );
  const statusConfig = mergeStatusConfigWithSeed(
    seed.statusConfig,
    existing.statusConfig,
  );
  const matchingConfig = mergeMatchingConfigWithSeed(
    seed.matchingConfig,
    existing.matchingConfig,
  );
  const transformRules = mergeTransformRulesWithSeed(
    seed.transformRules,
    existing.transformRules,
  );

  return {
    value: {
      parserVersion: seed.parserVersion,
      fieldConfig: seed.fieldConfig,
      matchingConfig: matchingConfig.value,
      statusConfig: statusConfig.value,
      policyNumberPattern: seed.policyNumberPattern,
      productMapping: seed.productMapping,
      columnMapping: columnMapping.value,
      transformRules: transformRules.value,
    },
    preserved: [
      ...columnMapping.preserved,
      ...statusConfig.preserved,
      ...matchingConfig.preserved,
      ...transformRules.preserved,
    ],
  };
};

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

@Command({
  name: 'workspace:seed-carrier-config',
  description:
    'Create or merge-update a carrierConfig workspace record from a JSON definition file, with pre-flight validation (run-time config boundary + status-engine registry + explicit matchingConfig.startDate). Refuses to write on any validation problem; supports --validate-only and --dry-run; never overwrites user-captured mappings.',
})
export class SeedCarrierConfigCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  private filePath: string;
  private validateOnly = false;

  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {
    super(workspaceIteratorService);
  }

  @Option({
    flags: '--file <path>',
    description:
      'Path to the JSON carrier-config definition ({ name, carrierName | carrierId, statusConfig, matchingConfig, transformRules?, fieldConfig?, policyNumberPattern?, productMapping?, columnMapping? })',
    required: true,
  })
  parseFile(val: string): string {
    this.filePath = val;

    return val;
  }

  @Option({
    flags: '--validate-only',
    description:
      'Run the pre-flight validation (including carrier resolution) and print a summary without writing anything',
    required: false,
  })
  parseValidateOnly(): boolean {
    this.validateOnly = true;

    return true;
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = Boolean(options?.dryRun);

    const definition = this.loadDefinition();

    if (!definition) {
      return;
    }

    this.logger.log(
      `Seeding carrierConfig "${definition.name}" for workspace ${workspaceId}${
        this.validateOnly ? ' (VALIDATE ONLY)' : isDryRun ? ' (DRY RUN)' : ''
      }`,
    );

    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const carrierConfigRepo =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'carrierConfig',
          { shouldBypassPermissionChecks: true },
        );

      const existing = (await carrierConfigRepo.findOne({
        where: { name: definition.name } as any,
      })) as Record<string, unknown> | null;

      // The payload that would actually be written is the one that gets
      // pre-flighted: the merged value when a record exists (existing data
      // wins, so e.g. an existing engineId is what the pipeline will run),
      // the assembled create record otherwise.
      const merge = existing
        ? buildGenericCarrierConfigUpdate(definition, existing)
        : null;
      const payload: Record<string, unknown> = merge
        ? merge.value
        : { ...assembleCarrierConfigRecord(definition) };

      const preflight = preflightCarrierConfigPayload(definition.name, payload);
      const problems = [...preflight.problems];

      // --- carrier resolution (refuse if not found — a null carrierId
      // hard-fails the run at match time) ---
      const carrierId = await this.resolveCarrierId(
        workspaceId,
        definition,
        problems,
      );

      for (const warning of preflight.warnings) {
        this.logger.warn(`  ⚠ ${warning}`);
      }

      if (problems.length > 0) {
        for (const problem of problems) {
          this.logger.error(`  ✗ ${problem}`);
        }
        this.logger.error(
          `REFUSED: carrierConfig "${definition.name}" failed pre-flight validation — nothing was written.`,
        );

        return;
      }

      if (this.validateOnly) {
        this.logger.log(`  Pre-flight summary for "${definition.name}":`);
        this.logger.log(
          `    status engine: ${preflight.statusEngineId} (registered)`,
        );
        this.logger.log(
          `    matching startDate: ${
            preflight.startDate === null
              ? 'null (no cutoff — explicit)'
              : preflight.startDate
          }`,
        );
        this.logger.log(`    carrier: resolved (id=${carrierId})`);
        this.logger.log(
          existing
            ? `    existing record id=${existing.id} — would MERGE (existing data wins; ${merge!.preserved.length} preserved note(s))`
            : '    no existing record — would CREATE',
        );

        for (const note of merge?.preserved ?? []) {
          this.logger.log(`    ↳ ${note}`);
        }

        this.logger.log(
          `  ✓ validation passed (${preflight.warnings.length} warning(s)) — no writes performed (--validate-only)`,
        );

        return;
      }

      if (existing && merge) {
        this.logger.log(
          `  ✓ carrierConfig "${definition.name}" already exists (id=${existing.id}). Merging seed values (existing data wins)...`,
        );

        for (const note of merge.preserved) {
          this.logger.log(`  ↳ ${note}`);
        }

        const update: Record<string, unknown> = { ...merge.value };

        // Fill-missing-only, like every other merged key: never overwrite an
        // existing carrier link.
        if (!existing.carrierId) {
          update.carrierId = carrierId;
          this.logger.log(
            `  ↳ carrierId: filled missing carrier link (id=${carrierId})`,
          );
        }

        if (isDryRun) {
          this.logger.log('  [DRY RUN] would merge-update existing record');

          return;
        }

        await carrierConfigRepo.update({ id: existing.id as string }, update);

        this.logger.log(`  ✓ Merge-updated carrierConfig "${definition.name}"`);

        return;
      }

      const record: Record<string, unknown> = {
        ...assembleCarrierConfigRecord(definition),
        carrierId,
      };

      if (isDryRun) {
        this.logger.log(
          `  [DRY RUN] would create carrierConfig "${definition.name}" (carrierId=${carrierId})`,
        );

        return;
      }

      await carrierConfigRepo.save(record);

      this.logger.log(`  + Created carrierConfig "${definition.name}"`);
    }, authContext);
  }

  /** Read + JSON-parse + structurally validate the --file definition.
   *  Logs and returns null on any problem (refusal — nothing written). */
  private loadDefinition(): CarrierConfigDefinition | null {
    if (!this.filePath) {
      this.logger.error('--file is required');

      return null;
    }

    if (!fs.existsSync(this.filePath)) {
      this.logger.error(`Definition file not found: ${this.filePath}`);

      return null;
    }

    let raw: unknown;

    try {
      raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch (error) {
      this.logger.error(
        `Definition file is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }

    const { definition, problems, warnings } =
      validateCarrierConfigDefinition(raw);

    for (const warning of warnings) {
      this.logger.warn(`  ⚠ ${warning}`);
    }

    if (!definition) {
      for (const problem of problems) {
        this.logger.error(`  ✗ ${problem}`);
      }
      this.logger.error(
        'REFUSED: definition file failed validation — nothing was written.',
      );

      return null;
    }

    return definition;
  }

  /** Resolve the carrier record (by id when given, else by name). Pushes a
   *  problem and returns null when it cannot be resolved. */
  private async resolveCarrierId(
    workspaceId: string,
    definition: CarrierConfigDefinition,
    problems: string[],
  ): Promise<string | null> {
    try {
      const carrierRepo = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        'carrier',
        { shouldBypassPermissionChecks: true },
      );

      if (definition.carrierId) {
        const carrier = (await carrierRepo.findOne({
          where: { id: definition.carrierId } as any,
        })) as Record<string, unknown> | null;

        if (!carrier) {
          problems.push(
            `carrierId: no carrier record with id "${definition.carrierId}" — create the carrier record first (onboarding step 1).`,
          );

          return null;
        }

        return carrier.id as string;
      }

      const carrier = (await carrierRepo.findOne({
        where: { name: definition.carrierName } as any,
      })) as Record<string, unknown> | null;

      if (!carrier) {
        problems.push(
          `carrierName: no carrier record named "${definition.carrierName}" — create the carrier record first (onboarding step 1).`,
        );

        return null;
      }

      return carrier.id as string;
    } catch (error) {
      problems.push(
        `could not query the carrier object (${
          error instanceof Error ? error.message : String(error)
        }) — has workspace:seed-reconciliation-objects run?`,
      );

      return null;
    }
  }
}
