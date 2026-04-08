import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { isFieldValueEmpty } from '@/object-record/record-field/ui/utils/isFieldValueEmpty';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

export type FieldViolation = {
  fieldMetadataId: string;
  fieldLabel: string;
};

export const getRecordRequiredFieldViolations = (
  record: ObjectRecord | null | undefined,
  objectMetadataItem: EnrichedObjectMetadataItem,
): FieldViolation[] => {
  if (!record || record.deletedAt) return [];

  const violations: FieldViolation[] = [];

  for (const field of objectMetadataItem.fields) {
    const requiredCondition = field.requiredCondition as
      | { type: string; fieldId?: string }
      | null
      | undefined;

    if (!requiredCondition) continue;

    const fieldDefinition = formatFieldMetadataItemAsFieldDefinition({
      field,
      objectMetadataItem,
    });

    const fieldValue = record[field.name];

    let fieldEmpty: boolean;
    try {
      fieldEmpty = isFieldValueEmpty({ fieldDefinition, fieldValue });
    } catch {
      fieldEmpty = true;
    }

    if (!fieldEmpty) continue;

    if (requiredCondition.type === 'always') {
      violations.push({ fieldMetadataId: field.id, fieldLabel: field.label });
      continue;
    }

    if (requiredCondition.fieldId) {
      const conditionField = objectMetadataItem.fields.find(
        (f) => f.id === requiredCondition.fieldId,
      );
      if (!conditionField) continue;

      const conditionFieldDefinition = formatFieldMetadataItemAsFieldDefinition({
        field: conditionField,
        objectMetadataItem,
      });

      const conditionValue = record[conditionField.name];
      let conditionEmpty: boolean;
      try {
        conditionEmpty = isFieldValueEmpty({
          fieldDefinition: conditionFieldDefinition,
          fieldValue: conditionValue,
        });
      } catch {
        conditionEmpty = true;
      }

      const isRequired =
        (requiredCondition.type === 'fieldEmpty' && conditionEmpty) ||
        (requiredCondition.type === 'fieldNotEmpty' && !conditionEmpty);

      if (isRequired) {
        violations.push({ fieldMetadataId: field.id, fieldLabel: field.label });
      }
    }
  }

  return violations;
};
