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
  type MatchingConfig,
  type Override,
} from 'src/modules/reconciliation/engines/matching';
import {
  buildBrokerEffAuditInput,
  buildStatusInputFromMapping,
  deriveBrokerEffAudit,
  deriveStatus,
  getCancelExpireDate,
  isKnownStatusEngine,
  resolveEffectiveDateHeader,
  STATUS_ENGINE_IDS,
  type OmniaStatus,
  type StatusEngineConfig,
} from 'src/modules/reconciliation/engines/status';
import {
  deriveCategory,
  deriveFlags,
} from 'src/modules/reconciliation/types/field-config';
import { parseCarrierPipelineConfig } from 'src/modules/reconciliation/types/carrier-config';
import { resolveFieldMapping } from 'src/modules/reconciliation/parsers/transforms';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import {
  buildPolicyForDiff,
  ReconciliationDataService,
} from 'src/modules/reconciliation/services/data.service';
import {
  ReconciliationStateMachineService,
  TransitionConflictError,
} from 'src/modules/reconciliation/services/state-machine.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';
import type {
  ColumnMapping,
  ReconciliationJobData,
  ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

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

/**
 * Bundled config + indexed data needed by every phase of the match job.
 * Built once by `loadMatchContext`; passed by reference to the per-row
 * loop, the dedup phase, and the diff-enrichment phase.
 *
 * Config fields come from the validated `parseCarrierPipelineConfig`
 * boundary (types/carrier-config.ts) — no raw carrier-config casts here.
 */
type MatchContext = {
  reconciliationId: string;
  carrierName: string;
  /** Validated against the engine registry in loadMatchContext (fail-fast). */
  statusEngineId: string;
  matchingConfig: MatchingConfig;
  /** Status-engine thresholds — read from statusConfig only (Phase 4.3). */
  statusEngineConfig: StatusEngineConfig;
  /** Effective-date cutoff; null = no cutoff (Phase 4.4). */
  startDate: string | null;
  policyNumberPattern: RegExp | null;
  columnMapping: ColumnMapping;
  statusFieldMapping: Record<string, string>;
  computedFields: ComputedFieldDef[] | null;
  computedFieldCrmFields: Record<string, string> | undefined;
  parsedRows: Record<string, unknown>[];
  matchIndexes: ReturnType<typeof buildMatchIndexes>;
  overrides: Override[];
  /** THE row key for a BOB row's effective date — single resolution shared
   *  by the start-date cutoff, dedup ordering, and cancel-expire stamping
   *  (resolveEffectiveDateHeader, Phase 4.5). */
  effDateHeader: string | undefined;
  policyNumberHeader: string | undefined;
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
    this.logger.log(`Starting match for reconciliation ${reconciliationId}`);

    try {
      // Status re-read guard (audit §"State machine is not compare-and-swap"):
      // only a run currently in MATCHING — set by the orchestrator or the
      // parse job's auto-chain just before enqueueing us — is ours to
      // process. Anything else means a stale or duplicate delivery; exit
      // cleanly so we never stomp a newer run's review items.
      const reconciliation = await this.dataService.getReconciliation(
        workspaceId,
        reconciliationId,
      );

      if (reconciliation.status !== 'MATCHING') {
        this.logger.warn(
          `Skipping match job for reconciliation ${reconciliationId}: ` +
            `status is ${reconciliation.status}, expected MATCHING (stale or duplicate delivery)`,
        );

        return;
      }

      const ctx = await this.loadMatchContext(workspaceId, reconciliationId);
      const {
        carrierName,
        statusEngineId,
        matchingConfig,
        statusEngineConfig,
        startDate,
        policyNumberPattern,
        columnMapping,
        statusFieldMapping,
        computedFieldCrmFields,
        parsedRows,
        matchIndexes,
        overrides,
        effDateHeader,
        policyNumberHeader,
      } = ctx;
      const policyNumberMap = matchIndexes.policyByNumber;
      const today = new Date();

      this.logger.log(
        `Matching: ${parsedRows.length} BOB rows against ${matchIndexes.policyById.size} CRM policies (${overrides.length} overrides)`,
      );

      // --- PILLAR 1: Matching + Status ---
      let autoMatched = 0;
      let needsReview = 0;
      let unmatched = 0;
      let confirmed = 0;
      let discrepanciesFound = 0;
      let skippedBeforeStartDate = 0;
      let skippedInvalidPolicyNumber = 0;
      const reviewItems: Record<string, unknown>[] = [];
      const pendingItems: PendingItem[] = [];

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i] as Record<string, unknown>;

        // Skip rows before the per-carrier start-date cutoff (null = no
        // cutoff). Counted into stats so operators can see why totals
        // diverge from processed rows.
        const policyEffDate = effDateHeader
          ? (row[effDateHeader] as string | null)
          : null;

        if (startDate && policyEffDate && policyEffDate < startDate) {
          skippedBeforeStartDate++;
          continue;
        }

        const matchInput = buildMatchInputFromMapping(
          row,
          columnMapping,
          computedFieldCrmFields,
          (xlsxHeader, crmField) =>
            this.logger.warn(
              `Unmapped matching-shaped column: "${xlsxHeader}" → "${crmField}" ` +
                `(close to a registered matching path; check carrier-config crmField for typos)`,
            ),
        );

        // Skip rows with invalid policy numbers (carrier-configurable
        // pattern). Counted into stats — see skippedBeforeStartDate.
        if (
          policyNumberPattern &&
          matchInput.policyNumber &&
          !policyNumberPattern.test(matchInput.policyNumber)
        ) {
          skippedInvalidPolicyNumber++;
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
            ? (policyNumberMap.get(policyNumber) ?? [])
            : [];

          const statusInputData = buildStatusInputFromMapping(
            row,
            statusFieldMapping,
          );

          // Engine id + thresholds come from the validated statusConfig
          // boundary only (Phase 4.3 — no more matchingConfig duplicates /
          // hardcoded 30/10 fallbacks).
          const statusResult = deriveStatus(
            statusEngineId,
            statusInputData,
            allPoliciesForNumber,
            today,
            statusEngineConfig,
            decision.crmPolicyId,
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
          // Jackie's-rule audit notes come from the SAME implementation as
          // deriveFlags' BROKER_EFF_AUDIT (deriveBrokerEffAudit, Phase 4.5),
          // so note text and flag can no longer contradict each other. The
          // old inline copy read statusFieldMapping.effectiveDate (Ambetter:
          // the computed True Effective Date) while labeling it "broker
          // eff", and skipped the brokerEff > policyEff precondition.
          let enrichedNotes = decision.notes;
          const auditInput = buildBrokerEffAuditInput(
            row,
            statusFieldMapping,
            derivedStatus,
          );
          const audit = deriveBrokerEffAudit(auditInput);

          if (audit.flagged) {
            enrichedNotes += `. ${audit.reason} — flag for audit research`;
          } else if (auditInput.eligibleForCommission === false) {
            // Preserved special case from the pre-4.5 unmatched branch: an
            // ineligible (carrier-canceled) row that does NOT meet Jackie's
            // precondition (brokerEff > policyEff) is still worth calling
            // out to reviewers — but it is informational, not an audit flag
            // (the reviewed deriveFlags semantics require the precondition).
            enrichedNotes += '. CANCELED in BOB — no CRM match';
          } else if (auditInput.brokerEffectiveDate) {
            enrichedNotes += `. ACTIVE policy not in CRM (broker eff ${auditInput.brokerEffectiveDate}) — needs CRM record`;
          }

          const unmatchedFlags = deriveFlags(
            derivedStatus,
            currentCrmStatus,
            decision.method,
            [],
            statusFieldMapping,
            row,
          );

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
            flags: unmatchedFlags.flags,
            flagReasons: unmatchedFlags.reasons,
            summary: '',
            // First-class identity columns (audit 1.2): policy number is
            // already resolved through columnMapping by
            // buildMatchInputFromMapping — no snapshot key guessing later.
            carrierPolicyNumber: matchInput.policyNumber ?? null,
            carrierName,
            cancelPreviousPolicyId,
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
              flagReasons: {} as Record<string, string>,
              summary: '',
              // First-class identity + cancel columns (audit 1.2). The
              // snapshot keeps its __cancel* stamps for backward compat with
              // items created before these columns existed.
              carrierPolicyNumber: matchInput.policyNumber ?? null,
              carrierName,
              cancelPreviousPolicyId,
            },
          });

          if (decision.status === 'AUTO_MATCHED') autoMatched++;
          else needsReview++;
        }
      }

      const dedupedItems = this.dedupPendingByPolicyId(
        pendingItems,
        effDateHeader,
      );

      const enrichResult = await this.enrichAndDiffMatchedItems(
        workspaceId,
        ctx,
        dedupedItems,
        reviewItems,
      );

      confirmed += enrichResult.confirmed;
      discrepanciesFound += enrichResult.discrepanciesFound;

      await this.persistMatchResults(
        workspaceId,
        reconciliationId,
        reviewItems,
        carrierName,
        policyNumberHeader,
        {
          totalBobRows: parsedRows.length,
          autoMatched,
          needsReview,
          unmatched,
          discrepanciesFound,
          skippedBeforeStartDate,
          skippedInvalidPolicyNumber,
        },
      );

      this.logger.log(
        `Match complete for ${reconciliationId}: ${autoMatched} auto-matched, ${needsReview} needs review, ${unmatched} unmatched, ${confirmed} confirmed (skipped), ${discrepanciesFound} updates out of ${parsedRows.length} ` +
          `(${skippedBeforeStartDate} skipped before start date, ${skippedInvalidPolicyNumber} skipped by policy-number pattern)`,
      );
    } catch (error) {
      if (error instanceof TransitionConflictError) {
        // A concurrent writer won a CAS transition (manual restart, stuck-run
        // recovery, or duplicate delivery) — the run belongs to someone else
        // now. Exit cleanly: calling setFailed here would stomp their state.
        this.logger.warn(
          `Match job for reconciliation ${reconciliationId} exiting cleanly on transition conflict: ${error.message}`,
        );

        return;
      }

      await this.stateMachine.setFailed(
        workspaceId,
        reconciliationId,
        'MATCH',
        error,
      );

      throw error;
    }
  }

  /**
   * Idempotent and non-destructive: reconcile the new match output against
   * existing review items by stable row identity (decided items survive
   * re-runs untouched, PENDING ones are refreshed or removed — see
   * ReviewItemService.reconcileMatchResults), then transition the
   * reconciliation to REVIEW. Stats counters get folded into the
   * reconciliation record's `stats` JSON.
   */
  private async persistMatchResults(
    workspaceId: string,
    reconciliationId: string,
    reviewItems: Record<string, unknown>[],
    carrierName: string,
    policyNumberHeader: string | undefined,
    counts: {
      totalBobRows: number;
      autoMatched: number;
      needsReview: number;
      unmatched: number;
      discrepanciesFound: number;
      skippedBeforeStartDate: number;
      skippedInvalidPolicyNumber: number;
    },
  ): Promise<void> {
    // policyNumberHeader lets the reconcile derive identities for legacy
    // items that predate the carrierPolicyNumber column (snapshot lookup).
    await this.reviewItemService.reconcileMatchResults(
      workspaceId,
      reconciliationId,
      reviewItems,
      { policyNumberHeader: policyNumberHeader ?? null },
    );

    const learnedRuleApplyResult =
      await this.reviewItemService.applyLearnedRulesForReconciliation(
        workspaceId,
        reconciliationId,
        { carrierName },
      );

    await this.stateMachine.transition(
      workspaceId,
      reconciliationId,
      'MATCHING',
      'REVIEW',
      {
        matchedAt: new Date().toISOString(),
        stats: {
          ...counts,
          missingFromBob: 0,
          applied: learnedRuleApplyResult.updatedCount,
          autoRuleApplied: learnedRuleApplyResult.updatedCount,
          failed: 0,
          skipped: learnedRuleApplyResult.skippedCount,
        },
      },
    );
  }

  /**
   * For each matched pending item, fetch the enriched CRM policy snapshot
   * (lead phone/email/etc.), compute field diffs, and either push it to
   * `reviewItems` (with category + flags + summary) or skip it as confirmed.
   *
   * Mutates `reviewItems` (push) and the `record` field on each pending
   * item. Returns the counts of confirmed-skipped and discrepancy-pushed
   * items so the caller can fold them into pipeline stats.
   */
  private async enrichAndDiffMatchedItems(
    workspaceId: string,
    ctx: MatchContext,
    dedupedItems: PendingItem[],
    reviewItems: Record<string, unknown>[],
  ): Promise<{ confirmed: number; discrepanciesFound: number }> {
    let confirmed = 0;
    let discrepanciesFound = 0;

    const uniqueMatchedIds = [
      ...new Set(dedupedItems.map((p) => p.matchedPolicyId)),
    ];

    if (uniqueMatchedIds.length === 0) {
      return { confirmed, discrepanciesFound };
    }

    this.logger.log(
      `Enriching ${uniqueMatchedIds.length} matched policies for diff computation`,
    );

    const enrichedMap = await this.dataService.enrichMatchedPolicies(
      workspaceId,
      uniqueMatchedIds,
    );

    // Single effective-date resolution shared with the start-date cutoff
    // and dedup (resolveEffectiveDateHeader, Phase 4.5).
    const effKey = ctx.effDateHeader;

    for (const pending of dedupedItems) {
      const matchedPolicy = ctx.matchIndexes.policyById.get(
        pending.matchedPolicyId,
      );

      if (!matchedPolicy) continue;

      const enriched = enrichedMap.get(pending.matchedPolicyId);
      const policyForDiff = buildPolicyForDiff(matchedPolicy, enriched);

      const statusResult =
        pending.derivedStatus != null
          ? {
              derivedStatus: pending.derivedStatus as OmniaStatus,
              derivedExpireDate: pending.derivedExpireDate,
              cancelPreviousPolicyId: pending.cancelPreviousPolicyId,
              statusChangeReason: pending.statusChangeReason ?? '',
            }
          : null;

      // Pass other CRM policies sharing this policy number so the diff
      // engine can detect cross-term namesake conflicts (BOB row's name
      // matches a lead linked to a different policy under the same
      // number — usually a renamed lead or a separate person on a
      // canceled-and-rebuy term).
      const policyNumber = matchedPolicy.policyNumber;
      const namesakes = policyNumber
        ? (ctx.matchIndexes.policyByNumber.get(policyNumber) ?? []).filter(
            (p) => p.id !== matchedPolicy.id,
          )
        : [];

      const diffs = computeFieldDiffsFromMapping(
        pending.row,
        policyForDiff,
        statusResult,
        ctx.columnMapping,
        ctx.computedFields,
        namesakes,
      );

      // Synthetic diff for UI visibility when an older policy version needs
      // to be canceled. Apply step reads the same metadata off the snapshot.
      if (pending.cancelPreviousPolicyId) {
        const effDateVal = effKey
          ? (pending.row[effKey] as string | undefined)
          : undefined;
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

      // Returns null for confirmed (no diffs, status agrees) — skip the row
      const category = deriveCategory(
        false,
        diffs,
        pending.derivedStatus,
        pending.currentCrmStatus,
      );

      if (category === null) {
        confirmed++;
        continue;
      }

      const flagsResult = deriveFlags(
        pending.derivedStatus,
        pending.currentCrmStatus,
        pending.record.matchMethod as string,
        diffs,
        ctx.statusFieldMapping,
        pending.row,
      );

      pending.record.fieldDiffs = diffs;
      pending.record.summary = summarizeDiffs(diffs);
      pending.record.category = category;
      pending.record.flags = flagsResult.flags;
      pending.record.flagReasons = flagsResult.reasons;

      if (pending.cancelPreviousPolicyId) {
        const effDateVal = effKey
          ? (pending.row[effKey] as string | undefined)
          : undefined;

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

    return { confirmed, discrepanciesFound };
  }

  /**
   * When multiple BOB rows match the same CRM policy, keep only the row
   * with the newest effective date. Older rows are handled by the
   * cancel-previous-version logic on the kept row.
   */
  private dedupPendingByPolicyId(
    pendingItems: PendingItem[],
    effDateHeader: string | undefined,
  ): PendingItem[] {
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

      items.sort((a, b) => {
        const aEff = effDateHeader ? ((a.row[effDateHeader] as string) ?? '') : '';
        const bEff = effDateHeader ? ((b.row[effDateHeader] as string) ?? '') : '';

        return bEff.localeCompare(aEff);
      });

      dedupedItems.push(items[0]);

      this.logger.log(
        `Dedup: kept newest of ${items.length} BOB rows for policy ${items[0].matchedPolicyId}`,
      );
    }

    return dedupedItems;
  }

  /**
   * Load the reconciliation + carrier config, parsed rows, CRM policy index,
   * and match overrides into a single typed context. Throws if the
   * reconciliation has no carrier config or no column mapping (the import
   * dialog must capture these before the pipeline can run), if the carrier
   * config JSON fails validation (`CarrierConfigValidationError` from the
   * `parseCarrierPipelineConfig` boundary), or if the configured status
   * engine id is not registered — the run fails fast at MATCH with an
   * actionable message instead of deriving garbage review items.
   */
  private async loadMatchContext(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<MatchContext> {
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

    // Single validated config boundary (Phase 4.2): partial JSON merges over
    // defaults, malformed JSON throws with the offending key, the policy-
    // number regex is compiled exactly once.
    const pipelineConfig = parseCarrierPipelineConfig(carrierConfig, {
      onWarning: (message) => this.logger.warn(message),
    });

    // Fail fast on unknown status engines (Phase 4.3): an unregistered id
    // would derive null statuses for every row — silently disabling status
    // reconciliation — or, before deriveCategory's null guard, flood review
    // with empty UPDATE items.
    if (!isKnownStatusEngine(pipelineConfig.statusEngineId)) {
      throw new Error(
        `Carrier config "${carrierName}" selects unknown status engine ` +
          `"${pipelineConfig.statusEngineId}". Known engines: ${STATUS_ENGINE_IDS.join(', ')}. ` +
          `Set statusConfig.engineId to a registered engine (or register a new ` +
          `engine in engines/status.ts) and re-run.`,
      );
    }

    const computedFields = pipelineConfig.computedFields;
    const computedFieldCrmFields = computedFields
      ? Object.fromEntries(
          computedFields
            .filter((cf) => cf.crmField)
            .map((cf) => [cf.outputKey, cf.crmField!]),
        )
      : undefined;

    const parsedRows = await this.attachmentService.readParsedData(
      workspaceId,
      reconciliationId,
    );

    // Resolve statusFieldMapping headers against actual file headers
    // (safety net — the import dialog should have already resolved these)
    const sampleRow =
      parsedRows.length > 0 ? (parsedRows[0] as Record<string, unknown>) : {};
    const statusFieldMapping = resolveFieldMapping(
      pipelineConfig.statusFieldMapping,
      Object.keys(sampleRow),
    );

    const policies = await this.dataService.fetchPoliciesForMatching(
      workspaceId,
      carrierConfig.carrierId,
    );

    const matchIndexes = buildMatchIndexes(policies);

    const overrideRecords = await this.reviewItemService.fetchOverrides(
      workspaceId,
      carrierName,
    );
    const overrides: Override[] = overrideRecords.map((o) => ({
      carrierPolicyNumber: o.policyNumber,
      carrierName: o.carrierName,
      crmPolicyId: o.crmPolicyId,
      isActive: true,
    }));

    // ONE effective-date resolution for the start-date cutoff, dedup
    // ordering, and cancel-expire stamping (Phase 4.5 — previously the
    // cutoff used the raw mapped column while dedup/cancel used the
    // computed True Effective Date).
    const effDateHeader = resolveEffectiveDateHeader(
      columnMapping,
      computedFields,
    );

    const policyNumberHeader = Object.entries(columnMapping).find(
      ([, e]) => e.crmField === 'policyNumber',
    )?.[0];

    return {
      reconciliationId,
      carrierName,
      statusEngineId: pipelineConfig.statusEngineId,
      matchingConfig: pipelineConfig.matching,
      statusEngineConfig: pipelineConfig.status,
      startDate: pipelineConfig.startDate,
      policyNumberPattern: pipelineConfig.policyNumberPattern,
      columnMapping,
      statusFieldMapping,
      computedFields,
      computedFieldCrmFields,
      parsedRows,
      matchIndexes,
      overrides,
      effDateHeader,
      policyNumberHeader,
    };
  }
}
