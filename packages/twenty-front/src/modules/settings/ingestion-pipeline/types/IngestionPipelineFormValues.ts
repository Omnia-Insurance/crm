export type IngestionPipelineFormValues = {
  name: string;
  description: string | null;
  mode: 'push' | 'pull';
  targetObjectNameSingular: string;
  sourceUrl: string | null;
  schedule: string | null;
  dedupFieldNames: string[] | null;
};
