import { type RelationSubFieldMetadata } from '@/object-record/record-field/types/RelationSubFieldMetadata';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { isNonEmptyString } from '@sniptt/guards';

export const isRelationSubFieldDefinition = (
  fieldDefinition: FieldDefinition<FieldMetadata>,
): fieldDefinition is FieldDefinition<RelationSubFieldMetadata> =>
  'subFieldName' in fieldDefinition.metadata &&
  isNonEmptyString(fieldDefinition.metadata.subFieldName);
