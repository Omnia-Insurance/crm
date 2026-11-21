import { InjectRepository } from '@nestjs/typeorm';

import { Command, Option } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

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

const PIPELINE_NAME = 'Health Sherpa Policies';

// Health Sherpa policy status → CRM status mapping
const POLICY_STATUS_MAPPING = {
  pending_effectuation: 'PENDING',
  effectuated: 'ACTIVE_APPROVED',
  cancelled: 'CANCELED',
  terminated: 'CANCELED',
  unknown: 'PENDING',
};

type SeedHealthSherpaPipelineOptions = WorkspaceCommandOptions & {
  force?: boolean;
};

@Command({
  name: 'workspace:seed-healthsherpa-pipeline',
  description: 'Seed Health Sherpa policy ingestion pipeline',
})
export class SeedHealthSherpaPipelineCommand extends ProvisionedWorkspaceCommandRunner<SeedHealthSherpaPipelineOptions> {
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
  }: RunOnWorkspaceArgs<SeedHealthSherpaPipelineOptions>): Promise<void> {
    const force = options.force ?? false;

    this.logger.log(
      `Seeding Health Sherpa pipeline for workspace ${workspaceId}`,
    );

    const existing = await this.pipelineRepository.findOne(workspaceId, {
      where: { name: PIPELINE_NAME },
    });

    if (isDefined(existing) && !force) {
      this.logger.log(
        `Pipeline already exists for workspace ${workspaceId}, skipping (use --force to recreate)`,
      );

      return;
    }

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

    const webhookSecretFromEnv = process.env.HEALTHSHERPA_WEBHOOK_SECRET;
    const webhookSecret =
      webhookSecretFromEnv || `hs-${uuidv4().replace(/-/g, '')}`;

    const pipeline = await this.pipelineRepository.insertAndReturnOne(
      workspaceId,
      {
        name: PIPELINE_NAME,
        description:
          'Automatically ingest policy data from Health Sherpa webhooks',
        mode: 'push',
        targetObjectNameSingular: 'policy',
        webhookSecret,
        // update existing policies matched on applicationId
        dedupFieldNames: ['applicationId'],
        isEnabled: true,
      },
    );

    this.logger.log(`Created pipeline ${pipeline.id}`);
    this.logger.log(`Webhook URL: POST /ingestion/${pipeline.id}`);
    this.logger.log(
      `Webhook secret ${webhookSecretFromEnv ? 'taken from HEALTHSHERPA_WEBHOOK_SECRET' : 'generated'}; admins can copy it from the pipeline's settings page`,
    );

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

      // Policy display name (computed by preprocessor: "Carrier - ProductType")
      {
        pipelineId,
        sourceFieldPath: '_displayName',
        targetFieldName: 'name',
        position: 3,
      },

      // Policy basic info
      {
        pipelineId,
        sourceFieldPath: '_policyNumber', // application_id injected by preprocessor
        targetFieldName: 'policyNumber',
        position: 4,
      },
      {
        pipelineId,
        sourceFieldPath: 'plan_hios_id',
        targetFieldName: 'planIdentifier',
        position: 5,
      },

      // Policy status (with mapping transform)
      {
        pipelineId,
        sourceFieldPath: 'policy_status',
        targetFieldName: 'status',
        transform: {
          type: 'map',
          values: POLICY_STATUS_MAPPING,
        },
        position: 6,
      },

      // Dates
      {
        pipelineId,
        sourceFieldPath: 'effective_date',
        targetFieldName: 'effectiveDate',
        position: 7,
      },
      {
        pipelineId,
        sourceFieldPath: 'expiration_date',
        targetFieldName: 'expirationDate',
        position: 8,
      },

      // Premium (convert dollars to micros)
      {
        pipelineId,
        sourceFieldPath: 'gross_premium',
        targetFieldName: 'premium',
        targetCompositeSubField: 'amountMicros',
        transform: {
          type: 'numberScale',
          multiplier: 1000000, // Convert dollars to micros
        },
        position: 9,
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
        position: 10,
      },

      // Payment tracking
      {
        pipelineId,
        sourceFieldPath: 'payment_status',
        targetFieldName: 'paymentStatus',
        position: 11,
      },

      // Member identifiers (array)
      {
        pipelineId,
        sourceFieldPath: 'member_ids',
        targetFieldName: 'memberIdentifiers',
        position: 12,
      },

      // Sync metadata
      {
        pipelineId,
        sourceFieldPath: '_now', // Will be set to current timestamp in preprocessor
        targetFieldName: 'lastExternalSync',
        position: 13,
      },

      // Relations: Carrier (find or create)
      {
        pipelineId,
        sourceFieldPath: 'carrier_name',
        targetFieldName: 'carrierId',
        relationTargetObjectName: 'carrier',
        relationMatchFieldName: 'name',
        relationAutoCreate: true, // Auto-create carrier if not exists
        position: 14,
      },

      // Relations: Product (find or create)
      {
        pipelineId,
        sourceFieldPath: 'plan_name',
        targetFieldName: 'productId',
        relationTargetObjectName: 'product',
        relationMatchFieldName: 'name',
        relationAutoCreate: true, // Auto-create product if not exists
        position: 15,
      },

      // Relations: Agent (find by NPN)
      {
        pipelineId,
        sourceFieldPath: 'policy_aor_npn',
        targetFieldName: 'agentId',
        relationTargetObjectName: 'agentProfile',
        relationMatchFieldName: 'npn', // Assuming AgentProfile has NPN field
        relationAutoCreate: false, // Don't auto-create agents
        position: 16,
      },

      // Relations: Person/Lead (will be set by preprocessor after smart matching)
      {
        pipelineId,
        sourceFieldPath: '_personId', // Injected by preprocessor
        targetFieldName: 'leadId',
        position: 17,
      },
    ];
  }

  private logFieldMappings(): void {
    this.logger.log('Field Mappings:');
    this.logger.log('  application_id → applicationId');
    this.logger.log('  policy_id → externalPolicyId');
    this.logger.log('  _displayName → name (Carrier - ProductType)');
    this.logger.log('  _policyNumber → policyNumber');
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
