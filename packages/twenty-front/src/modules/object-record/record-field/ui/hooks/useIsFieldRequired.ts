import { useContext } from 'react';

import { useFieldMetadataItemById } from '@/object-metadata/hooks/useFieldMetadataItemById';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { isFieldValueEmpty } from '@/object-record/record-field/ui/utils/isFieldValueEmpty';
import { useRecordFieldValue } from '@/object-record/record-store/hooks/useRecordFieldValue';

export const useIsFieldRequired = (): boolean => {
  const { recordId, fieldDefinition } = useContext(FieldContext);
  const requiredCondition = fieldDefinition?.requiredCondition;

  const conditionFieldId = requiredCondition?.fieldId ?? '';

  const { fieldMetadataItem: conditionField, objectMetadataItem } =
    useFieldMetadataItemById(conditionFieldId);

  const conditionFieldDefinition =
    conditionField && objectMetadataItem
      ? formatFieldMetadataItemAsFieldDefinition({
          field: conditionField,
          objectMetadataItem,
        })
      : null;

  const conditionFieldValue = useRecordFieldValue(
    recordId,
    conditionField?.name ?? '',
    conditionFieldDefinition ?? {
      type: conditionField?.type as any,
      metadata: { fieldName: conditionField?.name ?? '' } as any,
    },
  );

  // Check if this field itself already has a value
  const thisFieldValue = useRecordFieldValue(
    recordId,
    fieldDefinition?.metadata?.fieldName ?? '',
    fieldDefinition,
  );

  let thisFieldEmpty: boolean;
  try {
    thisFieldEmpty = isFieldValueEmpty({
      fieldDefinition,
      fieldValue: thisFieldValue,
    });
  } catch {
    thisFieldEmpty = true;
  }

  // If the field already has a value, no need to show the indicator
  if (!thisFieldEmpty) {
    return false;
  }

  if (!requiredCondition) {
    return false;
  }

  if (requiredCondition.type === 'always') {
    return true;
  }

  if (!conditionField || !conditionFieldDefinition) {
    return false;
  }

  const conditionEmpty = isFieldValueEmpty({
    fieldDefinition: conditionFieldDefinition,
    fieldValue: conditionFieldValue,
  });

  if (requiredCondition.type === 'fieldEmpty') {
    return conditionEmpty;
  }

  if (requiredCondition.type === 'fieldNotEmpty') {
    return !conditionEmpty;
  }

  return false;
};
