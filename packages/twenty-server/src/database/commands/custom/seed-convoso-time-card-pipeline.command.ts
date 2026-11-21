import { InjectRepository } from '@nestjs/typeorm';

import { Command, Option } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { type DataSource, Repository } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import {
  type RunOnWorkspaceArgs,
  type WorkspaceCommandOptions,
} from 'src/database/commands/command-runners/workspace.command-runner';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const PIPELINE_NAME = 'Convoso Agent Productivity Sync';

type SeedConvosoTimeCardPipelineOptions = WorkspaceCommandOptions & {
  force?: boolean;
};

@Command({
  name: 'workspace:seed-convoso-time-card-pipeline',
  description: 'Seed Convoso agent productivity → Time Card ingestion pipeline',
})
export class SeedConvosoTimeCardPipelineCommand extends ProvisionedWorkspaceCommandRunner<SeedConvosoTimeCardPipelineOptions> {
  @Option({
    flags: '-f, --force',
    description: 'Delete and recreate the pipeline if it already exists.',
    required: false,
  })
  parseForce(): boolean {
    return true;
  }

  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectWorkspaceScopedRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: WorkspaceScopedRepository<IngestionPipelineEntity>,
    // mapping rows are scoped through their pipeline and carry no workspaceId
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(IngestionFieldMappingEntity)
    private readonly fieldMappingRepository: Repository<IngestionFieldMappingEntity>,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
    dataSource,
  }: RunOnWorkspaceArgs<SeedConvosoTimeCardPipelineOptions>): Promise<void> {
    const force = options.force ?? false;

    this.logger.log(`Seeding ${PIPELINE_NAME} for workspace ${workspaceId}`);

    if (!isDefined(dataSource)) {
      this.logger.warn(
        `No data source for workspace ${workspaceId}, skipping ${PIPELINE_NAME}`,
      );

      return;
    }

    const existing = await this.pipelineRepository.findOne(workspaceId, {
      where: { name: PIPELINE_NAME },
    });

    if (isDefined(existing) && !force) {
      this.logger.log(
        `Pipeline already exists for workspace ${workspaceId}, skipping (use --force to recreate)`,
      );

      return;
    }

    const agentColumn = await this.resolveAgentColumn(dataSource, workspaceId);

    if (options.dryRun) {
      this.logger.log(
        isDefined(existing)
          ? `[DRY RUN] Would delete pipeline ${existing.id} and recreate it with these field mappings`
          : '[DRY RUN] Would create the pipeline with these field mappings',
      );
      this.logFieldMappings();

      return;
    }

    if (isDefined(existing)) {
      this.logger.log(`Deleting existing pipeline ${existing.id}`);
      await this.pipelineRepository.delete(workspaceId, { id: existing.id });
    }

    const pipeline = await this.pipelineRepository.insertAndReturnOne(
      workspaceId,
      {
        name: PIPELINE_NAME,
        description:
          'Daily roll-up of Convoso agent productivity events into one Time Card per (agent, day).',
        mode: 'pull',
        targetObjectNameSingular: 'timeCard',
        sourceUrl: 'https://api.convoso.com/v1/agent-productivity/search',
        sourceHttpMethod: 'GET',
        sourceAuthConfig: {
          type: 'query_param',
          paramName: 'auth_token',
          envVar: 'CONVOSO_API_TOKEN',
        },
        sourceRequestConfig: {
          dateRangeParams: {
            startParam: 'date_start',
            endParam: 'date_end',
            // Time cards upsert per (agent, day), so the window must cover
            // whole days: a rolling intra-day window would overwrite each
            // aging day with a partial aggregate.
            lookbackMinutes: 26 * 60,
            timezone: 'America/Los_Angeles',
            snapStartToDay: true,
          },
        },
        paginationConfig: {
          type: 'offset',
          paramName: 'offset',
          pageSize: 1000,
        },
        responseRecordsPath: 'data.entries',
        // the relation resolver fills the agent FK from convosoUserId before dedup runs
        dedupFieldNames: [agentColumn, 'date'],
        // hourly refresh of the same (agent, date) rows; no row growth
        schedule: '0 * * * *',
        isEnabled: true,
      },
    );

    this.logger.log(`Created pipeline ${pipeline.id}`);

    const mappings = this.buildFieldMappings(pipeline.id, agentColumn);

    await this.fieldMappingRepository.save(mappings);

    this.logger.log(`Created ${mappings.length} field mappings`);
    this.logger.log(`Pipeline setup complete for workspace ${workspaceId}`);
  }

  // Twenty derives the FK column from the relation field name, which differed
  // across workspaces (`agentId` or `agentsId`).
  private async resolveAgentColumn(
    dataSource: DataSource,
    workspaceId: string,
  ): Promise<string> {
    const schemaName = getWorkspaceSchemaName(workspaceId);

    for (const candidate of ['agentId', 'agentsId']) {
      const rows: { exists: boolean }[] = await dataSource.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = '_timeCard' AND column_name = $2
        )`,
        [schemaName, candidate],
      );

      if (rows[0]?.exists === true) {
        return candidate;
      }
    }

    throw new Error(
      `Could not find agent FK column on ${schemaName}._timeCard — ensure the Time Card object exists with a relation to Agent Profile.`,
    );
  }

  private buildFieldMappings(
    pipelineId: string,
    agentColumn: string,
  ): Partial<IngestionFieldMappingEntity>[] {
    return [
      // Resolve Convoso user_id → AgentProfile via convosoUserId.
      {
        pipelineId,
        sourceFieldPath: 'user_id',
        targetFieldName: agentColumn,
        relationTargetObjectName: 'agentProfile',
        relationMatchFieldName: 'convosoUserId',
        relationAutoCreate: false,
        position: 0,
      },
      {
        pipelineId,
        sourceFieldPath: 'date',
        targetFieldName: 'date',
        position: 1,
      },
      {
        pipelineId,
        sourceFieldPath: 'loginSeconds',
        targetFieldName: 'loginSeconds',
        position: 2,
      },
      {
        pipelineId,
        sourceFieldPath: 'pauseSeconds',
        targetFieldName: 'pauseSeconds',
        position: 3,
      },
      {
        pipelineId,
        sourceFieldPath: 'billableHours',
        targetFieldName: 'billableHours',
        position: 4,
      },
      // "{Agent Name} - {date}" — set by the preprocessor.
      {
        pipelineId,
        sourceFieldPath: 'name',
        targetFieldName: 'name',
        position: 5,
      },
    ];
  }

  private logFieldMappings(): void {
    this.logger.log(
      'Field Mappings (post-aggregation, from TimeCardPreprocessor):',
    );
    this.logger.log(
      '  user_id → agentId|agentsId (lookup AgentProfile by convosoUserId)',
    );
    this.logger.log('  date → date');
    this.logger.log('  loginSeconds → loginSeconds');
    this.logger.log('  pauseSeconds → pauseSeconds');
    this.logger.log('  billableHours → billableHours');
  }
}
