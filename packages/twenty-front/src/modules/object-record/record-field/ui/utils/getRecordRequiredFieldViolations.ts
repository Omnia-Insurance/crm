import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isFieldValueEmpty } from '@/object-record/record-field/ui/utils/isFieldValueEmpty';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

export type FieldViolation = {
  fieldMetadataId: string;
  fieldLabel: string;
};

const isRecordFieldValueEmpty = (
  record: ObjectRecord,
  fieldMetadataItem: FieldMetadataItem,
) => {
  try {
    return isFieldValueEmpty({
      fieldDefinition: { type: fieldMetadataItem.type },
      fieldValue: record[fieldMetadataItem.name],
    });
  } catch {
    // isFieldValueEmpty throws on field types it does not support
    return true;
  }
};

const isRequiredConditionMet = ({
  record,
  requiredCondition,
  fieldMetadataItems,
}: {
  record: ObjectRecord;
  requiredCondition: RequiredCondition;
  fieldMetadataItems: FieldMetadataItem[];
}) => {
  if (requiredCondition.type === 'always') {
    return true;
  }

  const conditionFieldMetadataItem = fieldMetadataItems.find(
    (fieldMetadataItem) => fieldMetadataItem.id === requiredCondition.fieldId,
  );

  if (!isDefined(conditionFieldMetadataItem)) {
    return false;
  }

  const isConditionFieldEmpty = isRecordFieldValueEmpty(
    record,
    conditionFieldMetadataItem,
  );

  // Stored as JSON, so an unknown type must not fall through to required
  return (
    (requiredCondition.type === 'fieldEmpty' && isConditionFieldEmpty) ||
    (requiredCondition.type === 'fieldNotEmpty' && !isConditionFieldEmpty)
  );
};

export const getRecordRequiredFieldViolations = (
  record: ObjectRecord | null | undefined,
  objectMetadataItem: EnrichedObjectMetadataItem,
): FieldViolation[] => {
  if (!isDefined(record) || isDefined(record.deletedAt)) {
    return [];
  }

  return objectMetadataItem.fields.flatMap((fieldMetadataItem) => {
    const requiredCondition: RequiredCondition | null | undefined =
      fieldMetadataItem.requiredCondition;

    if (
      !isDefined(requiredCondition) ||
      !isRecordFieldValueEmpty(record, fieldMetadataItem) ||
      !isRequiredConditionMet({
        record,
        requiredCondition,
        fieldMetadataItems: objectMetadataItem.fields,
      })
    ) {
      return [];
    }

    return [
      {
        fieldMetadataId: fieldMetadataItem.id,
        fieldLabel: fieldMetadataItem.label,
      },
    ];
  });
};
