import { Module } from '@nestjs/common';

import { ImportJobValidatedRowsRetentionCronCommand } from 'src/engine/core-modules/import-job/crons/commands/import-job-validated-rows-retention.cron.command';
import { ImportJobValidatedRowsRetentionCronJob } from 'src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job';

@Module({
  providers: [
    ImportJobValidatedRowsRetentionCronJob,
    ImportJobValidatedRowsRetentionCronCommand,
  ],
  exports: [ImportJobValidatedRowsRetentionCronCommand],
})
export class ImportJobValidatedRowsRetentionModule {}
