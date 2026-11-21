import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type RecordGqlFields } from 'twenty-shared/types';

export type RelatedRecordRequiredConditionCheck = {
  relationFieldMetadataItem: FieldMetadataItem;
  relatedObjectMetadataItem: EnrichedObjectMetadataItem;
  relatedRecordId: string;
  evaluatedFieldMetadataItems: FieldMetadataItem[];
  recordGqlFields: RecordGqlFields;
};
