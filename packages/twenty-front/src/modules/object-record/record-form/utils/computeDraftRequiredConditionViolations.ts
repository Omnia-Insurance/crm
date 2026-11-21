import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getFieldMetadataItemGqlFieldName } from '@/object-metadata/utils/getFieldMetadataItemGqlFieldName';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { getRecordRequiredFieldViolations } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { AGENT_PROFILE_OBJECT_NAME_SINGULAR } from '@/object-record/record-form/constants/AgentProfileObjectNameSingular';
import { REQUIRED_CONDITION_RULE_ID_PREFIX } from '@/object-record/record-form/constants/RequiredConditionRuleIdPrefix';
import { REQUIRED_CONDITION_SERVER_FILLED_FIELD_NAMES_BY_OBJECT_NAME_SINGULAR } from '@/object-record/record-form/constants/RequiredConditionServerFilledFieldNamesByObjectNameSingular';
import { getRequiredConditionViolationMessage } from '@/object-record/record-form/utils/getRequiredConditionViolationMessage';
import { isFieldMetadataItemEligibleForRecordForm } from '@/object-record/record-form/utils/isFieldMetadataItemEligibleForRecordForm';
import { normalizeRequiredConditionRecord } from '@/object-record/record-form/utils/normalizeRequiredConditionRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type ValidationRuleViolation } from '@/validation-rules/types/ValidationRuleViolation';
import { isUndefined } from '@sniptt/guards';
import { fieldMetadataDefaultValueFunctionName } from 'twenty-shared/types';
import { capitalize, isDefined } from 'twenty-shared/utils';
import { stripSimpleQuotesFromStringRecursive } from '~/utils/string/stripSimpleQuotesFromString';

const FUNCTION_DEFAULT_VALUES: unknown[] = Object.values(
  fieldMetadataDefaultValueFunctionName,
);

export const computeDraftRequiredConditionViolations = ({
  draftRecord,
  objectMetadataItem,
  canUpdateField,
}: {
  draftRecord: Partial<ObjectRecord>;
  objectMetadataItem: EnrichedObjectMetadataItem;
  canUpdateField: (fieldMetadataId: string) => boolean;
}): ValidationRuleViolation[] => {
  const activeFieldMetadataItems = objectMetadataItem.fields.filter(
    (fieldMetadataItem) => fieldMetadataItem.isActive === true,
  );

  const serverFilledFieldNames =
    REQUIRED_CONDITION_SERVER_FILLED_FIELD_NAMES_BY_OBJECT_NAME_SINGULAR[
      objectMetadataItem.nameSingular
    ] ?? [];

  // The server writes static defaults on insert, so a field left out of the draft already holds one
  const staticDefaultValues = Object.fromEntries(
    activeFieldMetadataItems
      .filter(
        (fieldMetadataItem) =>
          isDefined(fieldMetadataItem.defaultValue) &&
          !FUNCTION_DEFAULT_VALUES.includes(fieldMetadataItem.defaultValue),
      )
      .map((fieldMetadataItem) => [
        fieldMetadataItem.name,
        stripSimpleQuotesFromStringRecursive(fieldMetadataItem.defaultValue),
      ]),
  );

  const draftValues = Object.fromEntries(
    Object.entries(draftRecord).filter(
      ([, draftValue]) => !isUndefined(draftValue),
    ),
  );

  const evaluatedRecord: ObjectRecord = {
    ...normalizeRequiredConditionRecord({
      record: { ...staticDefaultValues, ...draftValues },
      fieldMetadataItems: activeFieldMetadataItems,
    }),
    id: draftRecord.id ?? '',
    __typename: capitalize(objectMetadataItem.nameSingular),
  };

  return getRecordRequiredFieldViolations(evaluatedRecord, {
    ...objectMetadataItem,
    fields: activeFieldMetadataItems,
  }).flatMap((fieldViolation) => {
    const fieldMetadataItem = activeFieldMetadataItems.find(
      (candidate) => candidate.id === fieldViolation.fieldMetadataId,
    );

    // The form cannot fill these, so they stay record-page indicators only
    if (
      !isDefined(fieldMetadataItem) ||
      !isFieldMetadataItemEligibleForRecordForm(fieldMetadataItem) ||
      serverFilledFieldNames.includes(fieldMetadataItem.name) ||
      (FUNCTION_DEFAULT_VALUES.includes(fieldMetadataItem.defaultValue) &&
        !(getFieldMetadataItemGqlFieldName(fieldMetadataItem) in draftRecord))
    ) {
      return [];
    }

    return [
      {
        ruleId: `${REQUIRED_CONDITION_RULE_ID_PREFIX}:${fieldMetadataItem.id}`,
        fieldMetadataId: fieldMetadataItem.id,
        message: getRequiredConditionViolationMessage({
          fieldLabel: fieldViolation.fieldLabel,
          isReadOnly: !canUpdateField(fieldMetadataItem.id),
          isAgentProfileRelation:
            isManyToOneRelationField(fieldMetadataItem) &&
            fieldMetadataItem.relation.targetObjectMetadata.nameSingular ===
              AGENT_PROFILE_OBJECT_NAME_SINGULAR,
        }),
      },
    ];
  });
};
