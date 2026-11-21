import { type ImportJobDTO } from 'src/engine/core-modules/import-job/dtos/import-job.dto';
import { type ImportJobEntity } from 'src/engine/core-modules/import-job/entities/import-job.entity';

export const fromImportJobEntityToDto = (
  importJob: ImportJobEntity,
): ImportJobDTO => ({
  id: importJob.id,
  objectNameSingular: importJob.objectNameSingular,
  fileName: importJob.fileName,
  status: importJob.status,
  totalRecords: importJob.totalRecords,
  processedRecords: importJob.processedRecords,
  successCount: importJob.successCount,
  warningCount: importJob.warningCount,
  failureCount: importJob.failureCount,
  result: importJob.result,
  createdAt: importJob.createdAt,
});
