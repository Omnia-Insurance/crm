import { type AggregateOperations } from '~/generated-metadata/graphql';

export type RecordField = {
  id: string;
  fieldMetadataItemId: string;
  position: number;
  isVisible: boolean;
  size: number;
  aggregateOperation?: AggregateOperations | null;
  // OMNIA-CUSTOM: set on relation sub-field columns such as "Lead / Date of Birth"
  subFieldName?: string | null;
};
