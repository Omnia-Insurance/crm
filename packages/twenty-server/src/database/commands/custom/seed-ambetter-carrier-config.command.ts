// OMNIA-CUSTOM: Seeds the Ambetter CarrierConfig record used by the
// reconciliation pipeline. Idempotent — safe to re-run: the update path
// MERGES (fill-missing-keys-only) and never overwrites user-captured
// columnMapping entries or statusConfig.fieldMapping roles (remediation
// plan 4.6 — audit 2026-06-10 §"Seed writes legacy columnMapping shape ...
// re-running destroys the user-captured mapping").
//
// This file is the single source of truth for the Ambetter pipeline config
// (the dead AMBETTER_FIELD_CONFIG / DEFAULT_AMBETTER_COLUMN_MAPPING modules
// were ported into the literals below and deleted in Phase 4.1).
//
// Run with: npx nx run twenty-server:command workspace:seed-ambetter-carrier-config

import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { DEFAULT_MATCHING_CONFIG } from 'src/modules/reconciliation/engines/matching';
import { DEFAULT_STATUS_ENGINE_CONFIG } from 'src/modules/reconciliation/engines/status';
import { type TransformRules } from 'src/modules/reconciliation/parsers/transforms';
import {
  type ColumnMapping,
  type ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

// ---------------------------------------------------------------------------
// Column mapping: XLSX header → CRM field (live ColumnMappingEntry shape,
// the same shape the import dialog captures — header → {crmField, fieldType,
// fieldKey}). Used for import-dialog PRE-FILL; pipeline runs use the
// per-reconciliation snapshot the dialog writes.
//
// Deliberately NOT mapped here: 'Broker Effective Date',
// 'Policy Effective Date', 'Policy Term Date', 'Eligible for Commission' —
// those are status-engine inputs (statusConfig.fieldMapping below), typed at
// parse time via STATUS_ENGINE_ROLE_TYPES; the CRM effectiveDate write flows
// through the computed 'True Effective Date' field instead.
// ---------------------------------------------------------------------------

export const AMBETTER_COLUMN_MAPPING: ColumnMapping = {
  'Policy Number': {
    crmField: 'policyNumber',
    fieldType: 'TEXT',
    fieldKey: 'policyNumber',
  },
  'Insured First Name': {
    crmField: 'lead.name.firstName',
    fieldType: 'FULL_NAME',
    fieldKey: 'update:firstName-name (lead)',
  },
  'Insured Last Name': {
    crmField: 'lead.name.lastName',
    fieldType: 'FULL_NAME',
    fieldKey: 'update:lastName-name (lead)',
  },
  'Member Date Of Birth': {
    crmField: 'lead.dateOfBirth',
    fieldType: 'DATE',
    fieldKey: 'update:dateOfBirth (lead)',
  },
  'Broker Name': {
    crmField: 'agent.name',
    fieldType: 'TEXT',
    fieldKey: 'update:name (agent)',
  },
  'Broker NPN': {
    crmField: 'agent.npn',
    fieldType: 'TEXT',
    fieldKey: 'update:npn (agent)',
  },
  'Paid Through Date': {
    crmField: 'paidThroughDate',
    fieldType: 'DATE',
    fieldKey: 'paidThroughDate',
  },
  'Monthly Premium Amount': {
    crmField: 'premium.amountMicros',
    fieldType: 'CURRENCY',
    fieldKey: 'Amount (premium)',
  },
  'Member Phone Number': {
    crmField: 'lead.phones.primaryPhoneNumber',
    fieldType: 'PHONES',
    fieldKey: 'update:primaryPhoneNumber-phones (lead)',
  },
  'Member Email': {
    crmField: 'lead.emails.primaryEmail',
    fieldType: 'EMAILS',
    fieldKey: 'update:primaryEmail-emails (lead)',
  },
  'Number of Members': {
    crmField: 'applicantCount',
    fieldType: 'NUMBER',
    fieldKey: 'applicantCount',
  },
};

// ---------------------------------------------------------------------------
// Computed fields (fieldConfig column): derived at parse time. Inputs
// reference status ROLE names from statusConfig.fieldMapping, NOT raw
// header names, so they resolve in both title-case and underscore files.
// ---------------------------------------------------------------------------

export const AMBETTER_COMPUTED_FIELDS: ComputedFieldDef[] = [
  {
    outputKey: 'True Effective Date',
    method: 'maxDate',
    inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
    type: 'date',
    crmField: 'effectiveDate',
  },
];

// ---------------------------------------------------------------------------
// Status engine config: role → XLSX column header (canonical title-case;
// resolveFieldMapping bridges underscore CSV headers at run time).
// ---------------------------------------------------------------------------

export const AMBETTER_STATUS_ENGINE_ID = 'ambetter-bob-v1';

export const AMBETTER_STATUS_FIELD_MAPPING: Record<string, string> = {
  effectiveDate: 'True Effective Date',
  paidThroughDate: 'Paid Through Date',
  termDate: 'Policy Term Date',
  eligibleForCommission: 'Eligible for Commission',
  brokerEffectiveDate: 'Broker Effective Date',
  policyEffectiveDate: 'Policy Effective Date',
};

const buildSeedStatusConfig = (): Record<string, unknown> => ({
  ...DEFAULT_STATUS_ENGINE_CONFIG,
  engineId: AMBETTER_STATUS_ENGINE_ID,
  fieldMapping: AMBETTER_STATUS_FIELD_MAPPING,
});

// ---------------------------------------------------------------------------
// Transform rules (Phase 4.8): the per-carrier transform vocabulary consumed
// by parse.job → parseCarrierPipelineConfig → buildTransforms. Ambetter's
// explicit values equal DEFAULT_TRANSFORM_RULES (US dates, yes/no booleans,
// $-and-comma currency) — seeded explicitly so the carrier's vocabulary is
// visible and editable in the database.
// ---------------------------------------------------------------------------

export const AMBETTER_TRANSFORM_RULES: Required<TransformRules> = {
  dateFormats: ['MM/DD/YYYY'],
  twoDigitYearPivot: 10,
  booleanTrue: ['yes', 'true', '1'],
  booleanFalse: ['no', 'false', '0'],
  currencyStrip: ['$', ','],
};

const TRANSFORM_RULE_KEYS: readonly string[] = [
  'dateFormats',
  'twoDigitYearPivot',
  'booleanTrue',
  'booleanFalse',
  'currencyStrip',
];

// ---------------------------------------------------------------------------
// Product mapping: BOB plan name → CRM product (ACA metal tier)
// ---------------------------------------------------------------------------

const AMBETTER_PRODUCT_MAPPING = [
  {
    pattern: 'bronze',
    productId: '480a4c28-a73a-4ef6-9741-9f9a08f795af',
    productName: 'ACA - Bronze',
  },
  {
    pattern: 'silver',
    productId: '04db78bf-c30b-405e-9f35-657209a51183',
    productName: 'ACA - Silver',
  },
  {
    pattern: 'gold',
    productId: '158e6d2d-f091-433b-bd5b-b714e4b35e38',
    productName: 'ACA - Gold',
  },
  {
    pattern: 'catastrophic',
    productId: '6a85ca5b-ed9d-4a1d-b845-1bd1f9b14bb1',
    productName: 'ACA - Catastrophic',
  },
];

// ---------------------------------------------------------------------------
// Merge helpers (pure, exported for tests). The rule everywhere: existing
// (possibly user-captured or admin-tuned) values WIN; the seed only fills
// keys that are missing. Legacy seed-written shapes (alias-list
// columnMapping, { dates, currency } transformRules) were never
// user-captured, so they are replaced outright.
// ---------------------------------------------------------------------------

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Live shape: every value is { crmField: string, ... }. The legacy seed
 *  shape (canonicalName → string[] aliases) fails this. */
const isLiveColumnMapping = (value: unknown): value is ColumnMapping =>
  isPlainObject(value) &&
  Object.values(value).length > 0 &&
  Object.values(value).every(
    (entry) => isPlainObject(entry) && typeof entry.crmField === 'string',
  );

export type MergeResult<T> = {
  value: T;
  /** Human-readable notes about existing data that was preserved. */
  preserved: string[];
};

export const mergeColumnMapping = (
  existing: unknown,
): MergeResult<ColumnMapping> => {
  if (isLiveColumnMapping(existing)) {
    const existingHeaders = Object.keys(existing);
    const added = Object.keys(AMBETTER_COLUMN_MAPPING).filter(
      (header) => !(header in existing),
    );

    return {
      // Existing (user-captured) entries win; seed only adds missing headers.
      value: { ...AMBETTER_COLUMN_MAPPING, ...existing },
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
    value: AMBETTER_COLUMN_MAPPING,
    preserved: hadLegacy
      ? [
          'columnMapping: replaced legacy alias-list seed shape (never user-captured) with the live ColumnMappingEntry shape',
        ]
      : [],
  };
};

export const mergeStatusConfig = (
  existing: unknown,
): MergeResult<Record<string, unknown>> => {
  const seeded = buildSeedStatusConfig();

  if (!isPlainObject(existing)) {
    return { value: seeded, preserved: [] };
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
      ...seeded,
      ...existing, // existing thresholds/engineId win (fill missing only)
      fieldMapping: existingFieldMapping
        ? // Existing role → header captures win; seed fills missing roles.
          { ...AMBETTER_STATUS_FIELD_MAPPING, ...existingFieldMapping }
        : AMBETTER_STATUS_FIELD_MAPPING,
    },
    preserved,
  };
};

export const mergeMatchingConfig = (
  existing: unknown,
): MergeResult<Record<string, unknown>> => {
  if (!isPlainObject(existing) || Object.keys(existing).length === 0) {
    return { value: { ...DEFAULT_MATCHING_CONFIG }, preserved: [] };
  }

  return {
    // Existing (possibly admin-tuned) knobs win; seed fills missing ones.
    value: { ...DEFAULT_MATCHING_CONFIG, ...existing },
    preserved: [
      `matchingConfig: kept existing ${Object.keys(existing).join(', ')}`,
    ],
  };
};

export const mergeTransformRules = (
  existing: unknown,
): MergeResult<Record<string, unknown>> => {
  if (!isPlainObject(existing)) {
    return { value: { ...AMBETTER_TRANSFORM_RULES }, preserved: [] };
  }

  const recognized = Object.fromEntries(
    Object.entries(existing).filter(([key]) =>
      TRANSFORM_RULE_KEYS.includes(key),
    ),
  );

  if (Object.keys(recognized).length === 0) {
    // Legacy { dates, currency, ... } shape — seed-written, never read,
    // never user-captured. Replace with the live vocabulary.
    return { value: { ...AMBETTER_TRANSFORM_RULES }, preserved: [] };
  }

  return {
    value: { ...AMBETTER_TRANSFORM_RULES, ...recognized },
    preserved: [
      `transformRules: kept existing ${Object.keys(recognized).join(', ')}`,
    ],
  };
};

/**
 * Build the update payload for an existing Ambetter CarrierConfig record.
 * Seed-owned fields (parserVersion, fieldConfig, policyNumberPattern,
 * productMapping) are overwritten; user-capturable / admin-tunable fields
 * (columnMapping, statusConfig, matchingConfig, transformRules) are merged
 * fill-missing-keys-only. The never-read statusRules/explanationRules
 * columns are no longer written (audit §"written but never read").
 */
export const buildCarrierConfigUpdate = (
  existing: Record<string, unknown>,
): MergeResult<Record<string, unknown>> => {
  const columnMapping = mergeColumnMapping(existing.columnMapping);
  const statusConfig = mergeStatusConfig(existing.statusConfig);
  const matchingConfig = mergeMatchingConfig(existing.matchingConfig);
  const transformRules = mergeTransformRules(existing.transformRules);

  return {
    value: {
      parserVersion: AMBETTER_STATUS_ENGINE_ID,
      fieldConfig: AMBETTER_COMPUTED_FIELDS,
      matchingConfig: matchingConfig.value,
      statusConfig: statusConfig.value,
      policyNumberPattern: '^U',
      productMapping: AMBETTER_PRODUCT_MAPPING,
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
  name: 'workspace:seed-ambetter-carrier-config',
  description:
    'Insert or merge-update the Ambetter CarrierConfig record (column mapping, matching thresholds, status engine config, transform rules). Idempotent; never overwrites user-captured mappings.',
})
export class SeedAmbetterCarrierConfigCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = Boolean(options?.dryRun);

    this.logger.log(
      `Seeding Ambetter CarrierConfig for workspace ${workspaceId}${
        isDryRun ? ' (DRY RUN)' : ''
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

      // Check if an Ambetter config already exists
      const existing = await carrierConfigRepo.findOne({
        where: { name: 'Ambetter' } as any,
      });

      if (existing) {
        this.logger.log(
          `  ✓ Ambetter CarrierConfig already exists (id=${(existing as any).id}). Merging seed values (existing data wins)...`,
        );

        const { value: update, preserved } = buildCarrierConfigUpdate(
          existing as unknown as Record<string, unknown>,
        );

        for (const note of preserved) {
          this.logger.log(`  ↳ ${note}`);
        }

        if (isDryRun) {
          this.logger.log('  [DRY RUN] would merge-update existing record');

          return;
        }

        await carrierConfigRepo.update({ id: (existing as any).id }, update);

        this.logger.log('  ✓ Merge-updated Ambetter CarrierConfig');

        return;
      }

      if (isDryRun) {
        this.logger.log(
          '  [DRY RUN] would create Ambetter CarrierConfig record',
        );

        return;
      }

      // Look up the Ambetter carrier record to link via relation
      let carrierId: string | null = null;

      try {
        const carrierRepo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'carrier',
          { shouldBypassPermissionChecks: true },
        );

        const ambetterCarrier = await carrierRepo.findOne({
          where: { name: 'Ambetter' } as any,
        });

        if (ambetterCarrier) {
          carrierId = (ambetterCarrier as any).id;
          this.logger.log(`  Found Ambetter carrier record (id=${carrierId})`);
        } else {
          this.logger.warn(
            '  No "Ambetter" carrier record found — carrierConfig will not be linked to a carrier',
          );
        }
      } catch {
        this.logger.warn(
          '  Could not query carrier object — it may not exist yet',
        );
      }

      const record: Record<string, unknown> = {
        name: 'Ambetter',
        parserVersion: AMBETTER_STATUS_ENGINE_ID,
        fieldConfig: AMBETTER_COMPUTED_FIELDS,
        matchingConfig: DEFAULT_MATCHING_CONFIG,
        statusConfig: buildSeedStatusConfig(),
        policyNumberPattern: '^U',
        productMapping: AMBETTER_PRODUCT_MAPPING,
        columnMapping: AMBETTER_COLUMN_MAPPING,
        transformRules: AMBETTER_TRANSFORM_RULES,
      };

      if (carrierId) {
        record.carrierId = carrierId;
      }

      await carrierConfigRepo.save(record);

      this.logger.log('  + Created Ambetter CarrierConfig record');
    }, authContext);
  }
}
