import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
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
};

@Injectable()
export class IngestionPullSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(IngestionPullSchedulerService.name);

  constructor(
    @InjectRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: Repository<IngestionPipelineEntity>,
    @InjectMessageQueue(MessageQueue.ingestionQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Re-register cron jobs for all enabled pull pipelines on startup.
    // Wrapped so a schema drift (e.g. a pending migration that hasn't run
    // yet) doesn't block app boot — the migration runner itself needs the
    // app to boot to execute pending migrations. We log and move on; the
    // next boot after the schema catches up will re-sync cleanly.
    try {
      const pullPipelines = await this.pipelineRepository.find({
        where: {
          mode: 'pull',
          isEnabled: true,
          deletedAt: IsNull(),
        },
      });

      for (const pipeline of pullPipelines) {
        if (isDefined(pipeline.schedule)) {
          await this.syncSchedule(pipeline);
        }
      }

      if (pullPipelines.length > 0) {
        this.logger.log(
          `Re-registered cron jobs for ${pullPipelines.length} pull pipelines`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Skipped pull-pipeline cron re-registration on boot (likely schema drift, will retry on next boot): ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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
