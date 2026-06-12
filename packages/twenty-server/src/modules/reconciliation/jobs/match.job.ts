import { Logger, Scope } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  computeFieldDiffsFromMapping,
  summarizeDiffs,
  type DiffPolicy,
  type FieldDiff,
} from 'src/modules/reconciliation/engines/diff';
import {
  buildIdentifierCanonicalizer,
  buildMatchIndexes,
  buildMatchInputFromMapping,
  combinedNameFuzzyMatch,
  matchRow,
  normalizeDateOnly,
  normalizePolicyNumber,
  resolveCarrierIdentifier,
  type DedupStrategy,
  type IdentifierCanonicalizer,
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
  STATUS_ENGINES,
  validateStatusEngineParams,
  type OmniaStatus,
  type StatusEngineConfig,
} from 'src/modules/reconciliation/engines/status';
import {
  deriveCategory,
  deriveFlags,
  type StatusChangeGateOptions,
} from 'src/modules/reconciliation/types/field-config';
import { parseCarrierPipelineConfig } from 'src/modules/reconciliation/types/carrier-config';
import {
  computeConfigFingerprint,
  mergeRunWarnings,
} from 'src/modules/reconciliation/utils/config-fingerprint.util';
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
 * An UNMATCHED file row eligible to seed policy-number discovery (OMN-12,
 * ported from the legacy payment-reconciliation app's run-matching.ts):
 * it carries a carrier-shaped policy number that no CRM policy owns, plus
 * the DOB/name identity signals the discovery scoring needs. Collected by
 * the per-row loop only when matchingConfig.enableDiscovery is true.
 */
type DiscoveryRowCandidate = {
  row: Record<string, unknown>;
  /** Canonical 'YYYY-MM-DD' member DOB (the discovery index key). */
  dob: string;
  memberFirstName: string | null;
  memberLastName: string | null;
  /** Normalized (trim+uppercase) row policy number — the suggestion payload. */
  policyNumber: string;
  /** The identity value the row's UNMATCHED item was stamped with. */
  stampedCarrierIdentifier: string | null;
};

/**
 * CRM statuses meaning "sold but not yet confirmed by the carrier" — these
 * policies legitimately lack a carrier-issued policy number, so when they
 * ALSO carry no carrier-shaped number they are excluded from missing-from-
 * BOB (they cannot be expected in the carrier file yet). Ported verbatim
 * from the legacy app's PRE_CARRIER_STATUSES (run-matching.ts).
 */
const PRE_CARRIER_CRM_STATUSES: ReadonlySet<string> = new Set([
  'SUBMITTED',
  'PENDING',
  'INCOMPLETE',
]);

/**
 * CRM statuses whose policies qualify for discovery even with NO policy
 * number at all (the legacy predicate's first leg); policies in any status
 * still qualify when they carry a non-carrier-shaped number (second leg).
 */
const DISCOVERY_PRE_CARRIER_STATUSES: ReadonlySet<string> = new Set([
  'SUBMITTED',
  'PENDING',
]);

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
  /** Boundary onWarning messages collected at MATCH (plus the config-drift
   *  notice when the live fingerprint differs from the parse-time stamp);
   *  persisted into stats.warnings at the REVIEW stats write (OMN-11). */
  runWarnings: string[];
  /** stats.warnings persisted by the parse phase — carried into the REVIEW
   *  stats write so parse-time warnings survive the wholesale stats
   *  replacement. [] for runs that predate the key. */
  priorWarnings: readonly string[];
  /** Live fingerprint of the parsed CarrierPipelineConfig (see
   *  computeConfigFingerprint) — stamped into stats.configFingerprint. */
  configFingerprint: string;
  /** Per-carrier diff suppression knobs (carrierConfig.diffConfig, OMN-12
   *  tuning depth) — defaults reproduce the previously-hardcoded guards. */
  diffPolicy: DiffPolicy;
  /** Resolved statusVocabulary.negativeTerminalStatuses as a Set (built
   *  once here). Threaded into diff suppression, deriveCategory,
   *  deriveFlags, AND the matching narrowing chain (matchRow options —
   *  Wave 5 closed the engines/matching.ts static-import gap). */
  negativeTerminalStatuses: ReadonlySet<string>;
  /** Resolved statusVocabulary.activeStatuses as a Set — the missing-from-
   *  BOB corpus scope ("non-cancel statuses that should appear in the
   *  file"). Only consulted when matchingConfig.enableMissingFromBob is on. */
  activeStatuses: ReadonlySet<string>;
  /** The two knobs above bundled for deriveCategory/deriveFlags. */
  statusChangeGate: StatusChangeGateOptions;
  /** Per-carrier canonical-identifier function (OMN-12 identity):
   *  policyNumberPattern capture group + identifierNormalization strips
   *  over trim+uppercase. The SAME function builds the index keys
   *  (buildMatchIndexes) and the matchRow comparison forms — symmetry is
   *  the whole point. */
  canonicalize: IdentifierCanonicalizer;
  /** True when any canonicalization knob is active (the builder returns
   *  normalizePolicyNumber ITSELF when none is). Gates the canonical
   *  namesake lookup so default carriers keep today's raw-value lookup
   *  bit-for-bit. */
  canonicalizationActive: boolean;
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
      // UNMATCHED rows eligible to seed policy-number discovery — only
      // collected when the knob is on (default-off carriers never allocate).
      const discoveryRows: DiscoveryRowCandidate[] = [];

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
          matchingConfig.identifierRoles,
        );

        // The row's identity value: policy number, or — for identifier-role
        // carriers only — the first configured identifier (OMN-12 identity).
        // With identifierRoles unset this is exactly matchInput.policyNumber.
        const carrierIdentifier = resolveCarrierIdentifier(
          matchInput,
          matchingConfig.identifierRoles,
        );

        // Skip rows whose identifier fails the carrier-configurable pattern.
        // The gate tests the RAW (trim+uppercase) value — capture-group
        // canonicalization happens after the gate, inside matchRow — so
        // gate-skip behavior for non-matching rows is unchanged. Counted
        // into stats — see skippedBeforeStartDate.
        if (
          policyNumberPattern &&
          carrierIdentifier &&
          !policyNumberPattern.test(carrierIdentifier)
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
          {
            canonicalize: ctx.canonicalize,
            negativeTerminalStatuses: ctx.negativeTerminalStatuses,
          },
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

          // Canonical lookup key — the index keys are canonicalized, so the
          // input must be too. With canonicalization unset this reduces to
          // normalizePolicyNumber over an already-normalized value (no-op).
          const canonicalPolicyNumber = ctx.canonicalize(
            matchInput.policyNumber,
          );
          const allPoliciesForNumber = canonicalPolicyNumber
            ? (policyNumberMap.get(canonicalPolicyNumber) ?? [])
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

        const policyLabel = carrierIdentifier ?? 'unknown';
        const crmLabel = decision.crmPolicyNumber ?? 'none';

        // The review-item identity column (carrierPolicyNumber — see
        // review-item-reconcile.util.ts). Identifier-tier rows stamp the
        // file's identifier value here, so reconcile identity, override
        // learning (fetchOverrides keys off this column), and the review UI
        // stay coherent without a schema change. Under dedupStrategy
        // 'keepAll' (member-level files) a '#ROW<n>' suffix keeps the
        // identity unique per file row — without it, deciding one
        // dependent's item would make re-runs skip its siblings as
        // "decided duplicates". Overrides learned from suffixed items are
        // deliberately inert: pinning a SHARED subscriber id to one policy
        // would mis-route every other dependent.
        const stampedCarrierIdentifier =
          matchingConfig.dedupStrategy === 'keepAll'
            ? `${carrierIdentifier ?? ''}#ROW${
                typeof row.__rowNumber === 'number' ? row.__rowNumber : i + 1
              }`
            : carrierIdentifier;

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
            ctx.statusChangeGate,
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
            // First-class identity columns (audit 1.2): the identifier is
            // already resolved through columnMapping by
            // buildMatchInputFromMapping — no snapshot key guessing later.
            carrierPolicyNumber: stampedCarrierIdentifier ?? null,
            carrierName,
            cancelPreviousPolicyId,
          });

          unmatched++;

          // Discovery candidate collection (OMN-12, legacy port): the row
          // must carry a policy number (rows failing policyNumberPattern
          // were already gate-skipped above, so a non-null number here is
          // carrier-shaped whenever a pattern is configured) and a DOB —
          // the phase pairs rows to CRM policies by exact DOB + fuzzy name.
          if (matchingConfig.enableDiscovery && matchInput.policyNumber) {
            const dob = normalizeDateOnly(matchInput.memberDob);

            if (dob) {
              discoveryRows.push({
                row,
                dob,
                memberFirstName: matchInput.memberFirstName,
                memberLastName: matchInput.memberLastName,
                policyNumber: matchInput.policyNumber,
                stampedCarrierIdentifier: stampedCarrierIdentifier ?? null,
              });
            }
          }
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
              carrierPolicyNumber: stampedCarrierIdentifier ?? null,
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
        matchingConfig.dedupStrategy,
      );

      const enrichResult = await this.enrichAndDiffMatchedItems(
        workspaceId,
        ctx,
        dedupedItems,
        reviewItems,
      );

      confirmed += enrichResult.confirmed;
      discrepanciesFound += enrichResult.discrepanciesFound;

      // Every CRM policy a file row matched this run — pre-dedup on purpose:
      // dedup discards redundant ROWS, but their policies were present in
      // the file, so neither post-match phase may treat them as absent.
      const matchedPolicyIds: ReadonlySet<string> = new Set(
        pendingItems.map((p) => p.matchedPolicyId),
      );

      // --- Policy-number discovery (OMN-12 dead-knob port; legacy
      // run-matching.ts "Policy Number Discovery" phase). Runs BEFORE
      // missing-from-BOB, whose corpus excludes discovered policies. ---
      let discoveredPolicyIds: ReadonlySet<string> = new Set();

      if (matchingConfig.enableDiscovery) {
        const discovery = this.runPolicyNumberDiscovery(
          ctx,
          discoveryRows,
          matchedPolicyIds,
        );

        reviewItems.push(...discovery.items);
        autoMatched += discovery.autoMatched;
        needsReview += discovery.needsReview;
        discoveredPolicyIds = discovery.discoveredPolicyIds;

        this.logger.log(
          `Policy-number discovery: ${discovery.items.length} suggestion(s) ` +
            `from ${discoveryRows.length} unmatched row(s)`,
        );
      }

      // --- Missing-from-BOB (OMN-12 dead-knob port; legacy run-matching.ts
      // "Two-way reconciliation: CRM→BOB gap detection"). ---
      let missingFromBob = 0;

      if (matchingConfig.enableMissingFromBob) {
        const missingItems = this.buildMissingFromBobItems(
          ctx,
          matchedPolicyIds,
          discoveredPolicyIds,
          today,
        );

        reviewItems.push(...missingItems);
        missingFromBob = missingItems.length;

        this.logger.log(
          `Missing-from-BOB: ${missingFromBob} active CRM polic(ies) not present in the carrier file`,
        );
      }

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
          missingFromBob,
          discrepanciesFound,
          skippedBeforeStartDate,
          skippedInvalidPolicyNumber,
        },
        {
          // Parse-phase warnings survive the wholesale stats replacement;
          // match-phase warnings (incl. the config-drift notice) append.
          warnings: mergeRunWarnings(ctx.priorWarnings, ctx.runWarnings),
          configFingerprint: ctx.configFingerprint,
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
      /** Wired by the missing-from-BOB phase; 0 when the knob is off (the
       *  default), matching the previously hardcoded value bit-for-bit. */
      missingFromBob: number;
      discrepanciesFound: number;
      skippedBeforeStartDate: number;
      skippedInvalidPolicyNumber: number;
    },
    runMeta: {
      /** Deduped/capped union of parse-phase + match-phase warnings. */
      warnings: string[];
      /** Live fingerprint of the parsed config (computeConfigFingerprint). */
      configFingerprint: string;
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
          applied: learnedRuleApplyResult.updatedCount,
          autoRuleApplied: learnedRuleApplyResult.updatedCount,
          failed: 0,
          skipped: learnedRuleApplyResult.skippedCount,
          warnings: runMeta.warnings,
          configFingerprint: runMeta.configFingerprint,
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
      // The index keys are canonical, so canonicalization-active carriers
      // must canonicalize the CRM-side value too or namesakes silently miss.
      // GATED on canonicalizationActive: default carriers keep today's
      // raw-value lookup exactly (a raw CRM value that differs from its
      // normalized form misses the index — pre-existing behavior preserved
      // bit-for-bit).
      const policyNumber = ctx.canonicalizationActive
        ? ctx.canonicalize(matchedPolicy.policyNumber)
        : matchedPolicy.policyNumber;
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
        ctx.diffPolicy,
        ctx.negativeTerminalStatuses,
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
        ctx.statusChangeGate,
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
        ctx.statusChangeGate,
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
   * "Carrier-shaped" identifier test shared by the two post-match phases:
   * trim+uppercase, then the carrier's compiled policyNumberPattern when one
   * is configured (the generic replacement for the legacy app's hardcoded
   * isValidAmbetterPolicyNumber). With NO pattern there is no shape to
   * check, so any non-empty value qualifies — the closest generic reading
   * of the legacy gate (audit design note: "define discovery behavior when
   * a carrier has no policyNumberPattern").
   */
  private matchesCarrierIdentifierShape(
    value: string | null,
    pattern: RegExp | null,
  ): boolean {
    const normalized = normalizePolicyNumber(value);

    if (normalized === null) return false;

    return pattern === null ? true : pattern.test(normalized);
  }

  /**
   * Policy-number discovery (OMN-12; port of the legacy payment-
   * reconciliation app's phase, run-matching.ts:729-870). For CRM policies
   * whose policy number is missing (SUBMITTED/PENDING) or not carrier-shaped,
   * find the best UNMATCHED file row by exact DOB + combined-name fuzzy
   * score and propose the row's policy number as a normal `policyNumber`
   * field diff (the existing apply path writes it on approval — no new
   * apply semantics).
   *
   * Deliberate adaptations from v1 (see also the thresholds, which replace
   * the hardcoded 0.95/0.98 literals):
   *   - policies already matched this run are skipped: v1 enriched the
   *     existing match result with the suggestion, but the server diff
   *     engine already surfaces a policyNumber diff on matched rows;
   *   - the row pool is restricted to rows that ended UNMATCHED this run
   *     (v1 indexed every file row, so a row matched to policy A could
   *     simultaneously seed a suggestion for policy B);
   *   - each row is claimed by at most one policy (first in fetch order) —
   *     v1 could propose one row's number to several same-DOB policies;
   *   - v1's AUTO_MATCHED/NEEDS_REVIEW matchStatus maps onto confidence:
   *     score ≥ discoveryAutoThreshold keeps round(score*100), anything
   *     below is capped under autoMatchThreshold so batch approval's
   *     high-confidence sweep never auto-applies a mere suggestion.
   */
  private runPolicyNumberDiscovery(
    ctx: MatchContext,
    discoveryRows: DiscoveryRowCandidate[],
    matchedPolicyIds: ReadonlySet<string>,
  ): {
    items: Record<string, unknown>[];
    autoMatched: number;
    needsReview: number;
    discoveredPolicyIds: ReadonlySet<string>;
  } {
    const items: Record<string, unknown>[] = [];
    const discoveredPolicyIds = new Set<string>();
    let autoMatched = 0;
    let needsReview = 0;

    if (discoveryRows.length === 0) {
      return { items, autoMatched, needsReview, discoveredPolicyIds };
    }

    const rowsByDob = new Map<string, DiscoveryRowCandidate[]>();

    for (const candidate of discoveryRows) {
      const existing = rowsByDob.get(candidate.dob) ?? [];

      existing.push(candidate);
      rowsByDob.set(candidate.dob, existing);
    }

    const claimedRows = new Set<DiscoveryRowCandidate>();

    for (const policy of ctx.matchIndexes.policyById.values()) {
      if (matchedPolicyIds.has(policy.id)) continue;

      // The v1 candidate predicate, genericized: pre-carrier policies with a
      // missing/non-carrier-shaped number, or any policy carrying a
      // non-empty number that fails the carrier shape.
      const shaped = this.matchesCarrierIdentifierShape(
        policy.policyNumber,
        ctx.policyNumberPattern,
      );
      const needsDiscovery =
        (policy.status !== null &&
          DISCOVERY_PRE_CARRIER_STATUSES.has(policy.status) &&
          !shaped) ||
        (policy.policyNumber !== null &&
          policy.policyNumber.trim().length > 0 &&
          !shaped);

      if (!needsDiscovery) continue;

      const dob = normalizeDateOnly(policy['lead.dateOfBirth']);

      if (!dob) continue;

      const candidates = rowsByDob.get(dob);

      if (!candidates || candidates.length === 0) continue;

      let bestRow: DiscoveryRowCandidate | null = null;
      let bestScore = 0;

      for (const candidate of candidates) {
        if (claimedRows.has(candidate)) continue;

        const score = combinedNameFuzzyMatch(
          candidate.memberFirstName,
          candidate.memberLastName,
          policy['lead.name.firstName'],
          policy['lead.name.lastName'],
        );

        if (score > bestScore) {
          bestScore = score;
          bestRow = candidate;
        }
      }

      if (!bestRow || bestScore < ctx.matchingConfig.discoveryNameThreshold) {
        continue;
      }

      // Never suggest a number some CRM policy already owns (v1 gate; the
      // index keys are canonical, so the lookup must be too).
      const canonicalSuggested = ctx.canonicalize(bestRow.policyNumber);

      if (
        canonicalSuggested === null ||
        ctx.matchIndexes.policyByNumber.has(canonicalSuggested)
      ) {
        continue;
      }

      claimedRows.add(bestRow);
      discoveredPolicyIds.add(policy.id);

      const currentPn = policy.policyNumber ?? 'none';
      const suggestedPn = bestRow.policyNumber;
      const isAuto = bestScore >= ctx.matchingConfig.discoveryAutoThreshold;
      const rawConfidence = Math.round(bestScore * 100);
      const confidence = isAuto
        ? rawConfidence
        : Math.min(rawConfidence, ctx.matchingConfig.autoMatchThreshold - 1);
      const discoveryNote =
        `Policy# discovery: "${currentPn}" → "${suggestedPn}" ` +
        `(name match ${bestScore.toFixed(3)}, DOB ${dob})`;

      const diffs: FieldDiff[] = [
        {
          field: 'policyNumber',
          label: 'Policy Number',
          bobValue: suggestedPn,
          crmValue: policy.policyNumber,
          action: 'UPDATE',
          severity: 'CRITICAL',
          approval: 'PENDING',
          crmField: 'policyNumber',
          crmObjectType: 'policy',
          note: 'Policy number discovered by DOB + name similarity against the carrier file',
        },
      ];

      items.push({
        name: `DISCOVER: ${currentPn} → ${suggestedPn}`,
        confidence,
        matchMethod: 'POLICY_NUMBER_DISCOVERY',
        matchNotes: discoveryNote,
        derivedStatus: null,
        currentCrmStatus: policy.status,
        statusChangeReason: null,
        decision: 'PENDING',
        fieldDiffs: diffs,
        bobRowSnapshot: bestRow.row,
        reconciliationId: ctx.reconciliationId,
        policyId: policy.id,
        category: 'UPDATE',
        flags: [] as string[],
        flagReasons: {} as Record<string, string>,
        summary: summarizeDiffs(diffs),
        carrierPolicyNumber: bestRow.stampedCarrierIdentifier ?? suggestedPn,
        carrierName: ctx.carrierName,
        cancelPreviousPolicyId: null,
      });

      if (isAuto) autoMatched++;
      else needsReview++;
    }

    return { items, autoMatched, needsReview, discoveredPolicyIds };
  }

  /**
   * Missing-from-BOB (OMN-12; port of the legacy app's two-way
   * reconciliation phase, run-matching.ts:872-931). The CRM policies that
   * SHOULD have appeared in the file but did not: the carrier-scoped corpus
   * filtered to statusVocabulary.activeStatuses (this set's intended
   * consumer), minus everything matched or discovered this run, minus
   * future-effective terms (v1) and — new here, mirroring the row-side gate
   * — terms effective before the carrier's startDate cutoff, minus
   * pre-carrier policies that lack a carrier-shaped number (they cannot be
   * expected in the file yet).
   *
   * Items reuse the UNMATCHED category (the reviewItem category SELECT has
   * no MISSING_FROM_BOB option — seed gap noted for the orchestrator) and
   * carry matchMethod MISSING_FROM_BOB as the discriminator; fieldDiffs is
   * null and there is no status diff, so they can never enter rule learning
   * (buildStatusRuleSignature bails on category UNMATCHED and on a missing
   * status diff) or batch auto-apply (isBatchApplyCandidate excludes
   * category UNMATCHED).
   */
  private buildMissingFromBobItems(
    ctx: MatchContext,
    matchedPolicyIds: ReadonlySet<string>,
    discoveredPolicyIds: ReadonlySet<string>,
    today: Date,
  ): Record<string, unknown>[] {
    const items: Record<string, unknown>[] = [];
    const startTime = ctx.startDate ? new Date(ctx.startDate).getTime() : null;
    const todayTime = today.getTime();

    for (const policy of ctx.matchIndexes.policyById.values()) {
      if (matchedPolicyIds.has(policy.id)) continue;
      if (discoveredPolicyIds.has(policy.id)) continue;
      if (policy.status === null || !ctx.activeStatuses.has(policy.status)) {
        continue;
      }

      const effTime = policy.effectiveDate
        ? new Date(policy.effectiveDate).getTime()
        : NaN;

      if (!Number.isNaN(effTime)) {
        // Not yet effective — cannot be expected in the file (v1 gate).
        if (effTime > todayTime) continue;
        // Predates the carrier cutoff — the row-side equivalent was skipped
        // by the startDate gate, so flagging the CRM side would be noise.
        if (startTime !== null && effTime < startTime) continue;
      }

      const hasCarrierShapedNumber = this.matchesCarrierIdentifierShape(
        policy.policyNumber,
        ctx.policyNumberPattern,
      );

      if (
        PRE_CARRIER_CRM_STATUSES.has(policy.status) &&
        !hasCarrierShapedNumber
      ) {
        continue;
      }

      const severity = hasCarrierShapedNumber
        ? 'Has carrier policy# — should be in the carrier file'
        : 'No carrier-shaped policy# — may need policy number discovery';

      items.push({
        name: `MISSING: ${policy.policyNumber ?? 'unknown'}`,
        confidence: 0,
        matchMethod: 'MISSING_FROM_BOB',
        matchNotes:
          `Active CRM policy not present in carrier file ` +
          `(status ${policy.status}). ${severity}`,
        derivedStatus: null,
        currentCrmStatus: policy.status,
        statusChangeReason: null,
        decision: 'PENDING',
        fieldDiffs: null,
        bobRowSnapshot: null,
        reconciliationId: ctx.reconciliationId,
        policyId: policy.id,
        // The category SELECT has no MISSING_FROM_BOB option (seed gap) —
        // UNMATCHED + the matchMethod discriminator keeps these out of rule
        // learning and batch auto-apply via the existing category filters.
        category: 'UNMATCHED',
        flags: [] as string[],
        flagReasons: {} as Record<string, string>,
        summary: '',
        carrierPolicyNumber: ctx.canonicalize(policy.policyNumber),
        carrierName: ctx.carrierName,
        cancelPreviousPolicyId: null,
      });
    }

    return items;
  }

  /**
   * Per-carrier dedup of multiple BOB rows matching the same CRM policy
   * (matchingConfig.dedupStrategy, OMN-12):
   *
   *   - keepNewestEffectiveDate (default — today's behavior): keep the row
   *     with the newest effective date; older rows are handled by the
   *     cancel-previous-version logic on the kept row,
   *   - keepAll: member-level files — every row stays its own review item
   *     (identity uniqueness comes from the '#ROW<n>' suffix the per-row
   *     loop stamps into carrierPolicyNumber),
   *   - keepFirst: keep the first row in file order.
   */
  private dedupPendingByPolicyId(
    pendingItems: PendingItem[],
    effDateHeader: string | undefined,
    strategy: DedupStrategy = 'keepNewestEffectiveDate',
  ): PendingItem[] {
    if (strategy === 'keepAll') {
      return pendingItems;
    }

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

      if (strategy === 'keepFirst') {
        // pendingItems are appended in file order, so items[0] is the
        // first occurrence for this policy.
        dedupedItems.push(items[0]);

        this.logger.log(
          `Dedup: kept first of ${items.length} BOB rows for policy ${items[0].matchedPolicyId}`,
        );
        continue;
      }

      items.sort((a, b) => {
        const aEff = effDateHeader
          ? ((a.row[effDateHeader] as string) ?? '')
          : '';
        const bEff = effDateHeader
          ? ((b.row[effDateHeader] as string) ?? '')
          : '';

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
    //
    // Boundary warnings are collected and persisted into stats.warnings at
    // the REVIEW stats write so they reach the run-summary banner (OMN-11).
    const runWarnings: string[] = [];
    const pipelineConfig = parseCarrierPipelineConfig(carrierConfig, {
      onWarning: (message) => {
        this.logger.warn(message);
        runWarnings.push(message);
      },
    });

    // Per-run config fingerprint (OMN-11): both jobs hash the parsed config
    // canonically (computeConfigFingerprint), so a differing parse-time
    // stamp means the stored config was edited between the chained parse
    // and match reads — parse-time knobs (transformRules, computed fields)
    // still reflect the OLD config while match-time knobs are live. Warn
    // instead of failing: the mixed-config run is detectable, and a
    // REVIEW → PARSING restart re-applies everything consistently.
    const configFingerprint = computeConfigFingerprint(pipelineConfig);
    const parseTimeFingerprint = reconciliation.stats?.configFingerprint;

    if (parseTimeFingerprint && parseTimeFingerprint !== configFingerprint) {
      const driftWarning =
        `Carrier config changed between parse and match (fingerprint ` +
        `${parseTimeFingerprint} → ${configFingerprint}): parse-time settings ` +
        `(transformRules, computed fields, statusConfig.fieldMapping) still ` +
        `reflect the older config for this run. Restart parsing to apply the ` +
        `edit consistently.`;

      this.logger.warn(driftWarning);
      runWarnings.push(driftWarning);
    }

    const priorWarnings = reconciliation.stats?.warnings ?? [];

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

    // Fail fast on engineParams the selected engine's schema rejects, then
    // thread the validated params into the engine config — match re-runs
    // (REVIEW → MATCHING) pick up live engineParams edits, so this must
    // re-validate rather than trust the parse-time gate.
    const statusEngine = STATUS_ENGINES[pipelineConfig.statusEngineId];
    const engineParams = validateStatusEngineParams(
      statusEngine,
      pipelineConfig.engineParams,
    );

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

    // Per-carrier canonical-identifier function (OMN-12 identity). Built
    // ONCE and shared by the index keys, the matchRow comparison forms, and
    // the namesake lookup — both sides of every exact-identifier compare go
    // through the same function. The builder returns normalizePolicyNumber
    // ITSELF when no knob is active (no capture group in
    // policyNumberPattern, no identifierNormalization), which doubles as
    // the bit-for-bit "canonicalization active?" signal.
    const canonicalize = buildIdentifierCanonicalizer(
      pipelineConfig.policyNumberPattern,
      pipelineConfig.matching.identifierNormalization,
    );
    const canonicalizationActive = canonicalize !== normalizePolicyNumber;

    const matchIndexes = buildMatchIndexes(policies, {
      canonicalize,
      identifierRoles: pipelineConfig.matching.identifierRoles,
    });

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

    // Per-carrier tuning-depth knobs (OMN-12): the diff suppression policy
    // and the negative-terminal status set, resolved once. The Set is built
    // here (the boundary keeps plain arrays so the config fingerprint stays
    // honest); the same gate object feeds deriveCategory/deriveFlags so they
    // stay in lockstep with the diff engine's status-diff suppression.
    const negativeTerminalStatuses: ReadonlySet<string> = new Set(
      pipelineConfig.statusVocabulary.negativeTerminalStatuses,
    );
    const activeStatuses: ReadonlySet<string> = new Set(
      pipelineConfig.statusVocabulary.activeStatuses,
    );
    const statusChangeGate: StatusChangeGateOptions = {
      negativeTerminalStatuses,
      suppressNegativeToNegativeStatus:
        pipelineConfig.diffPolicy.suppressNegativeToNegativeStatus,
    };

    return {
      reconciliationId,
      carrierName,
      statusEngineId: pipelineConfig.statusEngineId,
      matchingConfig: pipelineConfig.matching,
      statusEngineConfig: { ...pipelineConfig.status, engineParams },
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
      runWarnings,
      priorWarnings,
      configFingerprint,
      diffPolicy: pipelineConfig.diffPolicy,
      negativeTerminalStatuses,
      activeStatuses,
      statusChangeGate,
      canonicalize,
      canonicalizationActive,
    };
  }
}
