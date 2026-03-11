import {
  newlyCreatedRecordIdsState,
  persistNewlyCreatedRecordIds,
} from '@/object-record/record-side-panel/states/newlyCreatedRecordIdsState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useStore } from 'jotai';
import { useEffect } from 'react';

// Removes tracked record IDs that no longer exist in the record store.
// Runs once after records are loaded to prevent unbounded growth.
export const useCleanupNewlyCreatedRecordIds = () => {
  const store = useStore();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const currentMap = store.get(newlyCreatedRecordIdsState.atom);

      if (currentMap.size === 0) return;

      let changed = false;
      const cleanedMap = new Map(currentMap);

      for (const [recordId] of cleanedMap) {
        const record = store.get(recordStoreFamilyState.atomFamily(recordId));
        if (!record) {
          cleanedMap.delete(recordId);
          changed = true;
        }
      }

      if (changed) {
        store.set(newlyCreatedRecordIdsState.atom, cleanedMap);
        persistNewlyCreatedRecordIds(cleanedMap);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [store]);
};
