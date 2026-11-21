import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';

export type RelationSubFieldMetadata = FieldRelationMetadata & {
  subFieldName: string;
};
