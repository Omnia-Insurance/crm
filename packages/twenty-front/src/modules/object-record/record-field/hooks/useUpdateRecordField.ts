import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { useStore } from 'jotai';

export const useUpdateRecordField = (
  recordFieldComponentInstanceId?: string,
) => {
  const store = useStore();
  const currentRecordFields = useAtomComponentStateCallbackState(
    currentRecordFieldsComponentState,
    recordFieldComponentInstanceId,
  );

  const updateRecordField = useCallback(
    (
      fieldMetadataItemIdOrRecordFieldId: string,
      partialRecordField: Partial<
        Pick<RecordField, 'isVisible' | 'size' | 'position'>
      >,
    ) => {
      const existingRecordFields = store.get(currentRecordFields);

      // OMNIA-CUSTOM: Match by record field id first (unique per column),
      // then fall back to fieldMetadataItemId for backwards compatibility.
      const foundRecordFieldInCurrentRecordFields =
        existingRecordFields.find(
          (rf) => rf.id === fieldMetadataItemIdOrRecordFieldId,
        ) ??
        existingRecordFields.find(
          (rf) =>
            rf.fieldMetadataItemId === fieldMetadataItemIdOrRecordFieldId,
        );

      if (!isDefined(foundRecordFieldInCurrentRecordFields)) {
        throw new Error(
          `Cannot find record field to update with id : ${fieldMetadataItemIdOrRecordFieldId}`,
        );
      }

      const matchId = foundRecordFieldInCurrentRecordFields.id;

      store.set(currentRecordFields, (previousRecordFields) => {
        const newCurrentRecordFields = [...previousRecordFields];

        const indexOfRecordFieldToUpdate = newCurrentRecordFields.findIndex(
          (rf) => rf.id === matchId,
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
