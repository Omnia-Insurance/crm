import { useCommandMenu } from '@/command-menu/hooks/useCommandMenu';
import { REQUIRED_FIELDS_VALIDATION_MODAL_ID } from '@/command-menu/hooks/useCommandMenuCloseWithValidation';
import { useCommandMenuHistory } from '@/command-menu/hooks/useCommandMenuHistory';
import { requiredFieldsValidationState } from '@/command-menu/states/requiredFieldsValidationState';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import {
  newlyCreatedRecordIdsState,
  persistNewlyCreatedRecordIds,
} from '@/object-record/record-right-drawer/states/newlyCreatedRecordIdsState';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { useStore } from 'jotai';
import { useCallback } from 'react';

export const RequiredFieldsValidationModal = () => {
  const store = useStore();
  const validationData = useAtomStateValue(requiredFieldsValidationState);
  const { closeCommandMenu } = useCommandMenu();
  const { goBackFromCommandMenu } = useCommandMenuHistory();

  const objectNameSingular =
    validationData?.objectNameSingular || 'person';

  const { deleteOneRecord } = useDeleteOneRecord({
    objectNameSingular,
  });

  const subtitle = (() => {
    if (!validationData) return '';
    const fields = validationData.violations.map((v) => v.fieldLabel);
    return t`Please fill in: ${fields.join(', ')}`;
  })();

  const handleConfirmDelete = useCallback(async () => {
    if (!validationData) return;

    const { recordId, pendingAction } = validationData;

    const currentMap = store.get(newlyCreatedRecordIdsState.atom);
    const updatedMap = new Map(currentMap);
    updatedMap.delete(recordId);
    store.set(newlyCreatedRecordIdsState.atom, updatedMap);
    persistNewlyCreatedRecordIds(updatedMap);
    store.set(requiredFieldsValidationState.atom, null);

    await deleteOneRecord(recordId);

    if (pendingAction === 'close') {
      closeCommandMenu();
    } else {
      goBackFromCommandMenu();
    }
  }, [
    closeCommandMenu,
    deleteOneRecord,
    goBackFromCommandMenu,
    store,
    validationData,
  ]);

  const handleClose = useCallback(() => {
    store.set(requiredFieldsValidationState.atom, null);
  }, [store]);

  return (
    <ConfirmationModal
      modalInstanceId={REQUIRED_FIELDS_VALIDATION_MODAL_ID}
      title={t`Missing Required Fields`}
      subtitle={subtitle}
      onConfirmClick={handleConfirmDelete}
      onClose={handleClose}
      confirmButtonText={t`Delete Record`}
      confirmButtonAccent="danger"
    />
  );
};
