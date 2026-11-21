import { type ImportJobSummary } from '@/spreadsheet-import/types/ImportJobSummary';
import { type BackgroundJobData } from '@/ui/feedback/background-job-indicator/states/backgroundJobState';

export const toBackgroundJobStatus = (
  importJobStatus: ImportJobSummary['status'],
): BackgroundJobData['status'] => {
  switch (importJobStatus) {
    case 'UPLOADING':
      return 'uploading';
    case 'PENDING':
      return 'pending';
    case 'PROCESSING':
      return 'processing';
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    // A status this client does not know yet keeps the job polled
    default:
      return 'pending';
  }
};
