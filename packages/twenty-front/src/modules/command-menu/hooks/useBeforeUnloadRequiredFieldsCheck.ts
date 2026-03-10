import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { isFieldValueEmpty } from '@/object-record/record-field/ui/utils/isFieldValueEmpty';
import { newlyCreatedRecordIdsState } from '@/object-record/record-side-panel/states/newlyCreatedRecordIdsState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useStore } from 'jotai';
import { useEffect } from 'react';

export const useBeforeUnloadRequiredFieldsCheck = () => {
  const store = useStore();

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const newlyCreatedMap = store.get(newlyCreatedRecordIdsState.atom);

      if (newlyCreatedMap.size === 0) return;

      for (const [recordId, objectNameSingular] of newlyCreatedMap) {
        const objectMetadataItem = store.get(
          objectMetadataItemFamilySelector.selectorFamily({
            objectName: objectNameSingular,
            objectNameType: 'singular',
          }),
        );

        if (!objectMetadataItem) continue;

        const record = store.get(recordStoreFamilyState.atomFamily(recordId));
        if (!record) continue;

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
            fieldEmpty = isFieldValueEmpty({
              fieldDefinition,
              fieldValue,
            });
          } catch {
            fieldEmpty = true;
          }

          if (!fieldEmpty) continue;

          if (requiredCondition.type === 'always') {
            event.preventDefault();
            return;
          }

          if (requiredCondition.fieldId !== undefined) {
            const conditionField = objectMetadataItem.fields.find(
              (f) => f.id === requiredCondition.fieldId,
            );

            if (!conditionField) continue;

            const conditionFieldDefinition =
              formatFieldMetadataItemAsFieldDefinition({
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
              event.preventDefault();
              return;
            }
          }
        }
      }
    };

    window.addEventListener('beforeunload', handler);

    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [store]);
};
