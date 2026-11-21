import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { ComputeAgentRollupsCronCommand } from 'src/modules/agent-rollup/crons/compute-agent-rollups.cron.command';
import { ComputeAgentRollupsCronJob } from 'src/modules/agent-rollup/crons/compute-agent-rollups.cron.job';
import { ComputeAgentRollupsJob } from 'src/modules/agent-rollup/jobs/compute-agent-rollups.job';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

// OmniaModulesModule loads it for the worker; OmniaCommandModule for the CLI and cron:register:all
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceEntity]),
    FieldMetadataModule,
    WorkspaceCacheModule,
  ],
  providers: [
    AgentRollupService,
    ComputeAgentRollupsJob,
    ComputeAgentRollupsCronJob,
    ComputeAgentRollupsCronCommand,
  ],
  exports: [AgentRollupService, ComputeAgentRollupsCronCommand],
})
export class AgentRollupModule {}
