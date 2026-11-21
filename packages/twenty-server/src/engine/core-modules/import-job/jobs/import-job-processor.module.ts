import { Module } from '@nestjs/common';

import { ActorModule } from 'src/engine/core-modules/actor/actor.module';
import { ImportJobModule } from 'src/engine/core-modules/import-job/import-job.module';
import { ImportJobProcessor } from 'src/engine/core-modules/import-job/jobs/import-job.processor';
import { UserWorkspaceModule } from 'src/engine/core-modules/user-workspace/user-workspace.module';
import { PermissionsModule } from 'src/engine/permissions/permissions.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [
    ImportJobModule,
    UserWorkspaceModule,
    ActorModule,
    PermissionsModule,
    WorkspaceCacheModule,
  ],
  providers: [ImportJobProcessor],
})
export class ImportJobProcessorModule {}
