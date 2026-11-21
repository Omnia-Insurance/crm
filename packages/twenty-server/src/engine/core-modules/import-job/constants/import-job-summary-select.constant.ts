import { type FindOptionsSelect } from 'typeorm';

import { type ImportJobEntity } from 'src/engine/core-modules/import-job/entities/import-job.entity';

// The columns the API returns; validatedRows holds PHI and only the worker reads it
export const IMPORT_JOB_SUMMARY_SELECT: FindOptionsSelect<ImportJobEntity> = {
  id: true,
  objectNameSingular: true,
  fileName: true,
  status: true,
  totalRecords: true,
  processedRecords: true,
  successCount: true,
  warningCount: true,
  failureCount: true,
  result: true,
  createdAt: true,
};
