import { Logger, Scope } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { STATUS_ENGINE_ROLE_TYPES } from 'src/modules/reconciliation/engines/status';
import { parseXlsxSheet } from 'src/modules/reconciliation/parsers/xlsx';
import {
  TRANSFORMS,
  inferDataType,
  applyComputedFields,
  resolveFieldMapping,
} from 'src/modules/reconciliation/parsers/transforms';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import type {
  ColumnMapping,
  ComputedFieldDef,
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
    this.logger.log(
      `Starting parse for reconciliation ${reconciliationId}`,
    );

    try {
      // 1. Fetch reconciliation record + carrier config
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

      const columnMapping = reconciliation.columnMapping as ColumnMapping | null;

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

      // 3. Parse xlsx into raw rows (keys = XLSX column headers)
      const rawRows = parseXlsxSheet(
        fileBuffer,
        reconciliation.sheetName ?? undefined,
      );

      this.logger.log(`Parsed ${rawRows.length} raw rows from xlsx`);

      // 4. Transform: apply type transforms for mapped columns, pass through unmapped
      // fieldConfig stores ComputedFieldDef[] directly (or null)
      const computedFields =
        (carrierConfig.fieldConfig as ComputedFieldDef[] | null) ?? null;
      const statusConfig = carrierConfig.statusConfig as Record<string, unknown> | null;
      const rawStatusFieldMapping =
        (statusConfig?.fieldMapping as Record<string, string>) ?? {};

      // Resolve statusFieldMapping headers against actual file headers.
      // The carrierConfig stores title-case headers ("Broker Effective Date")
      // but CSV files may use underscore headers ("broker_effective_date").
      // Normalize both sides to find matches regardless of format.
      const actualHeaders =
        rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
      const statusFieldMapping = resolveFieldMapping(
        rawStatusFieldMapping,
        actualHeaders,
      );

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

      const normalized: Record<string, unknown>[] = [];
      const parseErrors: { rowNumber: number; header?: string; error: string }[] = [];

      const policyNumberHeader = Object.entries(columnMapping).find(
        ([, e]) => e.crmField === 'policyNumber',
      )?.[0];

      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];

        try {
          const row: Record<string, unknown> = {};

          for (const [header, rawValue] of Object.entries(raw)) {
            try {
              const dataType = headerTypes.get(header);

              if (dataType) {
                const transform = TRANSFORMS[dataType];

                row[header] = transform ? transform(rawValue) : rawValue;
              } else {
                row[header] = rawValue;
              }
            } catch (cellError) {
              parseErrors.push({
                rowNumber: i + 1,
                header,
                error: cellError instanceof Error ? cellError.message : String(cellError),
              });
              row[header] = rawValue; // preserve raw value on failure
            }
          }

          // Apply computed fields — resolve inputs via statusFieldMapping
          // so role names like "brokerEffectiveDate" find the actual header
          applyComputedFields(row, computedFields, statusFieldMapping);

          // Add metadata
          row.__rowNumber = i + 1;

          const policyNum = policyNumberHeader
            ? row[policyNumberHeader]
            : null;

          row.__name = policyNum
            ? `${policyNum} - row ${i + 1}`
            : `row ${i + 1}`;

          normalized.push(row);
        } catch (rowError) {
          parseErrors.push({
            rowNumber: i + 1,
            error: rowError instanceof Error ? rowError.message : String(rowError),
          });
        }
      }

      if (parseErrors.length > 0) {
        this.logger.warn(
          `Parse produced ${parseErrors.length} cell-level errors across ${rawRows.length} rows`,
        );
      }

      // 5. Store parsed data as JSON attachment
      await this.attachmentService.writeParsedData(
        workspaceId,
        reconciliationId,
        normalized,
      );

      // 6. Transition PARSING → PARSED
      await this.stateMachine.transition(
        workspaceId,
        reconciliationId,
        'PARSING',
        'PARSED',
        {
          parsedAt: new Date().toISOString(),
          stats: {
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
          },
        },
      );

      this.logger.log(
        `Parse complete: ${normalized.length} rows for reconciliation ${reconciliationId}`,
      );

      // 7. Auto-chain: transition PARSED → MATCHING and enqueue match job
      await this.stateMachine.transition(
        workspaceId,
        reconciliationId,
        'PARSED',
        'MATCHING',
      );

      await this.queue.add<ReconciliationJobData>('reconciliation-match', {
        workspaceId,
        reconciliationId,
      });

      this.logger.log(
        `Auto-enqueued match job for reconciliation ${reconciliationId}`,
      );
    } catch (error) {
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
