// Mirrors the GET_IMPORT_JOB selection; the documents are outside codegen
export type ImportJobSummary = {
  id: string;
  objectNameSingular: string;
  fileName: string | null;
  status:
    | 'UPLOADING'
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED';
  totalRecords: number;
  processedRecords: number;
  successCount: number;
  warningCount: number;
  failureCount: number;
  result: {
    phase?: string;
    errors?: { message?: string; error?: string }[];
  } | null;
  createdAt: string;
};
