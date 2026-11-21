import { useSingleRecordPickerPerformSearch } from '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch';
import { singleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSearchFilterComponentState';
import { singleRecordPickerSelectedIdComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSelectedIdComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { type RecordGqlOperationFilter } from 'twenty-shared/types';

export const useSingleRecordPickerRecords = ({
  objectNameSingulars,
  excludedRecordIds = [],
  additionalFilter,
}: {
  objectNameSingulars: string[];
  excludedRecordIds?: string[];
  // OMNIA-CUSTOM: narrows the selectable records (Carrier -> Product bridge)
  additionalFilter?: RecordGqlOperationFilter;
}) => {
  const singleRecordPickerSearchFilter = useAtomComponentStateValue(
    singleRecordPickerSearchFilterComponentState,
  );

  const singleRecordPickerSelectedId = useAtomComponentStateValue(
    singleRecordPickerSelectedIdComponentState,
  );
  return useSingleRecordPickerPerformSearch({
    searchFilter: singleRecordPickerSearchFilter,
    selectedIds: singleRecordPickerSelectedId
      ? [singleRecordPickerSelectedId]
      : [],
    excludedRecordIds: excludedRecordIds,
    objectNameSingulars,
    additionalFilter,
  });
};
