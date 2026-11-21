import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FormFieldInput } from '@/object-record/record-field/ui/components/FormFieldInput';
import { useJunctionBridgeFilterForRecord } from '@/object-record/record-field/ui/hooks/useJunctionBridgeFilter';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type JsonValue } from 'type-fest';

export type RecordFormJunctionBridgeFilterParams = {
  objectMetadataItem: EnrichedObjectMetadataItem;
  fieldMetadataItem: FieldMetadataItem;
  record: Partial<ObjectRecord>;
};

type RecordFormRelationToOneFieldInputProps = {
  field: Pick<FieldDefinition<FieldMetadata>, 'label' | 'metadata' | 'type'>;
  defaultValue: JsonValue;
  onChange: (value: JsonValue) => void;
  onClear?: () => void;
  junctionBridgeFilterParams: RecordFormJunctionBridgeFilterParams;
};

// The relation card's allowlist (a Policy's Product among its Carrier's
// products), read from the form draft because the record does not exist yet
export const RecordFormRelationToOneFieldInput = ({
  field,
  defaultValue,
  onChange,
  onClear,
  junctionBridgeFilterParams,
}: RecordFormRelationToOneFieldInputProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();

  const junctionBridgeFilter = useJunctionBridgeFilterForRecord({
    ...junctionBridgeFilterParams,
    objectMetadataItems,
  });

  return (
    <FormFieldInput
      field={field}
      defaultValue={defaultValue}
      onChange={onChange}
      onClear={onClear}
      additionalFilter={junctionBridgeFilter}
    />
  );
};
