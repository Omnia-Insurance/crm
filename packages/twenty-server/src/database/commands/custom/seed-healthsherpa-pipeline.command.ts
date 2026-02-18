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

// Health Sherpa policy status → CRM status mapping
const POLICY_STATUS_MAPPING = {
  pending_effectuation: 'PENDING',
  effectuated: 'ACTIVE_APPROVED',
  cancelled: 'CANCELED',
  terminated: 'CANCELED',
  unknown: 'PENDING',
};

@Command({
  name: 'workspace:seed-healthsherpa-pipeline',
  description: 'Seed Health Sherpa policy ingestion pipeline',
})
export class SeedHealthSherpaPipelineCommand extends ActiveOrSuspendedWorkspacesMigrationCommandRunner {
  protected override readonly logger = new Logger(
    SeedHealthSherpaPipelineCommand.name,
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
      `Seeding Health Sherpa pipeline for workspace ${workspaceId}`,
    );

    // Check if pipeline already exists
    const existing = await this.pipelineRepository.findOne({
      where: {
        workspaceId,
        name: 'Health Sherpa Policies',
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
      process.env.HEALTHSHERPA_WEBHOOK_SECRET ||
      `hs-${uuidv4().replace(/-/g, '')}`;

    // Create pipeline
    const pipeline = await this.pipelineRepository.save({
      workspaceId,
      name: 'Health Sherpa Policies',
      description:
        'Automatically ingest policy data from Health Sherpa webhooks',
      mode: 'push',
      targetObjectNameSingular: 'policy',
      webhookSecret,
      dedupFieldName: 'applicationId', // Match on applicationId to update existing
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
      // External system tracking
      {
        pipelineId,
        sourceFieldPath: 'application_id',
        targetFieldName: 'applicationId',
        position: 0,
      },
      {
        pipelineId,
        sourceFieldPath: 'policy_id',
        targetFieldName: 'externalPolicyId',
        position: 1,
      },
      {
        pipelineId,
        sourceFieldPath: '_source', // Will be set to "healthsherpa" in preprocessor
        targetFieldName: 'externalSource',
        position: 2,
      },

      // Policy basic info
      {
        pipelineId,
        sourceFieldPath: 'plan_name',
        targetFieldName: 'policyNumber', // Use plan name as policy number
        position: 3,
      },
      {
        pipelineId,
        sourceFieldPath: 'plan_hios_id',
        targetFieldName: 'planIdentifier',
        position: 4,
      },

      // Policy status (with mapping transform)
      {
        pipelineId,
        sourceFieldPath: 'policy_status',
        targetFieldName: 'status',
        transform: {
          type: 'map',
          mapping: POLICY_STATUS_MAPPING,
        },
        position: 5,
      },

      // Dates
      {
        pipelineId,
        sourceFieldPath: 'effective_date',
        targetFieldName: 'effectiveDate',
        position: 6,
      },
      {
        pipelineId,
        sourceFieldPath: 'expiration_date',
        targetFieldName: 'expirationDate',
        position: 7,
      },

      // Premium (convert dollars to micros)
      {
        pipelineId,
        sourceFieldPath: 'gross_premium',
        targetFieldName: 'premium',
        targetCompositeSubField: 'amountMicros',
        transform: {
          type: 'multiply',
          factor: 1000000, // Convert dollars to micros
        },
        position: 8,
      },
      {
        pipelineId,
        sourceFieldPath: '_usd', // Static value for currency
        targetFieldName: 'premium',
        targetCompositeSubField: 'currencyCode',
        transform: {
          type: 'static',
          value: 'USD',
        },
        position: 9,
      },

      // Payment tracking
      {
        pipelineId,
        sourceFieldPath: 'payment_status',
        targetFieldName: 'paymentStatus',
        position: 10,
      },

      // Member identifiers (array)
      {
        pipelineId,
        sourceFieldPath: 'member_ids',
        targetFieldName: 'memberIdentifiers',
        transform: {
          type: 'json_array', // Ensure it's stored as JSON array
        },
        position: 11,
      },

      // Sync metadata
      {
        pipelineId,
        sourceFieldPath: '_now', // Will be set to current timestamp in preprocessor
        targetFieldName: 'lastExternalSync',
        position: 12,
      },

      // Relations: Carrier (find or create)
      {
        pipelineId,
        sourceFieldPath: 'carrier_name',
        targetFieldName: 'carrierId',
        relationTargetObjectName: 'carrier',
        relationMatchFieldName: 'name',
        relationAutoCreate: true, // Auto-create carrier if not exists
        position: 13,
      },

      // Relations: Product (find or create)
      {
        pipelineId,
        sourceFieldPath: 'plan_name',
        targetFieldName: 'productId',
        relationTargetObjectName: 'product',
        relationMatchFieldName: 'name',
        relationAutoCreate: true, // Auto-create product if not exists
        position: 14,
      },

      // Relations: Agent (find by NPN)
      {
        pipelineId,
        sourceFieldPath: 'policy_aor_npn',
        targetFieldName: 'agentId',
        relationTargetObjectName: 'agentProfile',
        relationMatchFieldName: 'npn', // Assuming AgentProfile has NPN field
        relationAutoCreate: false, // Don't auto-create agents
        position: 15,
      },

      // Relations: Person/Lead (will be set by preprocessor after smart matching)
      {
        pipelineId,
        sourceFieldPath: '_personId', // Injected by preprocessor
        targetFieldName: 'leadId',
        position: 16,
      },
    ];
  }

  private logFieldMappings(): void {
    this.logger.log('Field Mappings:');
    this.logger.log('  application_id → applicationId');
    this.logger.log('  policy_id → externalPolicyId');
    this.logger.log('  plan_name → policyNumber');
    this.logger.log('  plan_hios_id → planIdentifier');
    this.logger.log('  policy_status → status (with mapping)');
    this.logger.log('  effective_date → effectiveDate');
    this.logger.log('  expiration_date → expirationDate');
    this.logger.log('  gross_premium → premium.amountMicros (×1,000,000)');
    this.logger.log('  payment_status → paymentStatus');
    this.logger.log('  member_ids → memberIdentifiers');
    this.logger.log('  carrier_name → carrierId (find/create Carrier)');
    this.logger.log('  plan_name → productId (find/create Product)');
    this.logger.log('  policy_aor_npn → agentId (find AgentProfile by NPN)');
    this.logger.log('  [smart match] → leadId (find/create Person)');
  }
}
