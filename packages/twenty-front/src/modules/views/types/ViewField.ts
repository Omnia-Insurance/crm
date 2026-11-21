import { type RecordBoardFieldDefinition } from '@/object-record/record-board/types/RecordBoardFieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type AggregateOperations } from '@/object-record/record-table/constants/AggregateOperations';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';

export type ViewField = {
  id: string;
  viewId?: string;
  fieldMetadataId: string;
  position: number;
  isActive: boolean;
  isVisible: boolean;
  size: number;
  aggregateOperation?: AggregateOperations | null;
  viewFieldGroupId?: string | null;
  // OMNIA-CUSTOM: target field name of a relation sub-field column (C6)
  subFieldName?: string | null;
  definition?:
    | ColumnDefinition<FieldMetadata>
    | RecordBoardFieldDefinition<FieldMetadata>;
};
