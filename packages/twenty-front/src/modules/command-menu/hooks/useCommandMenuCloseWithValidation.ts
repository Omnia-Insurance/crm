import { useCommandMenu } from '@/command-menu/hooks/useCommandMenu';
import { useCommandMenuHistory } from '@/command-menu/hooks/useCommandMenuHistory';
import { viewableRecordIdComponentState } from '@/command-menu/pages/record-page/states/viewableRecordIdComponentState';
import { viewableRecordNameSingularComponentState } from '@/command-menu/pages/record-page/states/viewableRecordNameSingularComponentState';
import { commandMenuNavigationStackState } from '@/command-menu/states/commandMenuNavigationStackState';
import { commandMenuPageState } from '@/command-menu/states/commandMenuPageState';
import { requiredFieldsValidationState } from '@/command-menu/states/requiredFieldsValidationState';
import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { type FieldViolation } from '@/object-record/record-field/ui/hooks/useRecordRequiredFieldViolations';
import { isFieldValueEmpty } from '@/object-record/record-field/ui/utils/isFieldValueEmpty';
import { newlyCreatedRecordIdsState } from '@/object-record/record-right-drawer/states/newlyCreatedRecordIdsState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { CommandMenuPages } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

export const REQUIRED_FIELDS_VALIDATION_MODAL_ID =
  'required-fields-validation-modal';

export const useCommandMenuCloseWithValidation = () => {
  const store = useStore();
  const { closeCommandMenu } = useCommandMenu();
  const { goBackFromCommandMenu } = useCommandMenuHistory();
  const { openModal } = useModal();

  const getCurrentRecordInfo = useCallback(() => {
    const navigationStack = store.get(commandMenuNavigationStackState.atom);
    const currentItem = navigationStack.at(-1);

    if (!isDefined(currentItem)) return null;

    const commandMenuPage = store.get(commandMenuPageState.atom);
    if (commandMenuPage !== CommandMenuPages.ViewRecord) return null;

    const recordId = store.get(
      viewableRecordIdComponentState.atomFamily({
        instanceId: currentItem.pageId,
      }),
    );

    const objectNameSingular = store.get(
      viewableRecordNameSingularComponentState.atomFamily({
        instanceId: currentItem.pageId,
      }),
    );

    if (!recordId || !objectNameSingular) return null;

    return { recordId, objectNameSingular };
  }, [store]);

  const getViolationsForRecord = useCallback(
    (recordId: string, objectNameSingular: string): FieldViolation[] => {
      const objectMetadataItem = store.get(
        objectMetadataItemFamilySelector.selectorFamily({
          objectName: objectNameSingular,
          objectNameType: 'singular',
        }),
      );

      if (!objectMetadataItem) return [];

      const record = store.get(recordStoreFamilyState.atomFamily(recordId));
      if (!record) return [];

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
          fieldEmpty = isFieldValueEmpty({
            fieldDefinition,
            fieldValue,
          });
        } catch {
          fieldEmpty = true;
        }

        if (!fieldEmpty) continue;

        if (requiredCondition.type === 'always') {
          violations.push({
            fieldMetadataId: field.id,
            fieldLabel: field.label,
          });
          continue;
        }

        if (requiredCondition.fieldId) {
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
            violations.push({
              fieldMetadataId: field.id,
              fieldLabel: field.label,
            });
          }
        }
      }

      return violations;
    },
    [store],
  );

  const closeWithValidation = useCallback(() => {
    const recordInfo = getCurrentRecordInfo();

    if (!recordInfo) {
      closeCommandMenu();
      return;
    }

    const { recordId, objectNameSingular } = recordInfo;
    const newlyCreatedMap = store.get(newlyCreatedRecordIdsState.atom);

    if (!newlyCreatedMap.has(recordId)) {
      closeCommandMenu();
      return;
    }

    const violations = getViolationsForRecord(recordId, objectNameSingular);

    if (violations.length === 0) {
      closeCommandMenu();
      return;
    }

    store.set(requiredFieldsValidationState.atom, {
      pendingAction: 'close',
      violations,
      recordId,
      objectNameSingular,
    });
    openModal(REQUIRED_FIELDS_VALIDATION_MODAL_ID);
  }, [
    closeCommandMenu,
    getCurrentRecordInfo,
    getViolationsForRecord,
    openModal,
    store,
  ]);

  const goBackWithValidation = useCallback(() => {
    const recordInfo = getCurrentRecordInfo();

    if (!recordInfo) {
      goBackFromCommandMenu();
      return;
    }

    const { recordId, objectNameSingular } = recordInfo;
    const newlyCreatedMap = store.get(newlyCreatedRecordIdsState.atom);

    if (!newlyCreatedMap.has(recordId)) {
      goBackFromCommandMenu();
      return;
    }

    const violations = getViolationsForRecord(recordId, objectNameSingular);

    if (violations.length === 0) {
      goBackFromCommandMenu();
      return;
    }

    store.set(requiredFieldsValidationState.atom, {
      pendingAction: 'back',
      violations,
      recordId,
      objectNameSingular,
    });
    openModal(REQUIRED_FIELDS_VALIDATION_MODAL_ID);
  }, [
    goBackFromCommandMenu,
    getCurrentRecordInfo,
    getViolationsForRecord,
    openModal,
    store,
  ]);

  return {
    closeWithValidation,
    goBackWithValidation,
  };
};
