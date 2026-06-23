import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { ComputeAgentRollupsCronCommand } from 'src/modules/agent-rollup/crons/compute-agent-rollups.cron.command';
import { ComputeAgentRollupsCronJob } from 'src/modules/agent-rollup/crons/compute-agent-rollups.cron.job';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

// OMNIA-CUSTOM: agent performance rollups — computes per-agent metrics
// (total policies, 6-month placement rate, billable + off-phone hours) onto
// agentProfile fields for a leaderboard dashboard. Provides the manual compute
// service, the scheduled recompute (cron job + registration command). Loaded in
// DatabaseCommandModule (commands + cron registration) and core-engine.module
// (so the worker processes the cron job).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObjectMetadataEntity,
      FieldMetadataEntity,
      WorkspaceEntity,
    ]),
    FieldMetadataModule,
    GlobalWorkspaceDataSourceModule,
  ],
  providers: [
    AgentRollupService,
    ComputeAgentRollupsCronJob,
    ComputeAgentRollupsCronCommand,
  ],
  exports: [AgentRollupService, ComputeAgentRollupsCronCommand],
})
export class AgentRollupModule {}
