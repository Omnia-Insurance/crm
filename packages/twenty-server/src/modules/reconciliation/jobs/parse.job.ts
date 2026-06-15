import { Logger, Scope } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  isKnownStatusEngine,
  STATUS_ENGINE_IDS,
  STATUS_ENGINE_ROLE_TYPES,
  STATUS_ENGINES,
  validateStatusEngineParams,
} from 'src/modules/reconciliation/engines/status';
import { parseXlsxSheet } from 'src/modules/reconciliation/parsers/xlsx';
import {
  inferDataType,
  resolveFieldMapping,
  transformRows,
  validateStatusRoleMapping,
} from 'src/modules/reconciliation/parsers/transforms';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import {
  ReconciliationStateMachineService,
  TransitionConflictError,
} from 'src/modules/reconciliation/services/state-machine.service';
import { parseCarrierPipelineConfig } from 'src/modules/reconciliation/types/carrier-config';
import {
  computeConfigFingerprint,
  mergeRunWarnings,
} from 'src/modules/reconciliation/utils/config-fingerprint.util';
import type {
  ColumnMapping,
  ReconciliationJobData,
} from 'src/modules/reconciliation/types/reconciliation';

@Processor({
  queueName: MessageQueue.reconciliationQueue,
  scope: Scope.REQUEST,
})
export class ReconciliationParseJob {
  private readonly logger = new Logger(ReconciliationParseJob.name);

  constructor(
    private readonly dataService: ReconciliationDataService,
    private readonly attachmentService: ReconciliationAttachmentService,
    private readonly stateMachine: ReconciliationStateMachineService,
    @InjectMessageQueue(MessageQueue.reconciliationQueue)
    private readonly queue: MessageQueueService,
  ) {}

  @Process('reconciliation-parse')
  async handle({
    workspaceId,
    reconciliationId,
  }: ReconciliationJobData): Promise<void> {
    this.logger.log(`Starting parse for reconciliation ${reconciliationId}`);

    try {
      // 1. Fetch reconciliation record + carrier config
      const reconciliation = await this.dataService.getReconciliation(
        workspaceId,
        reconciliationId,
      );

      // Status re-read guard (audit §"State machine is not compare-and-swap"):
      // only a run currently in PARSING — set by the orchestrator just before
      // enqueueing us — is ours to process. Anything else means a stale or
      // duplicate delivery; exit cleanly so we never stomp a newer run.
      if (reconciliation.status !== 'PARSING') {
        this.logger.warn(
          `Skipping parse job for reconciliation ${reconciliationId}: ` +
            `status is ${reconciliation.status}, expected PARSING (stale or duplicate delivery)`,
        );

        return;
      }

      if (!reconciliation.carrierConfigId) {
        throw new Error('No carrier config linked to this reconciliation');
      }

      const carrierConfig = await this.dataService.getCarrierConfig(
        workspaceId,
        reconciliation.carrierConfigId,
      );

      const columnMapping =
        reconciliation.columnMapping as ColumnMapping | null;

      if (!columnMapping || Object.keys(columnMapping).length === 0) {
        throw new Error(
          'Reconciliation has no column mapping. The import dialog must capture column matches before the pipeline can run.',
        );
      }

      // 2. Download the uploaded xlsx
      const fileBuffer = await this.attachmentService.readSourceFile(
        workspaceId,
        reconciliationId,
      );

      // 3. Validated carrier-config boundary (types/carrier-config.ts) — no
      // raw fieldConfig/statusConfig casts. A malformed config throws
      // CarrierConfigValidationError, which the catch below routes to
      // setFailed with the exact key and problem. Runs BEFORE the sheet
      // parse because parseSettings.headerRow (OMN-12) feeds parseXlsxSheet.
      //
      // Boundary warnings (legacy fallbacks, ignored keys) are collected and
      // persisted into stats.warnings at the PARSED stats write below, so
      // operators see them in the run-summary banner instead of only in
      // worker logs (OMN-11; audit 2026-06-11 §operability).
      const runWarnings: string[] = [];
      const pipelineConfig = parseCarrierPipelineConfig(carrierConfig, {
        onWarning: (message) => {
          this.logger.warn(message);
          runWarnings.push(message);
        },
      });

      // 4. Parse xlsx into raw rows (keys = cells of the configured header
      // row — parseSettings.headerRow, default 1 = today's behavior; rows
      // above it are ignored entirely).
      const rawRows = parseXlsxSheet(
        fileBuffer,
        reconciliation.sheetName ?? undefined,
        { headerRow: pipelineConfig.parseSettings.headerRow },
      );

      this.logger.log(`Parsed ${rawRows.length} raw rows from xlsx`);

      // Fail fast at PARSE on an unknown status engine id (Phase 4.3): an
      // unknown engine would otherwise surface only at MATCH (or worse,
      // silently feed null statuses into review), after the whole file was
      // parsed and stored.
      if (!isKnownStatusEngine(pipelineConfig.statusEngineId)) {
        throw new Error(
          `Unknown status engine id "${pipelineConfig.statusEngineId}" on carrier config ` +
            `"${carrierConfig.name}". Known engines: ${STATUS_ENGINE_IDS.join(', ')}. ` +
            `Fix statusConfig.engineId on the carrier config and re-run.`,
        );
      }

      const statusEngine = STATUS_ENGINES[pipelineConfig.statusEngineId];

      // Fail fast on engineParams the selected engine's schema rejects —
      // a typo'd or mistyped param must kill the run here, not be silently
      // ignored at derive time. (match.job re-validates and threads the
      // result into the engine config; parse only gates.)
      validateStatusEngineParams(statusEngine, pipelineConfig.engineParams);

      const computedFields = pipelineConfig.computedFields;
      const rawStatusFieldMapping = pipelineConfig.statusFieldMapping;

      // Resolve statusFieldMapping headers against actual file headers.
      // The carrierConfig stores title-case headers ("Broker Effective Date")
      // but CSV files may use underscore headers ("broker_effective_date").
      // Normalize both sides to find matches regardless of format.
      const actualHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
      const statusFieldMapping = resolveFieldMapping(
        rawStatusFieldMapping,
        actualHeaders,
      );

      // Validate status-role mapping against the SELECTED ENGINE's declared
      // requirements (its descriptor's requiredRoles — no more global,
      // Ambetter-tuned constant):
      //   - presence: a required role missing from statusConfig.fieldMapping
      //     entirely silently feeds null into the engine (blanket
      //     PAYMENT_ERROR / default ACTIVE_APPROVED derivations for the
      //     whole book) — fail the run, no rows needed to detect it;
      //   - resolvability: a configured header matching neither a file
      //     header nor a computed-field output does the same — warn for
      //     optional roles, fail the run for required ones.
      const roleValidation = validateStatusRoleMapping(
        statusFieldMapping,
        actualHeaders,
        computedFields,
        statusEngine.requiredRoles,
      );

      if (roleValidation.missingRequired.length > 0) {
        throw new Error(
          `Status engine "${statusEngine.id}" requires role(s) not present in ` +
            `statusConfig.fieldMapping: ${roleValidation.missingRequired.join(', ')}. ` +
            `Map each required role to a file header or computed-field output ` +
            `on the carrier config and re-run.`,
        );
      }

      if (rawRows.length > 0) {
        for (const {
          role,
          configuredHeader,
        } of roleValidation.unresolvedOptional) {
          this.logger.warn(
            `Status role "${role}" is mapped to "${configuredHeader}", which matches no file header or computed-field output — ` +
              `the status engine will receive null for this role on every row`,
          );
        }

        if (roleValidation.unresolvedRequired.length > 0) {
          const detail = roleValidation.unresolvedRequired
            .map(
              ({ role, configuredHeader }) => `${role} → "${configuredHeader}"`,
            )
            .join(', ');

          throw new Error(
            `Status-engine required role(s) resolve to no file header or computed-field output: ${detail}. ` +
              `Fix statusConfig.fieldMapping on the carrier config (or the file headers) and re-run.`,
          );
        }
      }

      // Build header → dataType map from both columnMapping (CRM-mapped)
      // AND statusFieldMapping (pipeline inputs with implicit types — see
      // STATUS_ENGINE_ROLE_TYPES in engines/status.ts for the contract).
      const headerTypes = new Map<string, string>();

      for (const [header, entry] of Object.entries(columnMapping)) {
        headerTypes.set(header, inferDataType(entry.fieldType));
      }
      for (const [role, header] of Object.entries(statusFieldMapping)) {
        if (!headerTypes.has(header) && STATUS_ENGINE_ROLE_TYPES[role]) {
          headerTypes.set(header, STATUS_ENGINE_ROLE_TYPES[role]);
        }
      }

      const policyNumberHeader = Object.entries(columnMapping).find(
        ([, e]) => e.crmField === 'policyNumber',
      )?.[0];

      // Per-cell transforms + computed fields, using the carrier's validated
      // transform vocabulary (Phase 4.8; defaults merge in buildTransforms).
      // Cells that fail their transform keep their raw value and are counted
      // in parseErrors (surfaced below as stats.parseErrors). Row filters +
      // skipFooterRows (parseSettings, OMN-12) drop footer/junk rows here,
      // counted in skippedByRowFilter (surfaced as stats.skippedByRowFilter).
      const { normalized, parseErrors, skippedByRowFilter } = transformRows(
        rawRows,
        headerTypes,
        computedFields,
        statusFieldMapping,
        policyNumberHeader,
        pipelineConfig.transformRules,
        pipelineConfig.parseSettings,
      );

      if (skippedByRowFilter > 0) {
        this.logger.log(
          `Row filters skipped ${skippedByRowFilter} of ${rawRows.length} raw rows ` +
            `(parseSettings.rowFilters / skipFooterRows)`,
        );
      }

      if (parseErrors.length > 0) {
        const sample = parseErrors
          .slice(0, 5)
          .map(
            (e) =>
              `row ${e.rowNumber}${e.header ? ` [${e.header}]` : ''}: ${e.error}`,
          )
          .join('; ');

        this.logger.warn(
          `Parse produced ${parseErrors.length} cell-level errors across ${rawRows.length} rows (raw values preserved). First: ${sample}`,
        );
      }

      // 5. Store parsed data as JSON attachment
      await this.attachmentService.writeParsedData(
        workspaceId,
        reconciliationId,
        normalized,
      );

      // 6. Transition PARSING → PARSED. warnings + configFingerprint are
      // stamped here (and carried into the auto-chain write below) so the
      // match job can detect a config edit landing between the chained
      // parse and match reads (OMN-11).
      const parseStats = {
        totalBobRows: normalized.length,
        autoMatched: 0,
        needsReview: 0,
        unmatched: 0,
        missingFromBob: 0,
        discrepanciesFound: 0,
        applied: 0,
        failed: 0,
        skipped: 0,
        parseErrors: parseErrors.length,
        skippedByRowFilter,
        warnings: mergeRunWarnings(runWarnings),
        configFingerprint: computeConfigFingerprint(pipelineConfig),
      };

      await this.stateMachine.transition(
        workspaceId,
        reconciliationId,
        'PARSING',
        'PARSED',
        {
          parsedAt: new Date().toISOString(),
          stats: parseStats,
        },
      );

      this.logger.log(
        `Parse complete: ${normalized.length} rows for reconciliation ${reconciliationId}`,
      );

      // 7. Auto-chain: transition PARSED → MATCHING and enqueue match job.
      // matchingStartedAt is the stuck-run stamp the orchestrator's recovery
      // path reads (stored in stats — see ReconciliationStats).
      await this.stateMachine.transition(
        workspaceId,
        reconciliationId,
        'PARSED',
        'MATCHING',
        {
          stats: {
            ...parseStats,
            matchingStartedAt: new Date().toISOString(),
          },
        },
      );

      await this.queue.add<ReconciliationJobData>('reconciliation-match', {
        workspaceId,
        reconciliationId,
      });

      this.logger.log(
        `Auto-enqueued match job for reconciliation ${reconciliationId}`,
      );
    } catch (error) {
      if (error instanceof TransitionConflictError) {
        // A concurrent writer won a CAS transition (manual restart, stuck-run
        // recovery, or duplicate delivery) — the run belongs to someone else
        // now. Exit cleanly: calling setFailed here would stomp their state.
        this.logger.warn(
          `Parse job for reconciliation ${reconciliationId} exiting cleanly on transition conflict: ${error.message}`,
        );

        return;
      }

      await this.stateMachine.setFailed(
        workspaceId,
        reconciliationId,
        'PARSE',
        error,
      );

      throw error;
    }
  }
}
