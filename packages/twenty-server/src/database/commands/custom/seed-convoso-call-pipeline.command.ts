import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { ActiveOrSuspendedWorkspacesMigrationCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspaces-migration.command-runner';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DataSourceService } from 'src/engine/metadata-modules/data-source/data-source.service';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

@Command({
  name: 'workspace:seed-convoso-call-pipeline',
  description: 'Seed Convoso Call ingestion pipeline',
})
export class SeedConvosoCallPipelineCommand extends ActiveOrSuspendedWorkspacesMigrationCommandRunner {
  protected override readonly logger = new Logger(
    SeedConvosoCallPipelineCommand.name,
  );

  constructor(
    @InjectRepository(WorkspaceEntity)
    protected readonly workspaceRepository: Repository<WorkspaceEntity>,
    protected readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    protected readonly dataSourceService: DataSourceService,
    @InjectRepository(IngestionPipelineEntity)
    private readonly pipelineRepository: Repository<IngestionPipelineEntity>,
    @InjectRepository(IngestionFieldMappingEntity)
    private readonly fieldMappingRepository: Repository<IngestionFieldMappingEntity>,
  ) {
    super(workspaceRepository, globalWorkspaceOrmManager, dataSourceService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    this.logger.log(
      `Seeding Convoso Call pipeline for workspace ${workspaceId}`,
    );

    // Check if pipeline already exists
    const existing = await this.pipelineRepository.findOne({
      where: {
        workspaceId,
        name: 'Convoso Call Sync',
      },
    });

    if (existing && !options.force) {
      this.logger.log(
        `Pipeline already exists for workspace ${workspaceId}, skipping (use --force to recreate)`,
      );

      return;
    }

    if (existing && options.force) {
      this.logger.log(`Deleting existing pipeline ${existing.id}`);
      await this.pipelineRepository.delete(existing.id);
    }

    // Generate webhook secret
    const webhookSecret =
      process.env.CONVOSO_WEBHOOK_SECRET ||
      `convoso_call_${uuidv4().replace(/-/g, '')}`;

    // Create pipeline
    const pipeline = await this.pipelineRepository.save({
      workspaceId,
      name: 'Convoso Call Sync',
      description:
        'Automatically ingest call data from Convoso webhooks',
      mode: 'push',
      targetObjectNameSingular: 'call',
      webhookSecret,
      dedupFieldName: 'convosoCallId',
      isEnabled: true,
    });

    this.logger.log(`Created pipeline ${pipeline.id}`);
    this.logger.log(`Webhook URL: POST /ingestion/${pipeline.id}`);
    this.logger.log(`Webhook Secret: ${webhookSecret}`);

    if (options.dryRun) {
      this.logger.log('[DRY RUN] Would create field mappings (see below)');
      this.logFieldMappings();

      return;
    }

    // Create field mappings
    const mappings = this.buildFieldMappings(pipeline.id);

    await this.fieldMappingRepository.save(mappings);

    this.logger.log(`Created ${mappings.length} field mappings`);
    this.logger.log(`Pipeline setup complete for workspace ${workspaceId}`);
  }

  private buildFieldMappings(
    pipelineId: string,
  ): Partial<IngestionFieldMappingEntity>[] {
    return [
      // 1. uniqueid -> convosoCallId (dedup key)
      {
        pipelineId,
        sourceFieldPath: 'uniqueid',
        targetFieldName: 'convosoCallId',
        position: 0,
      },

      // 2. lead_id -> convosoLeadId (sanitizeNull)
      {
        pipelineId,
        sourceFieldPath: 'lead_id',
        targetFieldName: 'convosoLeadId',
        transform: {
          type: 'sanitizeNull',
        },
        position: 1,
      },

      // 3. call_date -> callDate (dateFormat)
      {
        pipelineId,
        sourceFieldPath: 'call_date',
        targetFieldName: 'callDate',
        transform: {
          type: 'dateFormat',
          sourceFormat: 'ISO',
        },
        position: 2,
      },

      // 4. call_length -> duration (numberScale x1)
      {
        pipelineId,
        sourceFieldPath: 'call_length',
        targetFieldName: 'duration',
        transform: {
          type: 'numberScale',
          multiplier: 1,
        },
        position: 3,
      },

      // 5. status -> status (sanitizeNull)
      {
        pipelineId,
        sourceFieldPath: 'status',
        targetFieldName: 'status',
        transform: {
          type: 'sanitizeNull',
        },
        position: 4,
      },

      // 6. status_name -> statusName (sanitizeNull)
      {
        pipelineId,
        sourceFieldPath: 'status_name',
        targetFieldName: 'statusName',
        transform: {
          type: 'sanitizeNull',
        },
        position: 5,
      },

      // 7. queue_name -> queueName (sanitizeNull)
      {
        pipelineId,
        sourceFieldPath: 'queue_name',
        targetFieldName: 'queueName',
        transform: {
          type: 'sanitizeNull',
        },
        position: 6,
      },

      // 8. _direction -> direction (computed by preprocessor)
      {
        pipelineId,
        sourceFieldPath: '_direction',
        targetFieldName: 'direction',
        position: 7,
      },

      // 9. _name -> name (computed by preprocessor)
      {
        pipelineId,
        sourceFieldPath: '_name',
        targetFieldName: 'name',
        position: 8,
      },

      // 10. _personId -> leadId (computed by preprocessor)
      {
        pipelineId,
        sourceFieldPath: '_personId',
        targetFieldName: 'leadId',
        position: 9,
      },

      // 11. _leadSourceId -> leadSourceId (computed by preprocessor)
      {
        pipelineId,
        sourceFieldPath: '_leadSourceId',
        targetFieldName: 'leadSourceId',
        position: 10,
      },

      // 12. _billable -> billable (computed by preprocessor)
      {
        pipelineId,
        sourceFieldPath: '_billable',
        targetFieldName: 'billable',
        position: 11,
      },

      // 13. _costAmountMicros -> cost.amountMicros (computed by preprocessor)
      {
        pipelineId,
        sourceFieldPath: '_costAmountMicros',
        targetFieldName: 'cost',
        targetCompositeSubField: 'amountMicros',
        position: 12,
      },

      // 14. _costCurrencyCode -> cost.currencyCode (computed by preprocessor)
      {
        pipelineId,
        sourceFieldPath: '_costCurrencyCode',
        targetFieldName: 'cost',
        targetCompositeSubField: 'currencyCode',
        position: 13,
      },

      // 15. user_id -> agentId (relation lookup via agentProfile.convosoUserId)
      {
        pipelineId,
        sourceFieldPath: 'user_id',
        targetFieldName: 'agentId',
        relationTargetObjectName: 'agentProfile',
        relationMatchFieldName: 'convosoUserId',
        relationAutoCreate: false,
        position: 14,
      },
    ];
  }

  private logFieldMappings(): void {
    this.logger.log('Field Mappings:');
    this.logger.log('  uniqueid → convosoCallId');
    this.logger.log('  lead_id → convosoLeadId (sanitizeNull)');
    this.logger.log('  call_date → callDate (dateFormat: ISO)');
    this.logger.log('  call_length → duration (numberScale ×1)');
    this.logger.log('  status → status (sanitizeNull)');
    this.logger.log('  status_name → statusName (sanitizeNull)');
    this.logger.log('  queue_name → queueName (sanitizeNull)');
    this.logger.log('  _direction → direction (preprocessor: INBOUND/OUTBOUND)');
    this.logger.log('  _name → name (preprocessor: Direction - Label)');
    this.logger.log('  _personId → leadId (preprocessor: find/create Person by phone)');
    this.logger.log('  _leadSourceId → leadSourceId (preprocessor: find/create LeadSource)');
    this.logger.log('  _billable → billable (preprocessor: billing by queue name)');
    this.logger.log('  _costAmountMicros → cost.amountMicros (preprocessor: billing cost)');
    this.logger.log('  _costCurrencyCode → cost.currencyCode (preprocessor: USD)');
    this.logger.log('  user_id → agentId (find AgentProfile by convosoUserId)');
  }
}
