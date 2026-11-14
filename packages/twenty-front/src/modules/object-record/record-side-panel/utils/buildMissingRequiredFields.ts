import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type DraftCombinedViolations } from '@/object-record/record-field/ui/hooks/useDraftCombinedViolations';
import { type MissingRequiredField } from '@/object-record/record-side-panel/utils/getMissingRequiredFieldsMessage';
import { FieldMetadataType, type ObjectPermissions } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

type BuildMissingRequiredFieldsArgs = {
  violations: DraftCombinedViolations;
  objectMetadataItem: EnrichedObjectMetadataItem;
  getObjectMetadataItem: (
    nameSingular: string,
  ) => EnrichedObjectMetadataItem | null | undefined;
  getRestrictedFields: (
    objectMetadataId: string,
  ) => ObjectPermissions['restrictedFields'];
};

const toMissingRequiredField = ({
  fieldMetadataId,
  fieldLabel,
  objectMetadataItem,
  getRestrictedFields,
}: {
  fieldMetadataId: string;
  fieldLabel: string;
  objectMetadataItem: EnrichedObjectMetadataItem | null | undefined;
  getRestrictedFields: BuildMissingRequiredFieldsArgs['getRestrictedFields'];
}) => {
  const field = objectMetadataItem?.fields.find(
    (candidate) => candidate.id === fieldMetadataId,
  );

  return {
    fieldName: field?.name,
    fieldLabel,
    isReadOnly:
      isDefined(objectMetadataItem) &&
      getRestrictedFields(objectMetadataItem.id)[fieldMetadataId]?.canUpdate ===
        false,
    isAgentProfileRelation:
      field?.type === FieldMetadataType.RELATION &&
      field.relation?.targetObjectMetadata?.nameSingular === 'agentProfile',
  };
};

export const buildMissingRequiredFields = ({
  violations,
  objectMetadataItem,
  getObjectMetadataItem,
  getRestrictedFields,
}: BuildMissingRequiredFieldsArgs): MissingRequiredField[] => {
  const ownFields = violations.draftViolations.map((violation) => {
    const missingField = toMissingRequiredField({
      ...violation,
      objectMetadataItem,
      getRestrictedFields,
    });

    return {
      ...missingField,
      fieldName: missingField.fieldName ?? '',
    };
  });

  const relatedFields = violations.relatedViolations.flatMap(
    (relatedViolation) => {
      const relatedObjectMetadataItem = getObjectMetadataItem(
        relatedViolation.relatedObjectNameSingular,
      );

      return relatedViolation.violations.map((violation) => ({
        ...toMissingRequiredField({
          ...violation,
          objectMetadataItem: relatedObjectMetadataItem,
          getRestrictedFields,
        }),
        fieldName: relatedViolation.relationFieldName,
        relationLabel: relatedViolation.relationLabel,
      }));
    },
  );

  return [...ownFields, ...relatedFields];
};
