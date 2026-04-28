import { Logger, Scope } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { parseXlsxSheet } from 'src/modules/reconciliation/parsers/xlsx';
import {
  TRANSFORMS,
  inferDataType,
  resolveFieldMapping,
} from 'src/modules/reconciliation/parsers/transforms';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import type { ReconciliationJobData } from 'src/modules/reconciliation/types/reconciliation';

@Processor({
  queueName: MessageQueue.reconciliationQueue,
  scope: Scope.REQUEST,
})
export class CommissionParseJob {
  private readonly logger = new Logger(CommissionParseJob.name);

  constructor(
    private readonly dataService: ReconciliationDataService,
    private readonly attachmentService: ReconciliationAttachmentService,
    private readonly stateMachine: ReconciliationStateMachineService,
    @InjectMessageQueue(MessageQueue.reconciliationQueue)
    private readonly queue: MessageQueueService,
  ) {}

  @Process('commission-parse')
  async handle({
    workspaceId,
    reconciliationId: statementId,
  }: ReconciliationJobData): Promise<void> {
    this.logger.log(`Starting commission parse for statement ${statementId}`);

    try {
      // 1. Fetch statement record + carrier config
      const statement = await this.dataService.getCommissionStatement(
        workspaceId,
        statementId,
      );

      if (!statement.carrierConfigId) {
        throw new Error('No carrier config linked to this commission statement');
      }

      const carrierConfig = await this.dataService.getCarrierConfig(
        workspaceId,
        statement.carrierConfigId,
      );

      const columnMapping = statement.columnMapping;

      if (!columnMapping || Object.keys(columnMapping).length === 0) {
        throw new Error(
          'Commission statement has no column mapping. The import dialog must capture column matches before the pipeline can run.',
        );
      }

      // 2. Download the uploaded file
      const fileBuffer =
        await this.attachmentService.readCommissionStatementFile(
          workspaceId,
          statementId,
        );

      // 3. Parse into raw rows
      const rawRows = parseXlsxSheet(
        fileBuffer,
        statement.sheetName ?? undefined,
      );

      this.logger.log(`Parsed ${rawRows.length} raw rows from statement file`);

      // 4. Apply type transforms
      const headerTypes = new Map<string, string>();

      for (const [header, entry] of Object.entries(columnMapping)) {
        headerTypes.set(header, inferDataType(entry.fieldType));
      }

      const normalized: Record<string, unknown>[] = [];
      const parseErrors: { rowNumber: number; error: string }[] = [];

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
            } catch {
              row[header] = rawValue;
            }
          }

          row.__rowNumber = i + 1;
          normalized.push(row);
        } catch (rowError) {
          parseErrors.push({
            rowNumber: i + 1,
            error:
              rowError instanceof Error ? rowError.message : String(rowError),
          });
        }
      }

      if (parseErrors.length > 0) {
        this.logger.warn(
          `Commission parse produced ${parseErrors.length} errors across ${rawRows.length} rows`,
        );
      }

      // 5. Store parsed data
      await this.attachmentService.writeCommissionParsedData(
        workspaceId,
        statementId,
        normalized,
      );

      // 6. Transition PARSING → MATCHING and auto-chain
      await this.stateMachine.transitionCommissionStatement(
        workspaceId,
        statementId,
        'PARSING',
        'MATCHING',
        { stats: { totalLines: normalized.length } },
      );

      await this.queue.add<ReconciliationJobData>('commission-match', {
        workspaceId,
        reconciliationId: statementId,
      });

      this.logger.log(
        `Commission parse complete: ${normalized.length} rows for statement ${statementId}`,
      );
    } catch (error) {
      await this.stateMachine.setCommissionStatementFailed(
        workspaceId,
        statementId,
        'PARSE',
        error,
      );

      throw error;
    }
  }
}
