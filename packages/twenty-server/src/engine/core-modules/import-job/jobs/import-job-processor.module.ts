import { Module } from '@nestjs/common';

import { ImportJobModule } from 'src/engine/core-modules/import-job/import-job.module';
import { ImportJobProcessor } from 'src/engine/core-modules/import-job/jobs/import-job.processor';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [ImportJobModule, WorkspaceCacheModule],
  providers: [ImportJobProcessor],
})
export class ImportJobProcessorModule {}
