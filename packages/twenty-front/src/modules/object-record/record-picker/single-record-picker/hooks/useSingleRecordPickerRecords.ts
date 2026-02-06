import { useSingleRecordPickerPerformSearch } from '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch';
import { singleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSearchFilterComponentState';
import { singleRecordPickerSelectedIdComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSelectedIdComponentState';
import { useRecoilComponentValue } from '@/ui/utilities/state/component-state/hooks/useRecoilComponentValue';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

export const useSingleRecordPickerRecords = ({
  objectNameSingulars,
  excludedRecordIds = [],
  additionalFilter,
}: {
  objectNameSingulars: string[];
  excludedRecordIds?: string[];
  additionalFilter?: ObjectRecordFilterInput;
}) => {
  const recordPickerSearchFilter = useRecoilComponentValue(
    singleRecordPickerSearchFilterComponentState,
  );

  const selectedRecordId = useRecoilComponentValue(
    singleRecordPickerSelectedIdComponentState,
  );
  const { pickableMorphItems, loading } = useSingleRecordPickerPerformSearch({
    searchFilter: recordPickerSearchFilter,
    selectedIds: selectedRecordId ? [selectedRecordId] : [],
    excludedRecordIds: excludedRecordIds,
    objectNameSingulars,
    additionalFilter,
  });

  return { pickableMorphItems, loading };
};
