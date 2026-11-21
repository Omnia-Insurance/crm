import { getRecordRequiredFieldViolations } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { REQUIRED_CONDITION_RULE_ID_PREFIX } from '@/object-record/record-form/constants/RequiredConditionRuleIdPrefix';
import { type RelatedRecordRequiredConditionCheck } from '@/object-record/record-form/types/RelatedRecordRequiredConditionCheck';
import { getRequiredConditionViolationMessage } from '@/object-record/record-form/utils/getRequiredConditionViolationMessage';
import { normalizeRequiredConditionRecord } from '@/object-record/record-form/utils/normalizeRequiredConditionRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type ValidationRuleViolation } from '@/validation-rules/types/ValidationRuleViolation';

export const computeRelatedRecordRequiredConditionCheckViolations = ({
  relatedRecordRequiredConditionCheck,
  relatedRecord,
  canUpdateField,
}: {
  relatedRecordRequiredConditionCheck: RelatedRecordRequiredConditionCheck;
  relatedRecord: ObjectRecord;
  canUpdateField: (fieldMetadataId: string) => boolean;
}): ValidationRuleViolation[] => {
  const {
    relationFieldMetadataItem,
    relatedObjectMetadataItem,
    evaluatedFieldMetadataItems,
  } = relatedRecordRequiredConditionCheck;

  const evaluatedRecord: ObjectRecord = {
    ...normalizeRequiredConditionRecord({
      record: relatedRecord,
      fieldMetadataItems: evaluatedFieldMetadataItems,
    }),
    id: relatedRecord.id,
    __typename: relatedRecord.__typename,
  };

  return getRecordRequiredFieldViolations(evaluatedRecord, {
    ...relatedObjectMetadataItem,
    fields: evaluatedFieldMetadataItems,
  }).map((fieldViolation) => ({
    ruleId: `${REQUIRED_CONDITION_RULE_ID_PREFIX}:${relationFieldMetadataItem.id}:${fieldViolation.fieldMetadataId}`,
    fieldMetadataId: null,
    message: getRequiredConditionViolationMessage({
      fieldLabel: fieldViolation.fieldLabel,
      relationLabel: relationFieldMetadataItem.label,
      isReadOnly: !canUpdateField(fieldViolation.fieldMetadataId),
      isAgentProfileRelation: false,
    }),
  }));
};
