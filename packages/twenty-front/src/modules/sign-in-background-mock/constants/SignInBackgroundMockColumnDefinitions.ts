import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { filterAvailableTableColumns } from '@/object-record/utils/filterAvailableTableColumns';
import { getSignInBackgroundMockObjectMetadataItem } from '@/sign-in-background-mock/utils/signInBackgroundMockMetadata';
import { isDefined } from 'twenty-shared/utils';

function throwFieldMetadataItemNotFound(fieldName: string): never {
  throw new Error(
    `Missing sign-in background mock field metadata for "${fieldName}"`,
  );
}

function getFieldMetadataItem(fieldName: string) {
  return (
    getSignInBackgroundMockObjectMetadataItem().fields.find(
      (field) => field.name === fieldName,
    ) ?? throwFieldMetadataItemNotFound(fieldName)
  );
}

function getColumnDefinitionFromFieldMetadataItem(
  fieldName: string,
  position: number,
  size: number,
) {
  return {
    ...formatFieldMetadataItemAsFieldDefinition({
      field: getFieldMetadataItem(fieldName),
      objectMetadataItem: getSignInBackgroundMockObjectMetadataItem(),
    }),
    position,
    size,
    isVisible: true,
  } satisfies ColumnDefinition<FieldMetadata>;
}

function getRecordFields(
  columnDefinitions: ColumnDefinition<FieldMetadata>[],
): RecordField[] {
  return columnDefinitions
    .filter((fieldDefinition) => fieldDefinition.fieldMetadataId !== '')
    .map((fieldDefinition) => ({
      fieldMetadataItemId: fieldDefinition.fieldMetadataId,
      id: fieldDefinition.fieldMetadataId,
      isVisible: fieldDefinition.isVisible ?? false,
      position: fieldDefinition.position,
      size: fieldDefinition.size,
    }));
}

function getSignInBackgroundMockColumnDefinitions() {
  return [
    getColumnDefinitionFromFieldMetadataItem('name', 0, 190),
    getColumnDefinitionFromFieldMetadataItem('status', 1, 120),
    getColumnDefinitionFromFieldMetadataItem('emails', 2, 190),
    getColumnDefinitionFromFieldMetadataItem('phones', 3, 155),
    getColumnDefinitionFromFieldMetadataItem('leadSource', 4, 150),
    getColumnDefinitionFromFieldMetadataItem('assignedAgent', 5, 170),
    getColumnDefinitionFromFieldMetadataItem('policies', 6, 320),
    getColumnDefinitionFromFieldMetadataItem('address', 7, 260),
  ]
    .filter(isDefined)
    .filter(filterAvailableTableColumns);
}

export const SIGN_IN_BACKGROUND_MOCK_TABLE = {
  columnDefinitions: getSignInBackgroundMockColumnDefinitions(),
  recordFields: getRecordFields(getSignInBackgroundMockColumnDefinitions()),
};
