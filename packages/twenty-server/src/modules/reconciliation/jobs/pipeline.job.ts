import { Logger, Scope } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { parseXlsxSheet } from 'src/modules/reconciliation/parsers/xlsx';
import { getGenericParser } from 'src/modules/reconciliation/parsers/registry';
import { PIPELINE_FIELD_SCHEMA } from 'src/modules/reconciliation/config/pipeline-field-schema';
import {
  buildMatchIndexes,
  buildMatchInput,
  matchRow,
  DEFAULT_MATCHING_CONFIG,
  resolveMatchingConfig,
  type MatchingConfig,
  type MatchIndexes,
} from 'src/modules/reconciliation/engines/matching';
import {
  buildStatusInput,
  deriveStatus,
  type StatusDecision,
  type StatusEngineConfig,
} from 'src/modules/reconciliation/engines/status';
import {
  computeFieldDiffs,
  summarizeDiffs,
} from 'src/modules/reconciliation/engines/diff';
import {
  deriveCategory,
  deriveFlags,
  mergeFieldConfig,
  resolveFieldConfig,
  type FieldConfigEntry,
  type ReviewItemInput,
} from 'src/modules/reconciliation/types/field-config';
import type {
  CarrierConfigRecord,
  GenericRow,
  ReconciliationJobData,
  ReconciliationStats,
} from 'src/modules/reconciliation/types/reconciliation';
import { DEFAULT_START_DATE } from 'src/modules/reconciliation/types/reconciliation';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';

// ---------------------------------------------------------------------------
// Local types (pipeline-internal, not shared)
// ---------------------------------------------------------------------------

type PendingEnrichment = {
  row: GenericRow;
  itemIndex: number;
  statusDecision: StatusDecision | null;
  currentCrmStatus: string | null;
  matchedPolicyId: string;
  item: ReviewItemInput;
};

// ---------------------------------------------------------------------------
// Pipeline job — merges parse + match into a single atomic operation.
//
// Heavy XLSX objects are scoped to parseSourceFile() so they become
// GC-eligible before matching begins.
// ---------------------------------------------------------------------------

@Processor({
  queueName: MessageQueue.reconciliationQueue,
  scope: Scope.REQUEST,
})
export class ReconciliationPipelineJob {
  private readonly logger = new Logger(ReconciliationPipelineJob.name);

  constructor(
    private readonly dataService: ReconciliationDataService,
    private readonly attachmentService: ReconciliationAttachmentService,
    private readonly stateMachine: ReconciliationStateMachineService,
    private readonly reviewItemService: ReviewItemService,
  ) {}

  @Process('reconciliation-pipeline')
  async handle({
    workspaceId,
    reconciliationId,
  }: ReconciliationJobData): Promise<void> {
    this.logger.log(
      `Starting pipeline for reconciliation ${reconciliationId}`,
    );

    try {
      // 1. Load reconciliation + carrier config
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

      const startedFromParsing = reconciliation.status === 'PARSING';
      const carrierFieldConfig = resolveFieldConfig(
        carrierConfig.fieldConfig,
      );
      const fieldConfig = mergeFieldConfig(
        PIPELINE_FIELD_SCHEMA,
        carrierFieldConfig,
      );
      const matchingConfig = resolveMatchingConfig(
        carrierConfig.matchingConfig,
        DEFAULT_MATCHING_CONFIG,
      );

      // 2. Parse XLSX (heavy objects scoped to helper — GC-eligible on return)
      const { normalized, errors: parseErrors } =
        await this.parseSourceFile(
          workspaceId,
          reconciliationId,
          reconciliation.sheetName ?? undefined,
          fieldConfig,
        );

      if (parseErrors.length > 0) {
        this.logger.warn(
          `${parseErrors.length} parse error(s): ${parseErrors
            .slice(0, 5)
            .map((e) => `row ${e.row}: ${e.error}`)
            .join('; ')}`,
        );
      }

      this.logger.log(`Parsed ${normalized.length} rows from XLSX`);

      // 3. Transition PARSING → MATCHING (skipped on re-runs from MATCHING)
      if (startedFromParsing) {
        await this.stateMachine.transition(
          workspaceId,
          reconciliationId,
          'PARSING',
          'MATCHING',
          { parsedAt: new Date().toISOString() },
        );
      }

      // 4. Match, derive status, build review items, compute diffs
      const { reviewItems, stats } = await this.matchAndEnrich(
        workspaceId,
        reconciliationId,
        normalized,
        fieldConfig,
        matchingConfig,
        carrierConfig,
      );

      // 5. Persist review items
      await this.reviewItemService.batchCreate(workspaceId, reviewItems);

      // 6. Transition MATCHING → REVIEW
      await this.stateMachine.transition(
        workspaceId,
        reconciliationId,
        'MATCHING',
        'REVIEW',
        {
          matchedAt: new Date().toISOString(),
          stats,
        },
      );

      this.logger.log(
        `Pipeline complete for ${reconciliationId}: ${stats.autoMatched} auto-matched, ${stats.needsReview} needs review, ${stats.unmatched} unmatched, ${stats.discrepanciesFound} discrepancies out of ${normalized.length}`,
      );
    } catch (error) {
      await this.stateMachine.setFailed(
        workspaceId,
        reconciliationId,
        'PIPELINE',
        error,
      );

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Parse — scoped method for memory isolation
  // ---------------------------------------------------------------------------

  private async parseSourceFile(
    workspaceId: string,
    reconciliationId: string,
    sheetName: string | undefined,
    fieldConfig: FieldConfigEntry[],
  ): Promise<{
    normalized: GenericRow[];
    errors: Array<{ row: number; error: string }>;
  }> {
    const fileBuffer = await this.attachmentService.readSourceFile(
      workspaceId,
      reconciliationId,
    );
    const rawRows = parseXlsxSheet(fileBuffer, sheetName);
    const parser = getGenericParser();

    return parser(rawRows, fieldConfig);
    // fileBuffer, rawRows, SheetJS internals all leave scope here
  }

  // ---------------------------------------------------------------------------
  // Match + enrich
  // ---------------------------------------------------------------------------

  private async matchAndEnrich(
    workspaceId: string,
    reconciliationId: string,
    parsedRows: GenericRow[],
    fieldConfig: FieldConfigEntry[],
    matchingConfig: MatchingConfig,
    carrierConfig: CarrierConfigRecord,
  ): Promise<{ reviewItems: ReviewItemInput[]; stats: ReconciliationStats }> {
    const carrierName = carrierConfig.name ?? 'Unknown';
    const parserId = carrierConfig.parserVersion ?? 'ambetter-bob-v1';

    const policies = await this.dataService.fetchPoliciesForMatching(
      workspaceId,
      carrierConfig.carrierId,
    );
    const matchIndexes = buildMatchIndexes(policies);
    const today = new Date();
    const startDate = matchingConfig.startDate ?? DEFAULT_START_DATE;

    this.logger.log(
      `Matching: ${parsedRows.length} BOB rows against ${policies.length} CRM policies`,
    );

    // --- PILLAR 1: Matching + Status ---
    let autoMatched = 0;
    let needsReview = 0;
    let unmatched = 0;
    const reviewItems: ReviewItemInput[] = [];
    const pendingEnrichments: PendingEnrichment[] = [];

    for (const row of parsedRows) {
      const policyEffDate = row.policyEffectiveDate;

      if (typeof policyEffDate === 'string' && policyEffDate < startDate) {
        continue;
      }

      const matchInput = buildMatchInput(row, fieldConfig);

      const decision = matchRow(
        matchInput,
        matchIndexes,
        [],
        carrierName,
        matchingConfig,
      );

      // Status derivation for matched rows
      let statusDecision: StatusDecision | null = null;
      let currentCrmStatus: string | null = null;

      if (decision.crmPolicyId) {
        const matchedPolicy = matchIndexes.policyById.get(
          decision.crmPolicyId,
        );

        currentCrmStatus = matchedPolicy?.status ?? null;

        const policyNumber = matchInput.policyNumber;
        const allPoliciesForNumber = policyNumber
          ? matchIndexes.policyByNumber.get(policyNumber) ?? []
          : [];

        const statusEngineConfig: StatusEngineConfig = {
          placedThresholdDays: matchingConfig.placedThresholdDays ?? 30,
          paymentErrorAgeDays: matchingConfig.paymentErrorAgeDays ?? 10,
        };

        const statusInputData = buildStatusInput(row, fieldConfig);

        statusDecision = deriveStatus(
          parserId,
          statusInputData,
          allPoliciesForNumber,
          today,
          statusEngineConfig,
        );
      }

      // Enrich unmatched row notes
      let enrichedNotes = decision.notes;

      if (decision.method === 'UNMATCHED') {
        enrichedNotes = this.enrichUnmatchedNotes(row, enrichedNotes);
      }

      const derivedStatus = statusDecision?.derivedStatus ?? null;
      const policyLabel = matchInput.policyNumber ?? 'unknown';
      const crmLabel = decision.crmPolicyNumber ?? 'none';

      const item: ReviewItemInput = {
        name: `${policyLabel} → ${crmLabel}`,
        confidence: decision.confidence,
        matchMethod: decision.method,
        matchNotes: enrichedNotes,
        derivedStatus,
        currentCrmStatus,
        statusChangeReason: statusDecision?.statusChangeReason ?? null,
        decision: 'PENDING',
        fieldDiffs: null,
        bobRowSnapshot: row,
        reconciliationId,
        policyId: decision.crmPolicyId,
        category:
          decision.status === 'UNMATCHED'
            ? 'UNMATCHED'
            : decision.status === 'NEEDS_REVIEW'
              ? 'NEEDS_REVIEW'
              : 'CONFIRMED',
        flags: deriveFlags(
          derivedStatus,
          currentCrmStatus,
          decision.method,
          row,
        ),
        summary: '',
      };

      reviewItems.push(item);

      if (decision.crmPolicyId) {
        pendingEnrichments.push({
          row,
          itemIndex: reviewItems.length - 1,
          statusDecision,
          currentCrmStatus,
          matchedPolicyId: decision.crmPolicyId,
          item,
        });
      }

      if (decision.status === 'AUTO_MATCHED') autoMatched++;
      else if (decision.status === 'NEEDS_REVIEW') needsReview++;
      else unmatched++;
    }

    // --- PILLAR 2: Enrich matched policies + compute diffs ---
    const discrepanciesFound = await this.enrichWithDiffs(
      workspaceId,
      pendingEnrichments,
      matchIndexes,
      fieldConfig,
    );

    this.logger.log(
      `Diff enrichment complete: ${discrepanciesFound} discrepancies found`,
    );

    const stats: ReconciliationStats = {
      totalBobRows: parsedRows.length,
      autoMatched,
      needsReview,
      unmatched,
      missingFromBob: 0,
      discrepanciesFound,
      applied: 0,
      failed: 0,
      skipped: 0,
    };

    return { reviewItems, stats };
  }

  // ---------------------------------------------------------------------------
  // Diff enrichment
  // ---------------------------------------------------------------------------

  private async enrichWithDiffs(
    workspaceId: string,
    pendingEnrichments: PendingEnrichment[],
    matchIndexes: MatchIndexes,
    fieldConfig: FieldConfigEntry[],
  ): Promise<number> {
    const uniqueMatchedIds = [
      ...new Set(pendingEnrichments.map((p) => p.matchedPolicyId)),
    ];

    if (uniqueMatchedIds.length === 0) {
      return 0;
    }

    this.logger.log(
      `Enriching ${uniqueMatchedIds.length} matched policies for diff computation`,
    );

    const enrichedMap = await this.dataService.enrichMatchedPolicies(
      workspaceId,
      uniqueMatchedIds,
    );

    let discrepanciesFound = 0;

    for (const pending of pendingEnrichments) {
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
        planIdentifier: enriched?.planIdentifier ?? null,
        leadFirstName: matchedPolicy.leadFirstName,
        leadLastName: matchedPolicy.leadLastName,
        leadDob: matchedPolicy.leadDob,
        agentName: matchedPolicy.agentName,
        agentNpn: matchedPolicy.agentNpn,
        leadPhone: enriched?.leadPhone ?? null,
        leadEmail: enriched?.leadEmail ?? null,
      };

      const diffs = computeFieldDiffs(
        pending.row,
        policyForDiff,
        pending.statusDecision,
        fieldConfig,
      );

      if (diffs.length > 0) {
        pending.item.fieldDiffs = diffs;
        pending.item.summary = summarizeDiffs(diffs);
        pending.item.category = deriveCategory('AUTO_MATCHED', diffs);
        discrepanciesFound++;
      }
    }

    return discrepanciesFound;
  }

  // ---------------------------------------------------------------------------
  // Unmatched note enrichment
  // ---------------------------------------------------------------------------

  private enrichUnmatchedNotes(row: GenericRow, notes: string): string {
    const brokerEffRaw = row.brokerEffectiveDate;

    if (typeof brokerEffRaw !== 'string') {
      return notes;
    }

    const brokerEff = new Date(brokerEffRaw);
    const paidThruRaw = row.paidThroughDate;
    const paidThru =
      typeof paidThruRaw === 'string' ? new Date(paidThruRaw) : null;
    const oneDayBefore = new Date(brokerEff);

    oneDayBefore.setDate(oneDayBefore.getDate() - 1);

    if (row.eligibleForCommission === false) {
      return `${notes}. CANCELED — flag for audit research`;
    }

    if (paidThru && paidThru.getTime() < oneDayBefore.getTime()) {
      return `${notes}. PAID BEFORE BROKER EFFECTIVE (paid thru ${paidThruRaw}, broker eff ${brokerEffRaw}) — flag for audit research`;
    }

    return `${notes}. ACTIVE policy not in CRM (broker eff ${brokerEffRaw}) — needs CRM record`;
  }
}
