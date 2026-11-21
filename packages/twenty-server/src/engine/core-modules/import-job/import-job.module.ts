import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ImportJobEntity } from 'src/engine/core-modules/import-job/entities/import-job.entity';
import { ImportJobResolver } from 'src/engine/core-modules/import-job/import-job.resolver';
import { ImportJobService } from 'src/engine/core-modules/import-job/import-job.service';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

@Module({
  imports: [TypeOrmModule.forFeature([ImportJobEntity])],
  providers: [
    provideWorkspaceScopedRepository(ImportJobEntity),
    ImportJobService,
    ImportJobResolver,
  ],
  exports: [ImportJobService],
})
export class ImportJobModule {}
