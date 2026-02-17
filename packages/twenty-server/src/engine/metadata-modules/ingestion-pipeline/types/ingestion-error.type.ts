export type IngestionError = {
  recordIndex: number;
  sourceData?: Record<string, unknown>;
  fieldName?: string;
  message: string;
};
