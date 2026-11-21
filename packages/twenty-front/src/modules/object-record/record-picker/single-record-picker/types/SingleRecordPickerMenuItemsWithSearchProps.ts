import { type SingleRecordPickerMenuItemsProps } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPickerMenuItems';
import { type RecordPickerLayoutDirection } from '@/object-record/record-picker/types/RecordPickerLayoutDirection';
import { type RecordGqlOperationFilter } from 'twenty-shared/types';

export type SingleRecordPickerMenuItemsWithSearchProps = {
  excludedRecordIds?: string[];
  onCreate?: ((searchInput?: string) => void) | (() => void);
  objectNameSingulars: string[];
  recordPickerInstanceId?: string;
  layoutDirection?: RecordPickerLayoutDirection;
  focusId: string;
  // OMNIA-CUSTOM: narrows the selectable records (Carrier -> Product bridge)
  additionalFilter?: RecordGqlOperationFilter;
} & Pick<
  SingleRecordPickerMenuItemsProps,
  'EmptyIcon' | 'emptyLabel' | 'onCancel' | 'onMorphItemSelected'
>;
