import { useUpdateRecordField } from '@/object-record/record-field/hooks/useUpdateRecordField';
import { useUpsertRecordField } from '@/object-record/record-field/hooks/useUpsertRecordField';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSaveCurrentViewFields } from '@/views/hooks/useSaveCurrentViewFields';
import { mapRecordFieldToViewField } from '@/views/utils/mapRecordFieldToViewField';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { sortByProperty } from '~/utils/array/sortByProperty';

export const useChangeRecordFieldVisibility = (
  recordFieldComponentInstanceId?: string,
) => {
  const currentRecordFields = useAtomComponentStateValue(
    currentRecordFieldsComponentState,
    recordFieldComponentInstanceId,
  );

  const { updateRecordField } = useUpdateRecordField(
    recordFieldComponentInstanceId,
  );
  const { upsertRecordField } = useUpsertRecordField(
    recordFieldComponentInstanceId,
  );

  const { saveViewFields } = useSaveCurrentViewFields();

  // OMNIA-CUSTOM: subFieldName targets a relation sub-field column ("Lead / DOB"). It shares fieldMetadataId with
  // the relation column, so columns match on the pair and the local update goes by record field id
  const changeRecordFieldVisibility = async ({
    fieldMetadataId,
    isVisible,
    subFieldName,
  }: {
    fieldMetadataId: string;
    isVisible: boolean;
    subFieldName?: string;
  }) => {
    const lastPosition =
      currentRecordFields.toSorted(sortByProperty('position', 'desc'))?.[0]
        ?.position ?? 0;

    const shouldShowFieldMetadataItem = isVisible === true;
    const correspondingRecordField = currentRecordFields.find(
      (recordFieldToFind) =>
        recordFieldToFind.fieldMetadataItemId === fieldMetadataId &&
        (recordFieldToFind.subFieldName ?? undefined) === subFieldName,
    );

    const noExistingRecordField = !isDefined(correspondingRecordField);

    if (noExistingRecordField) {
      const recordFieldToUpsert: RecordField = {
        id: v4(),
        fieldMetadataItemId: fieldMetadataId,
        size: subFieldName ? 150 : 100,
        isVisible: shouldShowFieldMetadataItem,
        position: lastPosition + 1,
        subFieldName,
      };

      upsertRecordField(recordFieldToUpsert);

      await saveViewFields([mapRecordFieldToViewField(recordFieldToUpsert)]);
    } else {
      updateRecordField(correspondingRecordField.id, {
        isVisible: shouldShowFieldMetadataItem,
      });

      const updatedRecordField: RecordField = {
        ...correspondingRecordField,
        isVisible: shouldShowFieldMetadataItem,
      };

      saveViewFields([mapRecordFieldToViewField(updatedRecordField)]);
    }
  };

  return {
    changeRecordFieldVisibility,
  };
};
