import { SIDE_PANEL_FOCUS_ID } from '@/side-panel/constants/SidePanelFocusId';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { draftRecordIdsState } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import {
  newlyCreatedRecordIdsState,
  persistNewlyCreatedRecordIds,
} from '@/object-record/record-side-panel/states/newlyCreatedRecordIdsState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import {
  useDraftCombinedViolations,
  clearDraftViolationsAtom,
} from '@/object-record/record-field/ui/hooks/useDraftCombinedViolations';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { useStore } from 'jotai';
import { useCallback, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { getOsControlSymbol } from 'twenty-ui/utilities';

type RecordShowSidePanelCreateRecordButtonProps = {
  objectNameSingular: string;
  recordId: string;
};

export const RecordShowSidePanelCreateRecordButton = ({
  objectNameSingular,
  recordId,
}: RecordShowSidePanelCreateRecordButtonProps) => {
  const store = useStore();
  const [isCreating, setIsCreating] = useState(false);

  const draftRecordIds = useAtomStateValue(draftRecordIdsState);
  const draftMeta = draftRecordIds.get(recordId);

  const combinedViolations = useDraftCombinedViolations(recordId, draftMeta);

  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular,
    shouldMatchRootQueryFilter: true,
  });

  const { upsertRecordsInStore } = useUpsertRecordsInStore();
  const { closeSidePanelMenu } = useSidePanelMenu();

  const isDisabled =
    (combinedViolations?.allViolationsCount ?? 0) > 0 || isCreating;

  const handleCreateRecord = useCallback(async () => {
    if (!draftMeta || isCreating) return;

    setIsCreating(true);

    try {
      const currentRecord = store.get(
        recordStoreFamilyState.atomFamily(recordId),
      );

      if (!isDefined(currentRecord)) return;

      // Strip system fields and relation objects that the server manages.
      // Only send scalar fields, FK IDs, and the record ID.
      const SYSTEM_FIELDS = new Set([
        '__typename',
        'createdAt',
        'updatedAt',
        'deletedAt',
        'createdBy',
        'updatedBy',
        'position',
      ]);

      const recordInput: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(currentRecord)) {
        if (SYSTEM_FIELDS.has(key)) continue;

        // Skip relation objects (non-null objects with an `id` property that
        // aren't composite field values like currency/address).
        // The FK field (e.g. carrierId) is already in the record separately.
        if (
          isDefined(value) &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          'id' in (value as Record<string, unknown>) &&
          '__typename' in (value as Record<string, unknown>)
        ) {
          continue;
        }

        recordInput[key] = value;
      }

      // Apply extra record input (e.g., position)
      Object.assign(recordInput, draftMeta.extraRecordInput ?? {});

      const createdRecord = await createOneRecord(recordInput);

      // Remove from draft tracking
      const updatedDraftMap = new Map(store.get(draftRecordIdsState.atom));
      updatedDraftMap.delete(recordId);
      store.set(draftRecordIdsState.atom, updatedDraftMap);

      // Clean up cached violations atom
      clearDraftViolationsAtom(recordId);

      // Add to newly created tracking (for navigate-away validation)
      const createdMap = new Map(store.get(newlyCreatedRecordIdsState.atom));
      createdMap.set(recordId, objectNameSingular);
      store.set(newlyCreatedRecordIdsState.atom, createdMap);
      persistNewlyCreatedRecordIds(createdMap);

      // Update store with server response
      upsertRecordsInStore({ partialRecords: [createdRecord] });

      // Run post-creation callback (relation linking, group tracking, etc.)
      await draftMeta.onRecordCreated?.(createdRecord);

      // Close side panel on success
      closeSidePanelMenu();
    } finally {
      setIsCreating(false);
    }
  }, [
    draftMeta,
    isCreating,
    store,
    recordId,
    createOneRecord,
    objectNameSingular,
    upsertRecordsInStore,
  ]);

  useHotkeysOnFocusedElement({
    keys: ['ctrl+Enter,meta+Enter'],
    callback: () => {
      if (!isDisabled) {
        handleCreateRecord();
      }
    },
    focusId: SIDE_PANEL_FOCUS_ID,
    dependencies: [handleCreateRecord, isDisabled],
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
      disabled={isDisabled}
    />
  );
};
