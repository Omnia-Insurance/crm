import { Command, Option } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import {
  type RunOnWorkspaceArgs,
  type WorkspaceCommandOptions,
} from 'src/database/commands/command-runners/workspace.command-runner';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { type IngestionPullJobData } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const PIPELINE_NAME = 'Convoso Agent Productivity Sync';
const DEFAULT_START_DATE = '2025-06-20';
const DEFAULT_CHUNK_DAYS = 7;
const CONVOSO_TIMEZONE = 'America/Los_Angeles';

type BackfillTimeCardsOptions = WorkspaceCommandOptions & {
  startDate?: string;
  endDate?: string;
  chunkDays?: number;
};

@Command({
  name: 'workspace:backfill-time-cards',
  description:
    'Backfill Time Cards from Convoso agent productivity history (chunked by week).',
})
export class BackfillTimeCardsCommand extends ProvisionedWorkspaceCommandRunner<BackfillTimeCardsOptions> {
  @Option({
    flags: '--start-date <date>',
    description: `YYYY-MM-DD. Defaults to ${DEFAULT_START_DATE}.`,
    required: false,
  })
  parseStartDate(value: string): string {
    return value;
  }

  @Option({
    flags: '--end-date <date>',
    description: 'YYYY-MM-DD. Defaults to today.',
    required: false,
  })
  parseEndDate(value: string): string {
    return value;
  }

  @Option({
    flags: '--chunk-days <n>',
    description: `Days per backfill chunk. Defaults to ${DEFAULT_CHUNK_DAYS}.`,
    required: false,
  })
  parseChunkDays(value: string): number {
    const chunkDays = parseInt(value, 10);

    // a zero or negative window never advances the chunk cursor
    if (isNaN(chunkDays) || chunkDays <= 0) {
      throw new Error('--chunk-days must be a positive number');
    }

    return chunkDays;
  }

  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectWorkspaceScopedRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: WorkspaceScopedRepository<IngestionPipelineEntity>,
    @InjectMessageQueue(MessageQueue.ingestionQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs<BackfillTimeCardsOptions>): Promise<void> {
    const startDate = options.startDate ?? DEFAULT_START_DATE;
    const endDate = options.endDate ?? this.todayInTimezone(CONVOSO_TIMEZONE);
    const chunkDays = options.chunkDays ?? DEFAULT_CHUNK_DAYS;

    const pipeline = await this.pipelineRepository.findOne(workspaceId, {
      where: { name: PIPELINE_NAME },
    });

    if (!isDefined(pipeline)) {
      this.logger.error(
        `Pipeline "${PIPELINE_NAME}" not found for workspace ${workspaceId}. Run workspace:seed-convoso-time-card-pipeline first.`,
      );

      return;
    }

    const chunks = this.buildDateChunks(startDate, endDate, chunkDays);

    this.logger.log(
      `Queueing ${chunks.length} backfill chunks (${chunkDays}-day windows) for workspace ${workspaceId}`,
    );

    for (const [index, chunk] of chunks.entries()) {
      if (options.dryRun) {
        this.logger.log(
          `[DRY RUN] chunk ${index + 1}/${chunks.length}: ${chunk.start} → ${chunk.end}`,
        );
        continue;
      }

      await this.messageQueueService.add<IngestionPullJobData>(
        IngestionPullJob.name,
        {
          pipelineId: pipeline.id,
          workspaceId,
          manual: true,
          startTimeOverride: chunk.start,
          endTimeOverride: chunk.end,
        },
        { isWorkspaceJob: true, workspaceId, retryLimit: 3 },
      );

      this.logger.log(
        `Queued chunk ${index + 1}/${chunks.length}: ${chunk.start} → ${chunk.end}`,
      );
    }

    this.logger.log(`Backfill enqueue complete for workspace ${workspaceId}`);
  }

  // Splits [startDate, endDate] into half-open windows ending at midnight
  // of the day AFTER the last included day, so the Convoso API treats each
  // window as a clean date range with no overlap.
  private buildDateChunks(
    startDate: string,
    endDate: string,
    chunkDays: number,
  ): Array<{ start: string; end: string }> {
    const chunks: Array<{ start: string; end: string }> = [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    let cursor = start;

    while (cursor < end) {
      const next = new Date(cursor);

      next.setDate(next.getDate() + chunkDays);
      const windowEnd = next > end ? end : next;

      chunks.push({
        start: this.formatChunkBoundary(cursor),
        end: this.formatChunkBoundary(windowEnd),
      });

      cursor = next;
    }

    return chunks;
  }

  private formatChunkBoundary(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}T00:00:00`;
  }

  private todayInTimezone(timeZone: string): string {
    return new Date().toLocaleString('sv-SE', { timeZone }).split(' ')[0];
  }
}
