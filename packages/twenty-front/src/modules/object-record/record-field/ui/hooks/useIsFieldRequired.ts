import { useContext } from 'react';

import { useFieldMetadataItemById } from '@/object-metadata/hooks/useFieldMetadataItemById';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useIsFieldEmpty } from '@/object-record/record-field/ui/hooks/useIsFieldEmpty';
import { getRecordRequiredFieldViolations } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { isDefined } from 'twenty-shared/utils';

export const useIsFieldRequired = (): boolean => {
  const { recordId, fieldDefinition } = useContext(FieldContext);

  const isFieldEmpty = useIsFieldEmpty();

  const { fieldMetadataItem, objectMetadataItem } = useFieldMetadataItemById(
    fieldDefinition.fieldMetadataId,
  );

  const recordStore = useAtomFamilyStateValue(recordStoreFamilyState, recordId);

  if (
    !isFieldEmpty ||
    !isDefined(fieldDefinition.requiredCondition) ||
    !isDefined(recordStore) ||
    !isDefined(fieldMetadataItem) ||
    !isDefined(objectMetadataItem)
  ) {
    return false;
  }

  // The cell owns emptiness (morph and reference-backed values), the evaluator owns the rule
  return getRecordRequiredFieldViolations(
    { ...recordStore, [fieldMetadataItem.name]: null },
    objectMetadataItem,
  ).some(
    (fieldViolation) => fieldViolation.fieldMetadataId === fieldMetadataItem.id,
  );
};
