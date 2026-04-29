// OMNIA-CUSTOM: Seeds the Ambetter CarrierConfig record used by the
// reconciliation pipeline. Idempotent — safe to re-run.
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
import { DEFAULT_AMBETTER_COLUMN_MAPPING } from 'src/modules/reconciliation/parsers/ambetter';
import { AMBETTER_FIELD_CONFIG } from 'src/modules/reconciliation/config/ambetter.field-config';

// ---------------------------------------------------------------------------
// Transform rules for Ambetter BOBs
// ---------------------------------------------------------------------------

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

const AMBETTER_TRANSFORM_RULES: Record<string, unknown> = {
  dates: {
    format: ['MM/DD/YYYY', 'M/D/YYYY', 'YYYY-MM-DD'],
    excelSerial: true,
  },
  trueEffectiveDate: {
    derivedFrom: ['brokerEffectiveDate', 'policyEffectiveDate'],
    rule: 'MAX',
  },
  eligibleForCommission: {
    booleanMapping: { yes: true, no: false },
  },
  currency: {
    stripSymbols: ['$', ','],
    fields: ['monthlyPremium', 'memberResponsibility'],
  },
};

// ---------------------------------------------------------------------------
// Status rules (keyed by parserId)
// ---------------------------------------------------------------------------

const AMBETTER_STATUS_RULES: Record<string, unknown> = {
  'ambetter-bob-v1': {
    ...DEFAULT_STATUS_ENGINE_CONFIG,
    description:
      'Ambetter status derivation: eligible=No→CANCELED, termDate past→CANCELED, ' +
      'otherwise compute placed/approved/payment-error from effective↔paidThrough gap.',
  },
};

// ---------------------------------------------------------------------------
// Explanation templates for the review UI
// ---------------------------------------------------------------------------

const AMBETTER_EXPLANATION_RULES: Record<string, unknown> = {
  statusChange: {
    'ACTIVE_APPROVED→CANCELED':
      'This policy was previously active but the carrier now reports it as canceled.',
    'ACTIVE_APPROVED→ACTIVE_PLACED':
      'Policy has been active long enough to be considered "placed" (30+ days).',
    'ACTIVE_APPROVED→PAYMENT_ERROR_ACTIVE_PLACED':
      'Policy is placed but has a payment error — paid-through date is stale.',
    'ACTIVE_APPROVED→PAYMENT_ERROR_ACTIVE_APPROVED':
      'Policy is approved but has a payment error — paid-through date is stale.',
    'ACTIVE_PLACED→CANCELED':
      'Previously placed policy is now canceled per the carrier BOB.',
    '*→CANCELED':
      'Carrier reports this policy is no longer active.',
  },
  fieldChange: {
    effectiveDate: 'The carrier reports a different effective date than what the CRM has.',
    policyNumber: 'The carrier assigned a different policy number than what the CRM has.',
    memberName: 'Member name differs between the carrier BOB and the CRM record.',
  },
};

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

@Command({
  name: 'workspace:seed-ambetter-carrier-config',
  description:
    'Insert the Ambetter CarrierConfig record with column mappings, matching thresholds, and status rules. Idempotent.',
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

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
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
            `  ✓ Ambetter CarrierConfig already exists (id=${(existing as any).id}). Updating fields...`,
          );

          if (isDryRun) {
            this.logger.log('  [DRY RUN] would update existing record');

            return;
          }

          await carrierConfigRepo.update(
            { id: (existing as any).id },
            {
              parserVersion: 'ambetter-bob-v1',
              fieldConfig: [
                {
                  outputKey: 'True Effective Date',
                  method: 'maxDate',
                  inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
                  type: 'date',
                  crmField: 'effectiveDate',
                },
              ],
              matchingConfig: DEFAULT_MATCHING_CONFIG,
              productMapping: AMBETTER_PRODUCT_MAPPING,
              statusConfig: {
                ...DEFAULT_STATUS_ENGINE_CONFIG,
                engineId: 'ambetter-bob-v1',
                fieldMapping: {
                  effectiveDate: 'True Effective Date',
                  paidThroughDate: 'Paid Through Date',
                  termDate: 'Policy Term Date',
                  eligibleForCommission: 'Eligible for Commission',
                  brokerEffectiveDate: 'Broker Effective Date',
                  policyEffectiveDate: 'Policy Effective Date',
                },
              },
              policyNumberPattern: '^U',
              // Legacy fields — kept for backward compat, cleared on next run
              columnMapping: DEFAULT_AMBETTER_COLUMN_MAPPING,
              transformRules: AMBETTER_TRANSFORM_RULES,
              statusRules: AMBETTER_STATUS_RULES,
              explanationRules: AMBETTER_EXPLANATION_RULES,
            },
          );

          this.logger.log('  ✓ Updated Ambetter CarrierConfig');

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
          const carrierRepo =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'carrier',
              { shouldBypassPermissionChecks: true },
            );

          const ambetterCarrier = await carrierRepo.findOne({
            where: { name: 'Ambetter' } as any,
          });

          if (ambetterCarrier) {
            carrierId = (ambetterCarrier as any).id;
            this.logger.log(
              `  Found Ambetter carrier record (id=${carrierId})`,
            );
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
          parserVersion: 'ambetter-bob-v1',
          // fieldConfig stores ComputedFieldDef[] — derived fields the
          // parser computes from multiple columns. Inputs reference role
          // names from statusConfig.fieldMapping, NOT raw header names.
          fieldConfig: [
            {
              outputKey: 'True Effective Date',
              method: 'maxDate',
              inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
              type: 'date',
              crmField: 'effectiveDate',
            },
          ],
          matchingConfig: DEFAULT_MATCHING_CONFIG,
          statusConfig: {
            ...DEFAULT_STATUS_ENGINE_CONFIG,
            engineId: 'ambetter-bob-v1',
            // Status engine field mapping: role → XLSX column header
            fieldMapping: {
              effectiveDate: 'True Effective Date',
              paidThroughDate: 'Paid Through Date',
              termDate: 'Policy Term Date',
              eligibleForCommission: 'Eligible for Commission',
              brokerEffectiveDate: 'Broker Effective Date',
              policyEffectiveDate: 'Policy Effective Date',
            },
          },
          policyNumberPattern: '^U',
          productMapping: AMBETTER_PRODUCT_MAPPING,
          // Legacy fields — kept for backward compat
          columnMapping: DEFAULT_AMBETTER_COLUMN_MAPPING,
          transformRules: AMBETTER_TRANSFORM_RULES,
          statusRules: AMBETTER_STATUS_RULES,
          explanationRules: AMBETTER_EXPLANATION_RULES,
        };

        if (carrierId) {
          record.carrierId = carrierId;
        }

        await carrierConfigRepo.save(record);

        this.logger.log('  + Created Ambetter CarrierConfig record');
      },
      authContext,
    );
  }
}
