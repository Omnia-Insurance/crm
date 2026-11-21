import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { IsNull, Repository } from 'typeorm';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';

export type IngestionPullJobData = {
  pipelineId: string;
  workspaceId: string;
  // Set when triggered via the GraphQL mutation. Lets the worker run a
  // pull even when isEnabled is false, so a pipeline can be paused (cron
  // off) for backfill while still accepting manual triggers.
  manual?: boolean;
  // Per-trigger date window. When set, the worker uses these instead of
  // the pipeline's sourceRequestConfig.dateRangeParams overrides — lets
  // backfills fire many parallel chunks without fighting over the shared
  // pipeline config. Live cadence pulls leave these unset and continue
  // to read the pipeline config (lookback minutes).
  startTimeOverride?: string;
  endTimeOverride?: string;
  // The log a manual trigger returned to its caller; scheduled pulls create their own
  logId?: string;
};

@Injectable()
export class IngestionPullSchedulerService {
  private readonly logger = new Logger(IngestionPullSchedulerService.name);

  constructor(
    // The re-sync scans enabled pull pipelines across every workspace
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: Repository<IngestionPipelineEntity>,
    @InjectMessageQueue(MessageQueue.ingestionQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  // Called from cron:register:all at server start, never on module init:
  // that ran in every API, worker and CLI process and raced on the schedulers
  async resyncEnabledPullSchedules(): Promise<number> {
    // Schema drift (an upgrade still pending) must not fail
    // cron:register:all; the next run re-syncs
    try {
      const pullPipelines = await this.pipelineRepository.find({
        where: {
          mode: 'pull',
          isEnabled: true,
          deletedAt: IsNull(),
        },
      });

      const scheduledPullPipelines = pullPipelines.filter((pipeline) =>
        isDefined(pipeline.schedule),
      );

      for (const pipeline of scheduledPullPipelines) {
        await this.syncSchedule(pipeline);
      }

      if (scheduledPullPipelines.length > 0) {
        this.logger.log(
          `Re-registered cron jobs for ${scheduledPullPipelines.length} pull pipelines`,
        );
      }

      return scheduledPullPipelines.length;
    } catch (error) {
      this.logger.warn(
        `Skipped pull-pipeline cron re-registration (likely schema drift, will retry on next run): ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return 0;
    }
  }

  async syncSchedule(pipeline: IngestionPipelineEntity): Promise<void> {
    const jobId = this.getJobId(pipeline.id);

    // Always remove existing cron first
    try {
      await this.messageQueueService.removeCron({
        jobName: IngestionPullJob.name,
        jobId,
      });
    } catch {
      // Job might not exist yet
    }

    // Re-create if pipeline is enabled + pull mode + has schedule
    if (
      pipeline.isEnabled &&
      pipeline.mode === 'pull' &&
      isDefined(pipeline.schedule)
    ) {
      await this.messageQueueService.addCron<IngestionPullJobData>({
        jobName: IngestionPullJob.name,
        data: {
          pipelineId: pipeline.id,
          workspaceId: pipeline.workspaceId,
        },
        options: {
          repeat: { pattern: pipeline.schedule },
        },
        jobId,
      });

      this.logger.log(
        `Scheduled pull job for pipeline ${pipeline.id} with pattern "${pipeline.schedule}"`,
      );
    } else {
      this.logger.log(`Removed pull schedule for pipeline ${pipeline.id}`);
    }
  }

  private getJobId(pipelineId: string): string {
    return `ingestion-pull-${pipelineId}`;
  }
}
