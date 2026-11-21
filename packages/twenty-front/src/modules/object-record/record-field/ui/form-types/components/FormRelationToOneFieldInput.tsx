import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { type VariablePickerComponent } from '@/ui/input/types/VariablePickerComponent';
import {
  type FieldRelationToOneValue,
  type FieldRelationValue,
} from '@/object-record/record-field/ui/types/FieldMetadata';
import { isObject } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
// OMNIA-CUSTOM: Carrier -> Product allowlist (U6)
import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import { type JsonValue } from 'type-fest';

export type FormRelationToOneFieldInputProps = {
  label?: string;
  objectNameSingular?: string;
  defaultValue?: FieldRelationValue<FieldRelationToOneValue> | string | null;
  onChange: (value: JsonValue) => void;
  onClear?: () => void;
  readonly?: boolean;
  VariablePicker?: VariablePickerComponent;
  // OMNIA-CUSTOM: Carrier -> Product allowlist (U6)
  additionalFilter?: RecordGqlOperationFilter;
};

const isFieldRelationToOneValue = (
  value: FormRelationToOneFieldInputProps['defaultValue'],
): value is FieldRelationValue<FieldRelationToOneValue> => {
  return isObject(value) && isDefined(value?.id);
};

export const FormRelationToOneFieldInput = ({
  label,
  objectNameSingular,
  onChange,
  onClear,
  defaultValue,
  readonly,
  VariablePicker,
  // OMNIA-CUSTOM: Carrier -> Product allowlist (U6)
  additionalFilter,
}: FormRelationToOneFieldInputProps) => {
  return (
    isDefined(objectNameSingular) && (
      <FormSingleRecordPicker
        label={label}
        defaultValue={
          isFieldRelationToOneValue(defaultValue)
            ? defaultValue?.id
            : defaultValue
        }
        onChange={onChange}
        onClear={onClear}
        objectNameSingulars={[objectNameSingular]}
        disabled={readonly}
        VariablePicker={VariablePicker}
        // OMNIA-CUSTOM: Carrier -> Product allowlist (U6)
        additionalFilter={additionalFilter}
      />
    )
  );
};
