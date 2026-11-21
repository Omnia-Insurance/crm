import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type BackgroundJobStatus =
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BackgroundJobData = {
  id: string;
  label: string;
  status: BackgroundJobStatus;
  totalItems: number;
  processedItems: number;
  successCount: number;
  warningCount: number;
  failureCount: number;
  errorMessages?: string[];
  onCancel?: () => void;
};

export const backgroundJobsState = createAtomState<BackgroundJobData[]>({
  key: 'backgroundJobsState',
  defaultValue: [],
});
