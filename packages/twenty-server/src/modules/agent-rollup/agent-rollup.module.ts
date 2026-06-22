import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { AgentRollupService } from 'src/modules/agent-rollup/services/agent-rollup.service';

// OMNIA-CUSTOM: agent performance rollups — computes per-agent metrics
// (total policies, 6-month placement rate, billable + off-phone hours) onto
// agentProfile fields for a leaderboard dashboard.
@Module({
  imports: [
    TypeOrmModule.forFeature([ObjectMetadataEntity, FieldMetadataEntity]),
    FieldMetadataModule,
    GlobalWorkspaceDataSourceModule,
  ],
  providers: [AgentRollupService],
  exports: [AgentRollupService],
})
export class AgentRollupModule {}
