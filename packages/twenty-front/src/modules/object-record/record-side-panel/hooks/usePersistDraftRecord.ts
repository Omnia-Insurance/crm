import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { clearDraftViolationsAtom } from '@/object-record/record-field/ui/hooks/useDraftCombinedViolations';
import {
  draftRecordIdsState,
  type DraftRecordMeta,
} from '@/object-record/record-side-panel/states/draftRecordIdsState';
import {
  newlyCreatedRecordIdsState,
  persistNewlyCreatedRecordIds,
} from '@/object-record/record-side-panel/states/newlyCreatedRecordIdsState';
import { buildDraftRecordInput } from '@/object-record/record-side-panel/utils/buildDraftRecordInput';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

export const usePersistDraftRecord = ({
  objectNameSingular,
}: {
  objectNameSingular: string;
}) => {
  const store = useStore();

  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular,
    shouldMatchRootQueryFilter: true,
  });

  const { upsertRecordsInStore } = useUpsertRecordsInStore();

  const persistDraftRecord = useCallback(
    async (
      recordId: string,
      draftMeta: DraftRecordMeta,
    ): Promise<ObjectRecord | undefined> => {
      if (!isDefined(store.get(recordStoreFamilyState.atomFamily(recordId)))) {
        return undefined;
      }

      await draftMeta.persistDependencies?.();

      const currentRecord = store.get(
        recordStoreFamilyState.atomFamily(recordId),
      );

      if (!isDefined(currentRecord)) return undefined;

      const createdRecord = await createOneRecord(
        buildDraftRecordInput(currentRecord, draftMeta.extraRecordInput),
      );

      const updatedDraftMap = new Map(store.get(draftRecordIdsState.atom));
      updatedDraftMap.delete(recordId);
      store.set(draftRecordIdsState.atom, updatedDraftMap);

      clearDraftViolationsAtom(recordId);

      const createdMap = new Map(store.get(newlyCreatedRecordIdsState.atom));
      createdMap.set(recordId, draftMeta.objectNameSingular);
      store.set(newlyCreatedRecordIdsState.atom, createdMap);
      persistNewlyCreatedRecordIds(createdMap);

      upsertRecordsInStore({ partialRecords: [createdRecord] });

      await draftMeta.onRecordCreated?.(createdRecord);

      return createdRecord;
    },
    [store, createOneRecord, upsertRecordsInStore],
  );

  return { persistDraftRecord };
};
