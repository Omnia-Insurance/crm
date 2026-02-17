export type IngestionPipeline = {
  id: string;
  name: string;
  description: string | null;
  mode: 'push' | 'pull';
  targetObjectNameSingular: string;
  webhookSecret: string | null;
  sourceUrl: string | null;
  sourceHttpMethod: string | null;
  sourceAuthConfig: Record<string, unknown> | null;
  sourceRequestConfig: Record<string, unknown> | null;
  responseRecordsPath: string | null;
  schedule: string | null;
  dedupFieldName: string | null;
  paginationConfig: Record<string, unknown> | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type IngestionFieldMapping = {
  id: string;
  pipelineId: string;
  sourceFieldPath: string;
  targetFieldName: string;
  targetCompositeSubField: string | null;
  transform: Record<string, unknown> | null;
  relationTargetObjectName: string | null;
  relationMatchFieldName: string | null;
  relationAutoCreate: boolean;
  position: number;
};

export type IngestionLog = {
  id: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  triggerType: 'push' | 'pull' | 'test';
  totalRecordsReceived: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: Record<string, unknown>[] | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
};
