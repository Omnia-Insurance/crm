import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { Command, Option } from 'nest-commander';
import { DataSource, Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';

const PIPELINE_NAME = 'Convoso Agent Productivity Sync';

@Command({
  name: 'workspace:seed-convoso-time-card-pipeline',
  description: 'Seed Convoso agent productivity → Time Card ingestion pipeline',
})
export class SeedConvosoTimeCardPipelineCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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
    @InjectRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: Repository<IngestionPipelineEntity>,
    @InjectRepository(IngestionFieldMappingEntity)
    private readonly fieldMappingRepository: Repository<IngestionFieldMappingEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const force = (options as { force?: boolean }).force ?? false;

    this.logger.log(
      `Seeding ${PIPELINE_NAME} for workspace ${workspaceId}`,
    );

    const existing = await this.pipelineRepository.findOne({
      where: { workspaceId, name: PIPELINE_NAME },
    });

    if (existing && !force) {
      this.logger.log(
        `Pipeline already exists for workspace ${workspaceId}, skipping (use --force to recreate)`,
      );

      return;
    }

    if (existing && force) {
      this.logger.log(`Deleting existing pipeline ${existing.id}`);
      await this.pipelineRepository.delete(existing.id);
    }

    const pipeline = await this.pipelineRepository.save({
      workspaceId,
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
          // 26 hours: covers yesterday's full LA-time day with a 2h overlap
          // to absorb late-arriving events near the day boundary.
          lookbackMinutes: 26 * 60,
          timezone: 'America/Los_Angeles',
        },
      },
      paginationConfig: {
        type: 'offset',
        paramName: 'offset',
        pageSize: 1000,
      },
      responseRecordsPath: 'data.entries',
      // Composite dedup: one Time Card per (agent, day). The relation
      // resolver fills the agent FK from convosoUserId before dedup runs.
      // The column name varies by workspace based on what the relation
      // field was named at object-creation time.
      dedupFieldNames: [await this.resolveAgentColumn(workspaceId), 'date'],
      // Hourly. Dedup is on (agent, date) so each run refreshes the same
      // ~50 rows with the running daily totals — no row growth, current-
      // day cards lag at most an hour. Timezone-agnostic by design.
      schedule: '0 * * * *',
      isEnabled: true,
    });

    this.logger.log(`Created pipeline ${pipeline.id}`);

    if (options.dryRun) {
      this.logger.log('[DRY RUN] Would create field mappings (see below)');
      this.logFieldMappings();

      return;
    }

    const mappings = this.buildFieldMappings(
      pipeline.id,
      await this.resolveAgentColumn(workspaceId),
    );

    await this.fieldMappingRepository.save(mappings);

    this.logger.log(`Created ${mappings.length} field mappings`);
    this.logger.log(`Pipeline setup complete for workspace ${workspaceId}`);
  }

  // The agent FK column on `_timeCard` is `agentId` or `agentsId` depending
  // on what the relation field was named when the workspace's Time Card
  // object was created via the UI (Twenty derives `{fieldName}Id`). Probe
  // the workspace schema to figure out which one this workspace uses.
  private async resolveAgentColumn(workspaceId: string): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT schema FROM core."dataSource" WHERE "workspaceId" = $1 LIMIT 1`,
      [workspaceId],
    );
    const schemaName = rows?.[0]?.schema as string | undefined;

    if (!schemaName) {
      throw new Error(`No dataSource schema for workspace ${workspaceId}`);
    }

    for (const candidate of ['agentId', 'agentsId']) {
      const exists = await this.dataSource.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = '_timeCard' AND column_name = $2
        )`,
        [schemaName, candidate],
      );

      if (exists?.[0]?.exists) {
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
    this.logger.log('Field Mappings (post-aggregation, from TimeCardPreprocessor):');
    this.logger.log(
      '  user_id → agentId|agentsId (lookup AgentProfile by convosoUserId)',
    );
    this.logger.log('  date → date');
    this.logger.log('  loginSeconds → loginSeconds');
    this.logger.log('  pauseSeconds → pauseSeconds');
    this.logger.log('  billableHours → billableHours');
  }
}
