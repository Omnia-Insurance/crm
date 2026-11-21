import { MultipleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/multiple-record-picker/states/contexts/MultipleRecordPickerComponentInstanceContext';
import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';
import { type RecordGqlOperationFilter } from 'twenty-shared/types';

export const multipleRecordPickerAdditionalFilterComponentState =
  createAtomComponentState<RecordGqlOperationFilter | undefined>({
    key: 'multipleRecordPickerAdditionalFilterComponentState',
    defaultValue: undefined,
    componentInstanceContext: MultipleRecordPickerComponentInstanceContext,
  });
