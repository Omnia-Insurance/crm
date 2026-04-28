// OMNIA-CUSTOM: Payment Reconciliation v2 — creates the Reconciliation and
// CarrierConfig custom workspace objects + their relations. Idempotent; safe
// to re-run. Matches the Path B pattern used by Omnia's other custom objects
// (policy, leadSource, carrier, etc.): direct calls to the ObjectMetadataService
// and FieldMetadataService rather than the heavy twenty-standard-application
// scaffolding.
//
// Run with: npx nx run twenty-server:command workspace:seed-reconciliation-objects
//
// See memory/project-reconciliation-v2.md for the full architecture context.

import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type FieldMetadataSeed } from 'src/engine/workspace-manager/dev-seeder/metadata/types/field-metadata-seed.type';
import { type ObjectMetadataSeed } from 'src/engine/workspace-manager/dev-seeder/metadata/types/object-metadata-seed.type';

// ─────────────────────────────────────────────────────────────────────────────
// Object + field specs
// ─────────────────────────────────────────────────────────────────────────────

const RECONCILIATION_OBJECT: ObjectMetadataSeed = {
  nameSingular: 'reconciliation',
  namePlural: 'reconciliations',
  labelSingular: 'Reconciliation',
  labelPlural: 'Reconciliations',
  description:
    'A Book-of-Business reconciliation run. Upload a carrier BOB, map columns, review diffs, and apply approved updates to CRM policies.',
  icon: 'IconFileImport',
};

const RECONCILIATION_CUSTOM_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.TEXT,
    name: 'sheetName',
    label: 'Sheet Name',
    description: 'Which sheet of the uploaded workbook was used (for multi-sheet BOBs)',
    icon: 'IconTable',
  },
  {
    type: FieldMetadataType.SELECT,
    name: 'status',
    label: 'Status',
    description: 'Pipeline state',
    icon: 'IconProgress',
    options: [
      { label: 'Uploaded', value: 'UPLOADED', position: 0, color: 'sky' },
      { label: 'Parsing', value: 'PARSING', position: 1, color: 'blue' },
      { label: 'Parsed', value: 'PARSED', position: 2, color: 'purple' },
      { label: 'Matching', value: 'MATCHING', position: 3, color: 'orange' },
      { label: 'Review', value: 'REVIEW', position: 4, color: 'yellow' },
      { label: 'Applying', value: 'APPLYING', position: 5, color: 'turquoise' },
      { label: 'Completed', value: 'COMPLETED', position: 6, color: 'green' },
      { label: 'Failed', value: 'FAILED', position: 7, color: 'red' },
    ],
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'columnMapping',
    label: 'Column Mapping',
    description:
      'Frozen snapshot of the final column mapping used on this run. Preserved for reproducibility even if the CarrierConfig default changes later.',
    icon: 'IconColumns',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'stats',
    label: 'Stats',
    description:
      'Run counts: totalBobRows, autoMatched, needsReview, unmatched, missingFromBob, discrepanciesFound, applied, failed',
    icon: 'IconChartBar',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'errorMessage',
    label: 'Error Message',
    description: 'Last error encountered, if any',
    icon: 'IconAlertTriangle',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    name: 'parsedAt',
    label: 'Parsed At',
    description: 'When parsing completed',
    icon: 'IconCalendarEvent',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    name: 'matchedAt',
    label: 'Matched At',
    description: 'When matching completed',
    icon: 'IconCalendarEvent',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    name: 'appliedAt',
    label: 'Applied At',
    description: 'When apply-updates started',
    icon: 'IconCalendarEvent',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    name: 'completedAt',
    label: 'Completed At',
    description: 'When the run reached COMPLETED or FAILED',
    icon: 'IconCalendarCheck',
  },
];

const CARRIER_CONFIG_OBJECT: ObjectMetadataSeed = {
  nameSingular: 'carrierConfig',
  namePlural: 'carrierConfigs',
  labelSingular: 'Carrier Config',
  labelPlural: 'Carrier Configs',
  description:
    'Per-carrier configuration for reconciliation: default column mappings, transforms, matching tuning, status-derivation rules, and explanation templates.',
  icon: 'IconSettings',
};

const CARRIER_CONFIG_CUSTOM_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.TEXT,
    name: 'parserVersion',
    label: 'Parser Version',
    description: 'Parser module identifier, e.g. "ambetter-bob-v1"',
    icon: 'IconCode',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'columnMapping',
    label: 'Column Mapping',
    description:
      'Default column mapping template for this carrier: canonical field name -> [alias, alias, ...]',
    icon: 'IconColumns',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'transformRules',
    label: 'Transform Rules',
    description:
      'Per-field transform rules: splitOn, dateFormat, normalize, etc.',
    icon: 'IconRefresh',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'matchingConfig',
    label: 'Matching Config',
    description: 'Tier thresholds, multipliers, and toggles for the matching engine',
    icon: 'IconTarget',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'statusRules',
    label: 'Status Rules',
    description: 'Status-derivation rules keyed by parserId',
    icon: 'IconBrain',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'explanationRules',
    label: 'Explanation Rules',
    description:
      'Diff-shape -> natural-language templates used by the review UI to explain why a change matters',
    icon: 'IconMessage',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// New CarrierConfig fields (v2 — unified fieldConfig replaces legacy fields)
// ─────────────────────────────────────────────────────────────────────────────

const CARRIER_CONFIG_V2_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'fieldConfig',
    label: 'Field Config',
    description:
      'Unified per-field configuration: column aliases, data types, CRM mappings, comparison methods, engine roles. Drives all pipeline stages.',
    icon: 'IconAdjustments',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'statusConfig',
    label: 'Status Config',
    description:
      'Status engine parameters: placedThresholdDays, paymentErrorAgeDays, etc.',
    icon: 'IconBrain',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'policyNumberPattern',
    label: 'Policy Number Pattern',
    description:
      'Regex pattern for valid policy numbers (e.g., "^U" for Ambetter). BOB rows that don\'t match are skipped during reconciliation.',
    icon: 'IconRegex',
    isNullable: true,
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'productMapping',
    label: 'Product Mapping',
    description:
      'Maps BOB plan names to CRM product records. Array of { pattern, productId, productName }. Case-insensitive substring match, first match wins.',
    icon: 'IconPackage',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Commission tracking — CarrierConfig extensions + new objects
// ─────────────────────────────────────────────────────────────────────────────

const CARRIER_CONFIG_COMMISSION_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'commissionConfig',
    label: 'Commission Config',
    description:
      'Commission rate configuration: comp type (pmpm/percentage), payment lag, default rate, and per-state rate table.',
    icon: 'IconCash',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'commissionColumnMapping',
    label: 'Commission Column Mapping',
    description:
      'Default column mapping for commission statement imports (separate from BOB column mapping).',
    icon: 'IconColumns',
  },
];

const COMMISSION_STATEMENT_OBJECT: ObjectMetadataSeed = {
  nameSingular: 'commissionStatement',
  namePlural: 'commissionStatements',
  labelSingular: 'Commission Statement',
  labelPlural: 'Commission Statements',
  description:
    'An uploaded carrier commission statement. Contains payment lines matched to CRM policies with expected vs actual delta calculations.',
  icon: 'IconReportMoney',
};

const COMMISSION_STATEMENT_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.TEXT,
    name: 'statementPeriod',
    label: 'Statement Period',
    description: 'The period this statement covers (e.g., "2026-03")',
    icon: 'IconCalendar',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'sheetName',
    label: 'Sheet Name',
    description: 'Which sheet of the uploaded workbook was used',
    icon: 'IconTable',
  },
  {
    type: FieldMetadataType.SELECT,
    name: 'status',
    label: 'Status',
    description: 'Pipeline state',
    icon: 'IconProgress',
    options: [
      { label: 'Uploaded', value: 'UPLOADED', position: 0, color: 'sky' },
      { label: 'Parsing', value: 'PARSING', position: 1, color: 'blue' },
      { label: 'Matching', value: 'MATCHING', position: 2, color: 'orange' },
      { label: 'Review', value: 'REVIEW', position: 3, color: 'yellow' },
      { label: 'Completed', value: 'COMPLETED', position: 4, color: 'green' },
      { label: 'Failed', value: 'FAILED', position: 5, color: 'red' },
    ],
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'columnMapping',
    label: 'Column Mapping',
    description: 'Snapshot of the column mapping used for this statement',
    icon: 'IconColumns',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'stats',
    label: 'Stats',
    description:
      'Aggregate stats: totalLines, matched, unmatched, totalExpected, totalReceived, delta',
    icon: 'IconChartBar',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'errorMessage',
    label: 'Error Message',
    description: 'Last error encountered, if any',
    icon: 'IconAlertTriangle',
  },
];

const COMMISSION_LINE_ITEM_OBJECT: ObjectMetadataSeed = {
  nameSingular: 'commissionLineItem',
  namePlural: 'commissionLineItems',
  labelSingular: 'Commission Line Item',
  labelPlural: 'Commission Line Items',
  description:
    'Individual payment line from a commission statement, matched to a CRM policy with expected vs actual delta.',
  icon: 'IconReceipt',
};

const COMMISSION_LINE_ITEM_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.TEXT,
    name: 'policyNumber',
    label: 'Policy Number',
    description: 'Policy number from the commission statement',
    icon: 'IconHash',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'memberName',
    label: 'Member Name',
    description: 'Member name from the commission statement',
    icon: 'IconUser',
  },
  {
    type: FieldMetadataType.CURRENCY,
    name: 'amountPaid',
    label: 'Amount Paid',
    description: 'Actual commission amount received',
    icon: 'IconCash',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'periodCovered',
    label: 'Period Covered',
    description: 'Which month(s) this payment covers',
    icon: 'IconCalendar',
  },
  {
    type: FieldMetadataType.SELECT,
    name: 'matchMethod',
    label: 'Match Method',
    description: 'How this line was matched to a policy',
    icon: 'IconLink',
    options: [
      { label: 'Exact', value: 'EXACT', position: 0, color: 'green' },
      { label: 'Fuzzy', value: 'FUZZY', position: 1, color: 'blue' },
      { label: 'Manual', value: 'MANUAL', position: 2, color: 'orange' },
      { label: 'Unmatched', value: 'UNMATCHED', position: 3, color: 'red' },
    ],
  },
  {
    type: FieldMetadataType.NUMBER,
    name: 'confidence',
    label: 'Confidence',
    description: 'Match confidence score (0-100)',
    icon: 'IconPercentage',
  },
  {
    type: FieldMetadataType.CURRENCY,
    name: 'expectedAmount',
    label: 'Expected Amount',
    description: 'Expected commission calculated from rate table (member_count × PMPM)',
    icon: 'IconCalculator',
  },
  {
    type: FieldMetadataType.CURRENCY,
    name: 'delta',
    label: 'Delta',
    description: 'Difference: expected - actual (positive = underpaid)',
    icon: 'IconArrowsUpDown',
  },
  {
    type: FieldMetadataType.SELECT,
    name: 'deltaStatus',
    label: 'Delta Status',
    description: 'Classification of the payment delta',
    icon: 'IconScale',
    options: [
      { label: 'Correct', value: 'CORRECT', position: 0, color: 'green' },
      { label: 'Underpaid', value: 'UNDERPAID', position: 1, color: 'red' },
      { label: 'Overpaid', value: 'OVERPAID', position: 2, color: 'blue' },
      { label: 'Unmatched', value: 'UNMATCHED', position: 3, color: 'orange' },
      { label: 'Missing', value: 'MISSING', position: 4, color: 'red' },
    ],
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'rowSnapshot',
    label: 'Row Snapshot',
    description: 'Snapshot of the raw statement row data',
    icon: 'IconDatabase',
  },
];

// Policy fields for commission tracking
const POLICY_COMMISSION_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.CURRENCY,
    name: 'expectedMonthlyCommission',
    label: 'Expected Monthly Commission',
    description: 'Expected monthly commission (member_count × PMPM rate)',
    icon: 'IconCash',
  },
  {
    type: FieldMetadataType.CURRENCY,
    name: 'totalCommissionReceived',
    label: 'Total Commission Received',
    description: 'Running total of commission received across all statements',
    icon: 'IconCash',
  },
  {
    type: FieldMetadataType.DATE,
    name: 'lastCommissionDate',
    label: 'Last Commission Date',
    description: 'Date of the most recent commission payment',
    icon: 'IconCalendar',
  },
  {
    type: FieldMetadataType.CURRENCY,
    name: 'lastCommissionAmount',
    label: 'Last Commission Amount',
    description: 'Amount of the most recent commission payment',
    icon: 'IconCash',
  },
  {
    type: FieldMetadataType.NUMBER,
    name: 'consecutiveMissedPayments',
    label: 'Consecutive Missed Payments',
    description: 'Counter for unmonitored policies that stop getting paid',
    icon: 'IconAlertTriangle',
  },
  {
    type: FieldMetadataType.NUMBER,
    name: 'monthsPaidWhileUnmonitored',
    label: 'Months Paid While Unmonitored',
    description: 'Tracks how long a termed-agent policy has been paying without BOB visibility',
    icon: 'IconEye',
  },
  {
    type: FieldMetadataType.BOOLEAN,
    name: 'autoAuditFlag',
    label: 'Auto Audit Flag',
    description: 'Set when an unmonitored policy misses a payment, triggers audit queue',
    icon: 'IconFlag',
    defaultValue: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ReviewItem object + fields (individual reconciliation results)
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_ITEM_OBJECT: ObjectMetadataSeed = {
  nameSingular: 'reviewItem',
  namePlural: 'reviewItems',
  labelSingular: 'Review Item',
  labelPlural: 'Review Items',
  description:
    'Individual reconciliation result: one BOB row matched (or unmatched) against a CRM policy. Jackie reviews these to approve/reject changes.',
  icon: 'IconChecklist',
};

const REVIEW_ITEM_CUSTOM_FIELDS: FieldMetadataSeed[] = [
  {
    type: FieldMetadataType.SELECT,
    name: 'category',
    label: 'Category',
    description: 'Triage category for the review queue',
    icon: 'IconCategory',
    options: [
      { label: 'Update', value: 'UPDATE', position: 0, color: 'orange' },
      { label: 'Unmatched', value: 'UNMATCHED', position: 1, color: 'red' },
    ],
  },
  {
    type: FieldMetadataType.SELECT,
    name: 'decision',
    label: 'Decision',
    description: 'User decision on this item',
    icon: 'IconGavel',
    options: [
      { label: 'Pending', value: 'PENDING', position: 0, color: 'gray' },
      { label: 'Approved', value: 'APPROVED', position: 1, color: 'green' },
      { label: 'Rejected', value: 'REJECTED', position: 2, color: 'red' },
      { label: 'Skipped', value: 'SKIPPED', position: 3, color: 'blue' },
      { label: 'Flag Audit', value: 'FLAG_AUDIT', position: 4, color: 'orange' },
    ],
  },
  {
    type: FieldMetadataType.MULTI_SELECT,
    name: 'flags',
    label: 'Flags',
    description: 'Overlay flags for special conditions',
    icon: 'IconFlag',
    options: [
      { label: 'Status Change', value: 'STATUS_CHANGE', position: 0, color: 'orange' },
      { label: 'Payment Error', value: 'PAYMENT_ERROR', position: 1, color: 'red' },
      { label: 'Reinstatement', value: 'REINSTATEMENT', position: 2, color: 'purple' },
      { label: 'Broker Eff Audit', value: 'BROKER_EFF_AUDIT', position: 3, color: 'yellow' },
      { label: 'Multi Match', value: 'MULTI_MATCH', position: 4, color: 'yellow' },
      { label: 'Name Mismatch', value: 'NAME_MISMATCH', position: 5, color: 'blue' },
    ],
  },
  {
    type: FieldMetadataType.SELECT,
    name: 'matchMethod',
    label: 'Match Method',
    description: 'Which matching tier produced this result',
    icon: 'IconLink',
    options: [
      { label: 'Override', value: 'OVERRIDE', position: 0, color: 'green' },
      { label: 'Policy#+Date+Agent', value: 'POLICY_NUMBER_DATE_AGENT', position: 1, color: 'green' },
      { label: 'Policy#+Date', value: 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE', position: 2, color: 'turquoise' },
      { label: 'Policy#+Agent', value: 'POLICY_NUMBER_PLUS_AGENT', position: 3, color: 'blue' },
      { label: 'Policy# Single', value: 'POLICY_NUMBER_SINGLE', position: 4, color: 'blue' },
      { label: 'Policy# Multi', value: 'POLICY_NUMBER_MULTI_BEST', position: 5, color: 'yellow' },
      { label: 'NPN+Date+Name', value: 'NPN_DATE_NAME', position: 6, color: 'orange' },
      { label: 'Name+DOB+Date', value: 'NAME_DOB_DATE', position: 7, color: 'orange' },
      { label: 'Missing from BOB', value: 'MISSING_FROM_BOB', position: 8, color: 'purple' },
      { label: 'Discovery', value: 'POLICY_NUMBER_DISCOVERY', position: 9, color: 'sky' },
      { label: 'Unmatched', value: 'UNMATCHED', position: 10, color: 'red' },
    ],
  },
  {
    type: FieldMetadataType.NUMBER,
    name: 'confidence',
    label: 'Confidence',
    description: 'Match confidence score (0-100)',
    icon: 'IconPercentage',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'summary',
    label: 'Summary',
    description: 'One-line description of what changed',
    icon: 'IconFileDescription',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'matchNotes',
    label: 'Match Notes',
    description: 'Detailed notes from the matching engine',
    icon: 'IconNote',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'derivedStatus',
    label: 'Derived Status',
    description: 'What the status engine says this policy should be',
    icon: 'IconArrowRight',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'currentCrmStatus',
    label: 'Current CRM Status',
    description: 'What the CRM currently has for this policy',
    icon: 'IconArrowLeft',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'statusChangeReason',
    label: 'Status Change Reason',
    description: 'Why the status engine derived a different status',
    icon: 'IconInfoCircle',
  },
  {
    type: FieldMetadataType.TEXT,
    name: 'note',
    label: 'Note',
    description: 'User note explaining the decision',
    icon: 'IconMessage',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    name: 'decidedAt',
    label: 'Decided At',
    description: 'When the user made the decision',
    icon: 'IconCalendarEvent',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'fieldDiffs',
    label: 'Field Diffs',
    description: 'Per-field comparison details (FieldDiff[] array)',
    icon: 'IconArrowsSplit',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    name: 'bobRowSnapshot',
    label: 'BOB Row Snapshot',
    description: 'Snapshot of the parsed BOB row data at match time',
    icon: 'IconDatabase',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Command
// ─────────────────────────────────────────────────────────────────────────────

@Command({
  name: 'workspace:seed-reconciliation-objects',
  description:
    'Create the Reconciliation and CarrierConfig custom workspace objects used by the payment reconciliation pipeline. Idempotent; safe to re-run.',
})
export class SeedReconciliationObjectsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = Boolean(options?.dryRun);

    this.logger.log(
      `Seeding reconciliation objects for workspace ${workspaceId}${
        isDryRun ? ' (DRY RUN)' : ''
      }`,
    );

    // 1. Create objects (each auto-creates a `name` field)
    await this.ensureObjectExists({
      workspaceId,
      seed: RECONCILIATION_OBJECT,
      dryRun: isDryRun,
    });

    await this.ensureObjectExists({
      workspaceId,
      seed: CARRIER_CONFIG_OBJECT,
      dryRun: isDryRun,
    });

    await this.ensureObjectExists({
      workspaceId,
      seed: REVIEW_ITEM_OBJECT,
      dryRun: isDryRun,
    });

    // 2. Create custom fields on each object
    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: RECONCILIATION_OBJECT.nameSingular,
      fieldSeeds: RECONCILIATION_CUSTOM_FIELDS,
      dryRun: isDryRun,
    });

    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: CARRIER_CONFIG_OBJECT.nameSingular,
      fieldSeeds: CARRIER_CONFIG_CUSTOM_FIELDS,
      dryRun: isDryRun,
    });

    // v2 fields on CarrierConfig (fieldConfig, statusConfig)
    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: CARRIER_CONFIG_OBJECT.nameSingular,
      fieldSeeds: CARRIER_CONFIG_V2_FIELDS,
      dryRun: isDryRun,
    });

    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: REVIEW_ITEM_OBJECT.nameSingular,
      fieldSeeds: REVIEW_ITEM_CUSTOM_FIELDS,
      dryRun: isDryRun,
    });

    // 3. Create relations.
    //
    // CarrierConfig -> Reconciliation (ONE_TO_MANY). Twenty auto-creates the
    // inverse `carrierConfig` MANY_TO_ONE field on the Reconciliation side.
    await this.ensureRelation({
      workspaceId,
      sourceObjectNameSingular: CARRIER_CONFIG_OBJECT.nameSingular,
      targetObjectNameSingular: RECONCILIATION_OBJECT.nameSingular,
      fieldName: 'reconciliations',
      fieldLabel: 'Reconciliations',
      fieldIcon: 'IconFileImport',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Carrier Config',
      targetFieldIcon: 'IconSettings',
      dryRun: isDryRun,
    });

    // CarrierConfig -> Carrier (MANY_TO_ONE). Twenty auto-creates the inverse
    // `carrierConfigs` ONE_TO_MANY field on the existing Carrier object.
    await this.ensureRelation({
      workspaceId,
      sourceObjectNameSingular: CARRIER_CONFIG_OBJECT.nameSingular,
      targetObjectNameSingular: 'carrier',
      fieldName: 'carrier',
      fieldLabel: 'Carrier',
      fieldIcon: 'IconBuildingSkyscraper',
      relationType: RelationType.MANY_TO_ONE,
      targetFieldLabel: 'Carrier Configs',
      targetFieldIcon: 'IconSettings',
      dryRun: isDryRun,
    });

    // ReviewItem -> Reconciliation (MANY_TO_ONE). Each review item belongs to
    // one reconciliation run. Twenty auto-creates the inverse `reviewItems`
    // ONE_TO_MANY field on the Reconciliation side.
    await this.ensureRelation({
      workspaceId,
      sourceObjectNameSingular: REVIEW_ITEM_OBJECT.nameSingular,
      targetObjectNameSingular: RECONCILIATION_OBJECT.nameSingular,
      fieldName: 'reconciliation',
      fieldLabel: 'Reconciliation',
      fieldIcon: 'IconFileImport',
      relationType: RelationType.MANY_TO_ONE,
      targetFieldLabel: 'Review Items',
      targetFieldIcon: 'IconChecklist',
      dryRun: isDryRun,
    });

    // ReviewItem -> Policy (MANY_TO_ONE). Each review item may be matched to
    // one CRM policy. Twenty auto-creates the inverse `reviewItems`
    // ONE_TO_MANY field on the Policy side.
    await this.ensureRelation({
      workspaceId,
      sourceObjectNameSingular: REVIEW_ITEM_OBJECT.nameSingular,
      targetObjectNameSingular: 'policy',
      fieldName: 'policy',
      fieldLabel: 'Policy',
      fieldIcon: 'IconFileText',
      relationType: RelationType.MANY_TO_ONE,
      targetFieldLabel: 'Review Items',
      targetFieldIcon: 'IconChecklist',
      dryRun: isDryRun,
    });

    // ── Commission tracking objects ──

    await this.ensureObjectExists({
      workspaceId,
      seed: COMMISSION_STATEMENT_OBJECT,
      dryRun: isDryRun,
    });

    await this.ensureObjectExists({
      workspaceId,
      seed: COMMISSION_LINE_ITEM_OBJECT,
      dryRun: isDryRun,
    });

    // Commission fields on CarrierConfig
    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: CARRIER_CONFIG_OBJECT.nameSingular,
      fieldSeeds: CARRIER_CONFIG_COMMISSION_FIELDS,
      dryRun: isDryRun,
    });

    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: COMMISSION_STATEMENT_OBJECT.nameSingular,
      fieldSeeds: COMMISSION_STATEMENT_FIELDS,
      dryRun: isDryRun,
    });

    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: COMMISSION_LINE_ITEM_OBJECT.nameSingular,
      fieldSeeds: COMMISSION_LINE_ITEM_FIELDS,
      dryRun: isDryRun,
    });

    // Commission tracking fields on Policy
    await this.ensureFieldsExist({
      workspaceId,
      objectNameSingular: 'policy',
      fieldSeeds: POLICY_COMMISSION_FIELDS,
      dryRun: isDryRun,
    });

    // ── Commission relations ──

    // CarrierConfig -> CommissionStatement (ONE_TO_MANY)
    await this.ensureRelation({
      workspaceId,
      sourceObjectNameSingular: CARRIER_CONFIG_OBJECT.nameSingular,
      targetObjectNameSingular: COMMISSION_STATEMENT_OBJECT.nameSingular,
      fieldName: 'commissionStatements',
      fieldLabel: 'Commission Statements',
      fieldIcon: 'IconReportMoney',
      relationType: RelationType.ONE_TO_MANY,
      targetFieldLabel: 'Carrier Config',
      targetFieldIcon: 'IconSettings',
      dryRun: isDryRun,
    });

    // CommissionLineItem -> CommissionStatement (MANY_TO_ONE)
    await this.ensureRelation({
      workspaceId,
      sourceObjectNameSingular: COMMISSION_LINE_ITEM_OBJECT.nameSingular,
      targetObjectNameSingular: COMMISSION_STATEMENT_OBJECT.nameSingular,
      fieldName: 'commissionStatement',
      fieldLabel: 'Commission Statement',
      fieldIcon: 'IconReportMoney',
      relationType: RelationType.MANY_TO_ONE,
      targetFieldLabel: 'Line Items',
      targetFieldIcon: 'IconReceipt',
      dryRun: isDryRun,
    });

    // CommissionLineItem -> Policy (MANY_TO_ONE)
    await this.ensureRelation({
      workspaceId,
      sourceObjectNameSingular: COMMISSION_LINE_ITEM_OBJECT.nameSingular,
      targetObjectNameSingular: 'policy',
      fieldName: 'policy',
      fieldLabel: 'Policy',
      fieldIcon: 'IconFileText',
      relationType: RelationType.MANY_TO_ONE,
      targetFieldLabel: 'Commission Line Items',
      targetFieldIcon: 'IconReceipt',
      dryRun: isDryRun,
    });

    // 4. Invalidate workspace caches so new metadata is picked up
    if (!isDryRun) {
      await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ]);
    }

    this.logger.log(
      `Finished seeding reconciliation objects for workspace ${workspaceId}`,
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────

  private async ensureObjectExists({
    workspaceId,
    seed,
    dryRun,
  }: {
    workspaceId: string;
    seed: ObjectMetadataSeed;
    dryRun: boolean;
  }): Promise<void> {
    const existing = await this.objectMetadataRepository.findOne({
      where: { workspaceId, nameSingular: seed.nameSingular },
    });

    if (isDefined(existing)) {
      this.logger.log(
        `  ✓ Object "${seed.nameSingular}" already exists (id=${existing.id})`,
      );

      return;
    }

    if (dryRun) {
      this.logger.log(
        `  [DRY RUN] would create object "${seed.nameSingular}"`,
      );

      return;
    }

    this.logger.log(`  + Creating object "${seed.nameSingular}"`);

    try {
      await this.objectMetadataService.createOneObject({
        createObjectInput: {
          ...seed,
        },
        workspaceId,
      });
    } catch (err: unknown) {
      // Log full validation details before re-throwing
      if (
        err &&
        typeof err === 'object' &&
        'failedWorkspaceMigrationBuildResult' in err
      ) {
        const result = (err as Record<string, unknown>)
          .failedWorkspaceMigrationBuildResult as Record<string, unknown>;
        this.logger.error(
          `  Validation errors for "${seed.nameSingular}": ${JSON.stringify(result, null, 2)}`,
        );
      }
      throw err;
    }
  }

  private async ensureFieldsExist({
    workspaceId,
    objectNameSingular,
    fieldSeeds,
    dryRun,
  }: {
    workspaceId: string;
    objectNameSingular: string;
    fieldSeeds: FieldMetadataSeed[];
    dryRun: boolean;
  }): Promise<void> {
    const objectMetadata = await this.objectMetadataRepository.findOne({
      where: { workspaceId, nameSingular: objectNameSingular },
      relations: ['fields'],
    });

    if (!isDefined(objectMetadata)) {
      if (dryRun) {
        this.logger.log(
          `  [DRY RUN] would add ${fieldSeeds.length} fields to "${objectNameSingular}" (object not yet created)`,
        );

        return;
      }

      throw new Error(
        `Object "${objectNameSingular}" not found — object creation must have failed`,
      );
    }

    const existingFields = objectMetadata.fields ?? [];
    const existingFieldsByName = new Map(
      existingFields.map((f) => [f.name, f]),
    );

    const fieldsToCreate = fieldSeeds.filter(
      (seed) => !existingFieldsByName.has(seed.name),
    );

    // Update SELECT/MULTI_SELECT options on existing fields if they've changed.
    // This ensures Postgres enums stay in sync with the seed definition.
    const fieldsToUpdateOptions: { id: string; name: string; options: unknown[] }[] = [];

    for (const seed of fieldSeeds) {
      if (
        seed.type !== FieldMetadataType.SELECT &&
        seed.type !== FieldMetadataType.MULTI_SELECT
      ) {
        continue;
      }

      const existing = existingFieldsByName.get(seed.name);

      if (!existing || !seed.options) continue;

      const existingValues = new Set(
        ((existing.options ?? []) as { value: string }[]).map((o) => o.value),
      );
      const seedValues = new Set(
        (seed.options as { value: string }[]).map((o) => o.value),
      );

      // Check if options differ (new values added, old removed, or count changed)
      const hasNewValues = [...seedValues].some((v) => !existingValues.has(v));
      const hasRemovedValues = [...existingValues].some((v) => !seedValues.has(v));

      if (hasNewValues || hasRemovedValues) {
        fieldsToUpdateOptions.push({
          id: existing.id,
          name: seed.name,
          options: seed.options as unknown[],
        });
      }
    }

    if (fieldsToCreate.length === 0 && fieldsToUpdateOptions.length === 0) {
      this.logger.log(
        `  ✓ All ${fieldSeeds.length} fields on "${objectNameSingular}" already exist`,
      );

      return;
    }

    if (dryRun) {
      if (fieldsToCreate.length > 0) {
        this.logger.log(
          `  [DRY RUN] would create ${fieldsToCreate.length} field(s) on "${objectNameSingular}": ${fieldsToCreate
            .map((f) => f.name)
            .join(', ')}`,
        );
      }

      if (fieldsToUpdateOptions.length > 0) {
        this.logger.log(
          `  [DRY RUN] would update options on ${fieldsToUpdateOptions.length} field(s): ${fieldsToUpdateOptions
            .map((f) => f.name)
            .join(', ')}`,
        );
      }

      return;
    }

    if (fieldsToCreate.length > 0) {
      this.logger.log(
        `  + Creating ${fieldsToCreate.length} field(s) on "${objectNameSingular}": ${fieldsToCreate
          .map((f) => f.name)
          .join(', ')}`,
      );

      await this.fieldMetadataService.createManyFields({
        createFieldInputs: fieldsToCreate.map((seed) => ({
          ...seed,
          objectMetadataId: objectMetadata.id,
        })),
        workspaceId,
      });
    }

    // Update options on existing SELECT/MULTI_SELECT fields.
    // Direct metadata update + cache invalidation at the end of the seed
    // ensures both metadata JSON and Postgres enums stay in sync.
    for (const field of fieldsToUpdateOptions) {
      this.logger.log(
        `  ↻ Updating options on "${objectNameSingular}.${field.name}"`,
      );

      await this.objectMetadataRepository.manager.query(
        `UPDATE core."fieldMetadata" SET options = $1 WHERE id = $2`,
        [JSON.stringify(field.options), field.id],
      );
    }
  }

  private async ensureRelation({
    workspaceId,
    sourceObjectNameSingular,
    targetObjectNameSingular,
    fieldName,
    fieldLabel,
    fieldIcon,
    relationType,
    targetFieldLabel,
    targetFieldIcon,
    dryRun,
  }: {
    workspaceId: string;
    sourceObjectNameSingular: string;
    targetObjectNameSingular: string;
    fieldName: string;
    fieldLabel: string;
    fieldIcon: string;
    relationType: RelationType;
    targetFieldLabel: string;
    targetFieldIcon: string;
    dryRun: boolean;
  }): Promise<void> {
    const sourceObject = await this.objectMetadataRepository.findOne({
      where: { workspaceId, nameSingular: sourceObjectNameSingular },
      relations: ['fields'],
    });

    const targetObject = await this.objectMetadataRepository.findOne({
      where: { workspaceId, nameSingular: targetObjectNameSingular },
    });

    if (!isDefined(sourceObject) || !isDefined(targetObject)) {
      if (dryRun) {
        this.logger.log(
          `  [DRY RUN] would create relation "${sourceObjectNameSingular}.${fieldName} -> ${targetObjectNameSingular}" (one or both objects missing)`,
        );

        return;
      }

      throw new Error(
        `Cannot create relation "${sourceObjectNameSingular}.${fieldName} -> ${targetObjectNameSingular}": source or target object not found in workspace ${workspaceId}`,
      );
    }

    const existingField = (sourceObject.fields ?? []).find(
      (f) => f.name === fieldName,
    );

    if (isDefined(existingField)) {
      this.logger.log(
        `  ✓ Relation "${sourceObjectNameSingular}.${fieldName}" already exists`,
      );

      return;
    }

    if (dryRun) {
      this.logger.log(
        `  [DRY RUN] would create ${relationType} relation "${sourceObjectNameSingular}.${fieldName} -> ${targetObjectNameSingular}"`,
      );

      return;
    }

    this.logger.log(
      `  + Creating ${relationType} relation "${sourceObjectNameSingular}.${fieldName} -> ${targetObjectNameSingular}"`,
    );

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: [
        {
          type: FieldMetadataType.RELATION,
          name: fieldName,
          label: fieldLabel,
          icon: fieldIcon,
          objectMetadataId: sourceObject.id,
          relationCreationPayload: {
            type: relationType,
            targetFieldLabel,
            targetFieldIcon,
            targetObjectMetadataId: targetObject.id,
          },
        },
      ],
      workspaceId,
    });
  }
}
