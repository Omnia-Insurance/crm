import { useStore } from 'jotai';
import { useCallback } from 'react';

import { useRecordTableRowContextOrThrow } from '@/object-record/record-table/contexts/RecordTableRowContext';
import { recordTableRowIndexOfRecordComponentFamilySelector } from '@/object-record/record-table/states/selectors/recordTableRowIndexOfRecordComponentFamilySelector';
import { useAtomComponentFamilySelectorCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilySelectorCallbackState';

export const useGetRecordTableRowIndex = () => {
  const store = useStore();
  const { recordId } = useRecordTableRowContextOrThrow();

  const rowIndexOfRecordCallbackState =
    useAtomComponentFamilySelectorCallbackState(
      recordTableRowIndexOfRecordComponentFamilySelector,
    );

  // OMNIA-CUSTOM: stable, so the memoized label-identifier FieldContext keeps its identity across renders
  const getRecordTableRowIndex = useCallback(
    () => store.get(rowIndexOfRecordCallbackState(recordId)),
    [store, rowIndexOfRecordCallbackState, recordId],
  );

  return { getRecordTableRowIndex };
};
