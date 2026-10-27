import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useDraftCombinedViolations } from '@/object-record/record-field/ui/hooks/useDraftCombinedViolations';
import { usePersistDraftRecord } from '@/object-record/record-side-panel/hooks/usePersistDraftRecord';
import { draftRecordIdsState } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import { buildMissingRequiredFields } from '@/object-record/record-side-panel/utils/buildMissingRequiredFields';
import {
  getMissingRequiredFieldsMessage,
  getReportedMissingField,
} from '@/object-record/record-side-panel/utils/getMissingRequiredFieldsMessage';
import { getRecordFieldInputInstanceId } from '@/object-record/utils/getRecordFieldInputId';
import { SIDE_PANEL_FOCUS_ID } from '@/side-panel/constants/SidePanelFocusId';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { useStore } from 'jotai';
import { useCallback, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { getOsControlSymbol } from 'twenty-ui/utilities';

type RecordShowSidePanelCreateRecordButtonProps = {
  objectNameSingular: string;
  recordId: string;
};

const MISSING_REQUIRED_FIELDS_SNACK_BAR_DEDUPE_KEY =
  'draft-missing-required-fields';

export const RecordShowSidePanelCreateRecordButton = ({
  objectNameSingular,
  recordId,
}: RecordShowSidePanelCreateRecordButtonProps) => {
  const store = useStore();
  const [isCreating, setIsCreating] = useState(false);

  const draftRecordIds = useAtomStateValue(draftRecordIdsState);
  const draftMeta = draftRecordIds.get(recordId);

  const combinedViolations = useDraftCombinedViolations(recordId, draftMeta);

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const { persistDraftRecord } = usePersistDraftRecord({ objectNameSingular });
  const { closeSidePanelMenu } = useSidePanelMenu();
  const { enqueueErrorSnackBar } = useSnackBar();

  const reportMissingRequiredFields = useCallback(() => {
    if (!isDefined(draftMeta) || !isDefined(combinedViolations)) return false;

    const missingFields = buildMissingRequiredFields({
      violations: combinedViolations,
      objectMetadataItem: draftMeta.objectMetadataItem,
      getObjectMetadataItem: (nameSingular) =>
        store.get(
          objectMetadataItemFamilySelector.selectorFamily({
            objectName: nameSingular,
            objectNameType: 'singular',
          }),
        ),
      getRestrictedFields: (objectMetadataId) =>
        getObjectPermissionsForObject(
          objectPermissionsByObjectMetadataId,
          objectMetadataId,
        ).restrictedFields,
    });

    const message = getMissingRequiredFieldsMessage(missingFields);

    if (!isDefined(message)) return false;

    enqueueErrorSnackBar({
      message,
      options: { dedupeKey: MISSING_REQUIRED_FIELDS_SNACK_BAR_DEDUPE_KEY },
    });

    const reportedField = getReportedMissingField(missingFields);

    if (isDefined(reportedField) && !reportedField.isReadOnly) {
      document
        .getElementById(
          `label-${getRecordFieldInputInstanceId({
            recordId,
            fieldName: reportedField.fieldName,
          })}`,
        )
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return true;
  }, [
    combinedViolations,
    draftMeta,
    enqueueErrorSnackBar,
    objectPermissionsByObjectMetadataId,
    recordId,
    store,
  ]);

  const handleCreateRecord = useCallback(async () => {
    if (!isDefined(draftMeta) || isCreating) return;

    if (reportMissingRequiredFields()) return;

    setIsCreating(true);

    try {
      const createdRecord = await persistDraftRecord(recordId, draftMeta);

      if (isDefined(createdRecord)) {
        closeSidePanelMenu();
      }
    } finally {
      setIsCreating(false);
    }
  }, [
    closeSidePanelMenu,
    draftMeta,
    isCreating,
    persistDraftRecord,
    recordId,
    reportMissingRequiredFields,
  ]);

  useHotkeysOnFocusedElement({
    keys: ['ctrl+Enter,meta+Enter'],
    callback: () => {
      handleCreateRecord();
    },
    focusId: SIDE_PANEL_FOCUS_ID,
    dependencies: [handleCreateRecord],
  });

  return (
    <Button
      title={t`Create`}
      variant="primary"
      accent="blue"
      size="small"
      Icon={IconPlus}
      hotkeys={[getOsControlSymbol(), '⏎']}
      onClick={handleCreateRecord}
      disabled={isCreating}
    />
  );
};
