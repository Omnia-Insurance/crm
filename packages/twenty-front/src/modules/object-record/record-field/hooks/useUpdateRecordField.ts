import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';
import { useCallback } from 'react';
import { findById, isDefined } from 'twenty-shared/utils';
import { doNotTranslate } from 'twenty-shared/i18n';
import { useStore } from 'jotai';

export const useUpdateRecordField = (
  recordFieldComponentInstanceId?: string,
) => {
  const store = useStore();
  const currentRecordFields = useAtomComponentStateCallbackState(
    currentRecordFieldsComponentState,
    recordFieldComponentInstanceId,
  );

  // OMNIA-CUSTOM: sub-field columns share fieldMetadataItemId with their relation, so match the record field id
  // first. Callers still passing a field id (board options, record-table widget settings) mean the plain column
  const updateRecordField = useCallback(
    (
      recordFieldIdOrFieldMetadataItemId: string,
      partialRecordField: Partial<
        Pick<RecordField, 'isVisible' | 'size' | 'position'>
      >,
    ) => {
      const existingRecordFields = store.get(currentRecordFields);

      const foundRecordFieldInCurrentRecordFields =
        existingRecordFields.find(
          findById(recordFieldIdOrFieldMetadataItemId),
        ) ??
        existingRecordFields.find(
          (existingRecordField) =>
            existingRecordField.fieldMetadataItemId ===
              recordFieldIdOrFieldMetadataItemId &&
            !isDefined(existingRecordField.subFieldName),
        );

      if (!isDefined(foundRecordFieldInCurrentRecordFields)) {
        throw new Error(
          doNotTranslate(
            `Cannot find record field to update with record field id or field metadata item id : ${recordFieldIdOrFieldMetadataItemId}`,
          ),
        );
      }

      store.set(currentRecordFields, (previousRecordFields) => {
        const newCurrentRecordFields = [...previousRecordFields];

        const indexOfRecordFieldToUpdate = newCurrentRecordFields.findIndex(
          findById(foundRecordFieldInCurrentRecordFields.id),
        );

        newCurrentRecordFields[indexOfRecordFieldToUpdate] = {
          ...newCurrentRecordFields[indexOfRecordFieldToUpdate],
          ...partialRecordField,
        };

        return newCurrentRecordFields;
      });

      return {
        ...foundRecordFieldInCurrentRecordFields,
        ...partialRecordField,
      } satisfies RecordField as RecordField;
    },
    [currentRecordFields, store],
  );

  return {
    updateRecordField,
  };
};
