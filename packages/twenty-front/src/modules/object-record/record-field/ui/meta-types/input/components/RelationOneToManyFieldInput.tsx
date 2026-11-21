import { useCallback, useContext, useEffect } from 'react';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getFieldMetadataItemById } from '@/object-metadata/utils/getFieldMetadataItemById';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { FieldInputEventContext } from '@/object-record/record-field/ui/contexts/FieldInputEventContext';
import { useCreateJunctionRecordWithNestedTarget } from '@/object-record/record-field/ui/hooks/useCreateJunctionRecordWithNestedTarget';
import { useUpdateJunctionRelationFromCell } from '@/object-record/record-field/ui/hooks/useUpdateJunctionRelationFromCell';
import { useAddNewRecordAndOpenSidePanel } from '@/object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenSidePanel';
import { FieldInputDropdown } from '@/object-record/record-field/ui/meta-types/input/components/FieldInputDropdown';
import { useUpdateRelationOneToManyFieldInput } from '@/object-record/record-field/ui/meta-types/input/hooks/useUpdateRelationOneToManyFieldInput';
import { RecordFieldComponentInstanceContext } from '@/object-record/record-field/ui/states/contexts/RecordFieldComponentInstanceContext';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
// OMNIA-CUSTOM: Lead -> Policies allowlist
import { useLeadPolicyRecordPickerAdditionalFilter } from '@/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter';
import { MultipleRecordPicker } from '@/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker';
import { useMultipleRecordPickerPerformSearch } from '@/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { CustomError, isDefined } from 'twenty-shared/utils';
import { doNotTranslate } from 'twenty-shared/i18n';

export const RelationOneToManyFieldInput = () => {
  const { fieldDefinition, recordId } = useContext(FieldContext);
  const instanceId = useAvailableComponentInstanceIdOrThrow(
    RecordFieldComponentInstanceContext,
  );

  const { onSubmit } = useContext(FieldInputEventContext);

  const { updateRelation } = useUpdateRelationOneToManyFieldInput();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { fieldMetadataItem, objectMetadataItem } = getFieldMetadataItemById({
    fieldMetadataId: fieldDefinition.fieldMetadataId,
    objectMetadataItems,
  });
  if (!isDefined(fieldMetadataItem) || !isDefined(objectMetadataItem)) {
    throw new CustomError(
      doNotTranslate('Field metadata item or object metadata item not found'),
      'FIELD_METADATA_ITEM_OR_OBJECT_METADATA_ITEM_NOT_FOUND',
    );
  }
  const handleSubmit = () => {
    onSubmit?.({ skipPersist: true });
  };

  const relationFieldDefinition =
    fieldDefinition as FieldDefinition<FieldRelationMetadata>;

  const { updateJunctionRelationFromCell, junctionConfig } =
    useUpdateJunctionRelationFromCell({
      fieldMetadataItem,
      fieldDefinition: relationFieldDefinition,
      recordId,
    });

  const isJunctionRelation = junctionConfig?.isValid === true;
  const isInvalidJunctionRelation = junctionConfig?.isValid === false;

  const { objectMetadataItem: relationObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular:
        relationFieldDefinition.metadata.relationObjectMetadataNameSingular,
    });

  const relationFieldMetadataItem = relationObjectMetadataItem.fields.find(
    ({ id }) => id === relationFieldDefinition.metadata.relationFieldMetadataId,
  );
  if (!relationFieldMetadataItem) {
    throw new CustomError(
      doNotTranslate('Relation field metadata item not found'),
      'RELATION_FIELD_METADATA_ITEM_NOT_FOUND',
    );
  }

  // OMNIA-CUSTOM: Lead -> Policies offers only policies with no lead or this lead
  const {
    additionalFilter: leadPolicyRecordPickerAdditionalFilter,
    isLeadPolicyRelation,
    loading: isLeadPolicyRecordPickerAdditionalFilterLoading,
  } = useLeadPolicyRecordPickerAdditionalFilter({
    recordId,
    inverseFieldName: relationFieldMetadataItem.name,
    relationObjectMetadataNameSingular:
      relationFieldDefinition.metadata.relationObjectMetadataNameSingular,
  });

  const { performSearch: multipleRecordPickerPerformSearch } =
    useMultipleRecordPickerPerformSearch();

  // OMNIA-CUSTOM: the initial search lives here, not in the open hook, so
  // Lead -> Policies waits for its allowlist; junction openers search themselves
  const shouldPerformInitialSearch =
    !isJunctionRelation &&
    !isInvalidJunctionRelation &&
    !(isLeadPolicyRelation && isLeadPolicyRecordPickerAdditionalFilterLoading);

  useEffect(() => {
    if (!shouldPerformInitialSearch) {
      return;
    }

    multipleRecordPickerPerformSearch({
      multipleRecordPickerInstanceId: instanceId,
      forceAdditionalFilter: leadPolicyRecordPickerAdditionalFilter,
    });
    // performSearch changes identity every render; search once the picker is ready
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, shouldPerformInitialSearch]);

  const { createNewRecordAndOpenSidePanel } = useAddNewRecordAndOpenSidePanel({
    fieldMetadataItem,
    objectMetadataItem,
    relationObjectMetadataNameSingular:
      relationFieldDefinition.metadata.relationObjectMetadataNameSingular,
    relationObjectMetadataItem,
    relationFieldMetadataItem,
    recordId,
  });

  const {
    createJunctionRecordWithNestedTarget,
    isCreatePending: isCreatingJunctionRecord,
  } = useCreateJunctionRecordWithNestedTarget({
    sourceRecordId: recordId,
    sourceFieldName: relationFieldDefinition.metadata.fieldName,
    sourceObjectMetadataItem: objectMetadataItem,
    junctionConfig: isJunctionRelation ? junctionConfig : undefined,
  });

  const handleCreateNew = useCallback(
    async ({
      searchInput,
      objectMetadataItemId,
    }: {
      searchInput?: string;
      objectMetadataItemId: string;
    }) => {
      if (isJunctionRelation) {
        return createJunctionRecordWithNestedTarget({
          searchInput,
          targetObjectMetadataItemId: objectMetadataItemId,
        });
      }

      const newRecordId = await createNewRecordAndOpenSidePanel?.(searchInput);

      if (isDefined(newRecordId)) {
        return {
          recordId: newRecordId,
          objectMetadataId: objectMetadataItemId,
          isSelected: true,
          isMatchingSearchFilter: true,
        };
      }

      return undefined;
    },
    [
      createNewRecordAndOpenSidePanel,
      createJunctionRecordWithNestedTarget,
      isJunctionRelation,
    ],
  );

  if (isInvalidJunctionRelation) {
    return null;
  }

  return (
    <FieldInputDropdown
      onDismiss={handleSubmit}
      multiple
      shouldSkipPersist
      shouldDismissOnOutsideInput
    >
      <MultipleRecordPicker
        componentInstanceId={instanceId}
        onChange={(morphItem) => {
          if (isJunctionRelation) {
            updateJunctionRelationFromCell({ morphItem });
            return;
          }

          updateRelation(morphItem);
        }}
        onCreate={
          isJunctionRelation || isDefined(createNewRecordAndOpenSidePanel)
            ? handleCreateNew
            : undefined
        }
        isCreatePending={isCreatingJunctionRecord}
        // OMNIA-CUSTOM: Lead -> Policies allowlist
        additionalFilter={leadPolicyRecordPickerAdditionalFilter}
      />
    </FieldInputDropdown>
  );
};
