import { Logger, Scope } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  computeFieldDiffsFromMapping,
  summarizeDiffs,
  type FieldDiff,
} from 'src/modules/reconciliation/engines/diff';
import {
  buildMatchIndexes,
  buildMatchInputFromMapping,
  matchRow,
  DEFAULT_MATCHING_CONFIG,
  type MatchingConfig,
} from 'src/modules/reconciliation/engines/matching';
import {
  buildStatusInputFromMapping,
  deriveStatus,
  getCancelExpireDate,
  type OmniaStatus,
  type StatusEngineConfig,
} from 'src/modules/reconciliation/engines/status';
import {
  deriveCategory,
  deriveFlags,
} from 'src/modules/reconciliation/types/field-config';
import { resolveFieldMapping } from 'src/modules/reconciliation/parsers/transforms';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import type {
  ColumnMapping,
  ReconciliationJobData,
  StatusConfig,
  ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

const DEFAULT_START_DATE = '2025-07-09';

type PendingItem = {
  row: Record<string, unknown>;
  rowIndex: number;
  derivedStatus: string | null;
  currentCrmStatus: string | null;
  derivedExpireDate: string | null;
  cancelPreviousPolicyId: string | null;
  statusChangeReason: string | null;
  matchedPolicyId: string;
  record: Record<string, unknown>;
};

@Processor({
  queueName: MessageQueue.reconciliationQueue,
  scope: Scope.REQUEST,
})
export class ReconciliationMatchJob {
  private readonly logger = new Logger(ReconciliationMatchJob.name);

  constructor(
    private readonly dataService: ReconciliationDataService,
    private readonly attachmentService: ReconciliationAttachmentService,
    private readonly stateMachine: ReconciliationStateMachineService,
    private readonly reviewItemService: ReviewItemService,
  ) {}

  @Process('reconciliation-match')
  async handle({
    workspaceId,
    reconciliationId,
  }: ReconciliationJobData): Promise<void> {
    this.logger.log(
      `Starting match for reconciliation ${reconciliationId}`,
    );

    try {
      // --- Setup ---
      const reconciliation = await this.dataService.getReconciliation(
        workspaceId,
        reconciliationId,
      );

      if (!reconciliation.carrierConfigId) {
        throw new Error('No carrier config linked to this reconciliation');
      }

      const carrierConfig = await this.dataService.getCarrierConfig(
        workspaceId,
        reconciliation.carrierConfigId,
      );

      const columnMapping = reconciliation.columnMapping as ColumnMapping;

      if (!columnMapping || Object.keys(columnMapping).length === 0) {
        throw new Error(
          'Reconciliation has no column mapping. The import dialog must capture column matches before the pipeline can run.',
        );
      }

      const carrierName = carrierConfig.name ?? 'Unknown';
      const parserId = carrierConfig.parserVersion ?? 'ambetter-bob-v1';
      const matchingConfig: MatchingConfig =
        (carrierConfig.matchingConfig as MatchingConfig) ??
        DEFAULT_MATCHING_CONFIG;

      // Policy number validation pattern from carrier config (e.g., "^U" for Ambetter)
      const policyNumberPattern = carrierConfig.policyNumberPattern
        ? new RegExp(carrierConfig.policyNumberPattern as string, 'i')
        : null;

      const statusConfig = carrierConfig.statusConfig as StatusConfig | null;
      const rawStatusFieldMapping = statusConfig?.fieldMapping ?? {};

      // fieldConfig stores ComputedFieldDef[] directly (or null)
      const computedFields =
        (carrierConfig.fieldConfig as ComputedFieldDef[] | null) ?? null;
      const computedFieldCrmFields = computedFields
        ? Object.fromEntries(
            computedFields
              .filter((cf) => cf.crmField)
              .map((cf) => [cf.outputKey, cf.crmField!]),
          )
        : undefined;

      // Read parsed data
      const parsedRows = await this.attachmentService.readParsedData(
        workspaceId,
        reconciliationId,
      );

      // Resolve statusFieldMapping headers against actual file headers
      // (safety net — import dialog should have already resolved these)
      const sampleRow =
        parsedRows.length > 0
          ? (parsedRows[0] as Record<string, unknown>)
          : {};
      const statusFieldMapping = resolveFieldMapping(
        rawStatusFieldMapping,
        Object.keys(sampleRow),
      );

      // Fetch CRM policies
      const policies = await this.dataService.fetchPoliciesForMatching(
        workspaceId,
        carrierConfig.carrierId,
      );

      const matchIndexes = buildMatchIndexes(policies);
      const policyNumberMap = matchIndexes.policyByNumber;
      const today = new Date();

      // Load match overrides from previous reconciliation runs
      const overrideRecords = await this.reviewItemService.fetchOverrides(
        workspaceId,
        carrierName,
      );
      const overrides = overrideRecords.map((o) => ({
        carrierPolicyNumber: o.policyNumber,
        carrierName: o.carrierName,
        crmPolicyId: o.crmPolicyId,
        isActive: true,
      }));

      this.logger.log(
        `Matching: ${parsedRows.length} BOB rows against ${policies.length} CRM policies (${overrides.length} overrides)`,
      );

      // --- PILLAR 1: Matching + Status ---
      let autoMatched = 0;
      let needsReview = 0;
      let unmatched = 0;
      let confirmed = 0;
      let discrepanciesFound = 0;
      const reviewItems: Record<string, unknown>[] = [];
      const pendingItems: PendingItem[] = [];

      // Precompute lookups from column mapping
      const effDateHeader = Object.entries(columnMapping).find(
        ([, e]) => e.crmField === 'effectiveDate',
      )?.[0];

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i] as Record<string, unknown>;

        // Skip rows before the configured start date
        const startDate = matchingConfig.startDate ?? DEFAULT_START_DATE;
        const policyEffDate = effDateHeader
          ? (row[effDateHeader] as string | null)
          : null;

        if (policyEffDate && policyEffDate < startDate) {
          continue;
        }

        const matchInput = buildMatchInputFromMapping(
          row,
          columnMapping,
          computedFieldCrmFields,
        );

        // Skip rows with invalid policy numbers (carrier-configurable pattern)
        if (
          policyNumberPattern &&
          matchInput.policyNumber &&
          !policyNumberPattern.test(matchInput.policyNumber)
        ) {
          continue;
        }

        const decision = matchRow(
          matchInput,
          matchIndexes,
          overrides,
          carrierName,
          matchingConfig,
        );

        // Status derivation for matched rows
        let derivedStatus: string | null = null;
        let currentCrmStatus: string | null = null;
        let derivedExpireDate: string | null = null;
        let cancelPreviousPolicyId: string | null = null;
        let statusChangeReason: string | null = null;

        if (decision.crmPolicyId) {
          const matchedPolicy = matchIndexes.policyById.get(
            decision.crmPolicyId,
          );

          currentCrmStatus = matchedPolicy?.status ?? null;

          const policyNumber = matchInput.policyNumber;
          const allPoliciesForNumber = policyNumber
            ? policyNumberMap.get(policyNumber) ?? []
            : [];

          const statusEngineConfig: StatusEngineConfig = {
            placedThresholdDays: matchingConfig.placedThresholdDays ?? 30,
            paymentErrorAgeDays: matchingConfig.paymentErrorAgeDays ?? 10,
          };

          const statusInputData = buildStatusInputFromMapping(
            row,
            statusFieldMapping,
          );

          const statusResult = deriveStatus(
            parserId,
            statusInputData,
            allPoliciesForNumber,
            today,
            statusEngineConfig,
          );

          if (statusResult) {
            derivedStatus = statusResult.derivedStatus;
            derivedExpireDate = statusResult.derivedExpireDate;
            cancelPreviousPolicyId = statusResult.cancelPreviousPolicyId;
            statusChangeReason = statusResult.statusChangeReason;
          }
        }

        const policyLabel = matchInput.policyNumber ?? 'unknown';
        const crmLabel = decision.crmPolicyNumber ?? 'none';

        if (decision.status === 'UNMATCHED') {
          // --- UNMATCHED: create review item immediately ---
          let enrichedNotes = decision.notes;
          const brokerEffDateKey =
            statusFieldMapping.effectiveDate ?? 'effectiveDate';
          const paidThruKey =
            statusFieldMapping.paidThroughDate ?? 'paidThroughDate';
          const eligibleKey =
            statusFieldMapping.eligibleForCommission ??
            'eligibleForCommission';
          const brokerEffDate = row[brokerEffDateKey] as string | null;

          if (brokerEffDate) {
            const brokerEff = new Date(brokerEffDate);
            const paidThruVal = row[paidThruKey];
            const paidThru = paidThruVal
              ? new Date(paidThruVal as string)
              : null;
            const oneDayBefore = new Date(brokerEff);

            oneDayBefore.setDate(oneDayBefore.getDate() - 1);

            if (row[eligibleKey] === false) {
              enrichedNotes += '. CANCELED — flag for audit research';
            } else if (
              paidThru &&
              paidThru.getTime() < oneDayBefore.getTime()
            ) {
              enrichedNotes += `. PAID BEFORE BROKER EFFECTIVE (paid thru ${paidThruVal}, broker eff ${brokerEffDate}) — flag for audit research`;
            } else {
              enrichedNotes += `. ACTIVE policy not in CRM (broker eff ${brokerEffDate}) — needs CRM record`;
            }
          }

          reviewItems.push({
            name: `${policyLabel} → ${crmLabel}`,
            confidence: decision.confidence,
            matchMethod: decision.method,
            matchNotes: enrichedNotes,
            derivedStatus,
            currentCrmStatus,
            statusChangeReason,
            decision: 'PENDING',
            fieldDiffs: null,
            bobRowSnapshot: row,
            reconciliationId,
            policyId: null,
            category: 'UNMATCHED',
            flags: deriveFlags(
              derivedStatus,
              currentCrmStatus,
              decision.method,
              [],
              statusFieldMapping,
              row,
            ),
            summary: '',
          });

          unmatched++;
        } else {
          // --- MATCHED: defer to pendingItems, create record after diffs ---
          pendingItems.push({
            row,
            rowIndex: -1, // not in reviewItems yet
            derivedStatus,
            currentCrmStatus,
            derivedExpireDate,
            cancelPreviousPolicyId,
            statusChangeReason,
            matchedPolicyId: decision.crmPolicyId!,
            record: {
              name: `${policyLabel} → ${crmLabel}`,
              confidence: decision.confidence,
              matchMethod: decision.method,
              matchNotes: decision.notes,
              derivedStatus,
              currentCrmStatus,
              statusChangeReason,
              decision: 'PENDING',
              fieldDiffs: null as FieldDiff[] | null,
              bobRowSnapshot: row,
              reconciliationId,
              policyId: decision.crmPolicyId,
              category: 'UPDATE',
              flags: [] as string[],
              summary: '',
            },
          });

          if (decision.status === 'AUTO_MATCHED') autoMatched++;
          else needsReview++;
        }
      }

      // --- DEDUP: When multiple BOB rows match the same CRM policy, keep
      //     only the newest effective date. Older rows are handled by the
      //     cancel-previous-version logic. ---
      const byPolicyId = new Map<string, PendingItem[]>();

      for (const item of pendingItems) {
        const existing = byPolicyId.get(item.matchedPolicyId) ?? [];

        existing.push(item);
        byPolicyId.set(item.matchedPolicyId, existing);
      }

      const dedupedItems: PendingItem[] = [];

      for (const [, items] of byPolicyId) {
        if (items.length === 1) {
          dedupedItems.push(items[0]);
          continue;
        }

        const effKey = statusFieldMapping.effectiveDate ?? 'effectiveDate';

        items.sort((a, b) => {
          const aEff = (a.row[effKey] as string) ?? '';
          const bEff = (b.row[effKey] as string) ?? '';

          return bEff.localeCompare(aEff);
        });

        dedupedItems.push(items[0]);

        this.logger.log(
          `Dedup: kept newest of ${items.length} BOB rows for policy ${items[0].matchedPolicyId}`,
        );
      }

      // --- PILLAR 2: Enrich matched policies + compute diffs ---
      const uniqueMatchedIds = [
        ...new Set(dedupedItems.map((p) => p.matchedPolicyId)),
      ];

      if (uniqueMatchedIds.length > 0) {
        this.logger.log(
          `Enriching ${uniqueMatchedIds.length} matched policies for diff computation`,
        );

        const enrichedMap = await this.dataService.enrichMatchedPolicies(
          workspaceId,
          uniqueMatchedIds,
        );

        for (const pending of dedupedItems) {
          const matchedPolicy = matchIndexes.policyById.get(
            pending.matchedPolicyId,
          );

          if (!matchedPolicy) continue;

          const enriched = enrichedMap.get(pending.matchedPolicyId);

          const policyForDiff: Record<string, unknown> = {
            status: matchedPolicy.status,
            expirationDate: matchedPolicy.expirationDate,
            effectiveDate: matchedPolicy.effectiveDate,
            policyNumber: matchedPolicy.policyNumber,
            applicantCount: matchedPolicy.applicantCount,
            planIdentifier: enriched?.planIdentifier ?? null,
            leadFirstName: matchedPolicy.leadFirstName,
            leadLastName: matchedPolicy.leadLastName,
            leadDob: matchedPolicy.leadDob,
            leadState: matchedPolicy.leadState,
            agentName: matchedPolicy.agentName,
            agentNpn: matchedPolicy.agentNpn,
            leadPhone: enriched?.leadPhone ?? null,
            leadEmail: enriched?.leadEmail ?? null,
          };

          const statusResult =
            pending.derivedStatus != null
              ? {
                  derivedStatus: pending.derivedStatus as OmniaStatus,
                  derivedExpireDate: pending.derivedExpireDate,
                  cancelPreviousPolicyId: pending.cancelPreviousPolicyId,
                  statusChangeReason: pending.statusChangeReason ?? '',
                }
              : null;

          const diffs = computeFieldDiffsFromMapping(
            pending.row,
            policyForDiff,
            statusResult,
            columnMapping,
            computedFields,
          );

          // Section 4.3: if there's a previous version to cancel, add a
          // synthetic diff for UI visibility and persist metadata for apply step
          if (pending.cancelPreviousPolicyId) {
            const effDateVal = pending.row[
              statusFieldMapping.effectiveDate ?? 'effectiveDate'
            ] as string | undefined;
            const cancelExpireDate = effDateVal
              ? getCancelExpireDate(effDateVal)
              : null;

            diffs.push({
              field: '__cancelPreviousPolicy',
              label: 'Cancel Previous Version',
              bobValue: cancelExpireDate
                ? `Canceled as of ${cancelExpireDate}`
                : 'Cancel previous version',
              crmValue: null,
              action: 'COMPUTED',
              severity: 'CRITICAL',
              approval: 'PENDING',
              crmField: null,
              crmObjectType: null,
              note: `Previous policy ${pending.cancelPreviousPolicyId} will be set to CANCELED`,
            });
          }

          // Derive category — returns null for confirmed (no diffs, status agrees)
          const category = deriveCategory(
            false,
            diffs,
            pending.derivedStatus,
            pending.currentCrmStatus,
          );

          if (category === null) {
            // Confirmed: no diffs, status matches — skip creating review item
            confirmed++;
            continue;
          }

          // Has changes — derive flags and push to review items
          pending.record.fieldDiffs = diffs;
          pending.record.summary = summarizeDiffs(diffs);
          pending.record.category = category;
          pending.record.flags = deriveFlags(
            pending.derivedStatus,
            pending.currentCrmStatus,
            pending.record.matchMethod as string,
            diffs,
            statusFieldMapping,
            pending.row,
          );

          // Persist cancel metadata in the snapshot for the apply step
          if (pending.cancelPreviousPolicyId) {
            const effDateVal = pending.row[
              statusFieldMapping.effectiveDate ?? 'effectiveDate'
            ] as string | undefined;

            pending.record.bobRowSnapshot = {
              ...pending.row,
              __cancelPreviousPolicyId: pending.cancelPreviousPolicyId,
              __cancelExpireDate: effDateVal
                ? getCancelExpireDate(effDateVal)
                : null,
            };
          }

          reviewItems.push(pending.record);
          discrepanciesFound++;
        }

        this.logger.log(
          `Diff enrichment complete: ${discrepanciesFound} updates, ${confirmed} confirmed (skipped)`,
        );
      }

      // --- Store reviewItem records + update reconciliation status ---
      // Delete any existing items first (idempotent on re-run)
      const existingCount =
        await this.reviewItemService.deleteByReconciliation(
          workspaceId,
          reconciliationId,
        );

      if (existingCount > 0) {
        this.logger.warn(
          `Deleted ${existingCount} existing review items (re-run)`,
        );
      }

      await this.reviewItemService.batchCreate(workspaceId, reviewItems);

      await this.stateMachine.transition(
        workspaceId,
        reconciliationId,
        'MATCHING',
        'REVIEW',
        {
          matchedAt: new Date().toISOString(),
          stats: {
            totalBobRows: parsedRows.length,
            autoMatched,
            needsReview,
            unmatched,
            missingFromBob: 0,
            discrepanciesFound,
            applied: 0,
            failed: 0,
            skipped: 0,
          },
        },
      );

      this.logger.log(
        `Match complete for ${reconciliationId}: ${autoMatched} auto-matched, ${needsReview} needs review, ${unmatched} unmatched, ${confirmed} confirmed (skipped), ${discrepanciesFound} updates out of ${parsedRows.length}`,
      );
    } catch (error) {
      await this.stateMachine.setFailed(
        workspaceId,
        reconciliationId,
        'MATCH',
        error,
      );

      throw error;
    }
  }
}
