import { MultipleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/multiple-record-picker/states/contexts/MultipleRecordPickerComponentInstanceContext';
import { createComponentState } from '@/ui/utilities/state/component-state/utils/createComponentState';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

export const multipleRecordPickerAdditionalFilterComponentState =
  createComponentState<ObjectRecordFilterInput | undefined>({
    key: 'multipleRecordPickerAdditionalFilterComponentState',
    defaultValue: undefined,
    componentInstanceContext: MultipleRecordPickerComponentInstanceContext,
  });
