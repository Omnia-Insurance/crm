import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { objectPermissionsByObjectMetadataIdSelector } from '@/object-metadata/states/objectPermissionsByObjectMetadataIdSelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getFieldPermissions } from '@/object-metadata/utils/getFieldPermissions';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { getRecordsFromRecordConnection } from '@/object-record/cache/utils/getRecordsFromRecordConnection';
import { type RecordGqlOperationFindManyResult } from '@/object-record/graphql/types/RecordGqlOperationFindManyResult';
import { type RelatedRecordRequiredConditionCheck } from '@/object-record/record-form/types/RelatedRecordRequiredConditionCheck';
import { computeDraftRequiredConditionViolations } from '@/object-record/record-form/utils/computeDraftRequiredConditionViolations';
import { computeRelatedRecordRequiredConditionCheckViolations } from '@/object-record/record-form/utils/computeRelatedRecordRequiredConditionCheckViolations';
import { getRelatedRecordRequiredConditionChecks } from '@/object-record/record-form/utils/getRelatedRecordRequiredConditionChecks';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { generateFindManyRecordsQuery } from '@/object-record/utils/generateFindManyRecordsQuery';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { type ValidationRuleViolation } from '@/validation-rules/types/ValidationRuleViolation';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

export const useRequiredConditionViolations = ({
  objectMetadataItem,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
}) => {
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const objectPermissionsByObjectMetadataId = useAtomStateValue(
    objectPermissionsByObjectMetadataIdSelector,
  );

  const hasRequiredConditions = objectMetadataItem.fields.some(
    (fieldMetadataItem) =>
      fieldMetadataItem.isActive === true &&
      isDefined(fieldMetadataItem.requiredCondition),
  );

  const getCanUpdateField = useCallback(
    (objectMetadataId: string) => {
      const objectPermissions = getObjectPermissionsForObject(
        objectPermissionsByObjectMetadataId,
        objectMetadataId,
      );

      return (fieldMetadataId: string) =>
        getFieldPermissions({ objectPermissions, fieldMetadataId })
          .canUpdateField;
    },
    [objectPermissionsByObjectMetadataId],
  );

  const computeRequiredConditionViolations = useCallback(
    (draftRecord: Partial<ObjectRecord>): ValidationRuleViolation[] =>
      computeDraftRequiredConditionViolations({
        draftRecord,
        objectMetadataItem,
        canUpdateField: getCanUpdateField(objectMetadataItem.id),
      }),
    [getCanUpdateField, objectMetadataItem],
  );

  const findRelatedRecord = useCallback(
    async ({
      relatedObjectMetadataItem,
      relatedRecordId,
      recordGqlFields,
    }: RelatedRecordRequiredConditionCheck): Promise<
      ObjectRecord | undefined
    > => {
      try {
        const { data } =
          await apolloCoreClient.query<RecordGqlOperationFindManyResult>({
            query: generateFindManyRecordsQuery({
              objectMetadataItem: relatedObjectMetadataItem,
              objectMetadataItems,
              recordGqlFields,
              objectPermissionsByObjectMetadataId,
            }),
            variables: { filter: { id: { eq: relatedRecordId } }, limit: 1 },
            fetchPolicy: 'network-only',
          });

        const recordConnection = data?.[relatedObjectMetadataItem.namePlural];

        return isDefined(recordConnection)
          ? getRecordsFromRecordConnection({ recordConnection })[0]
          : undefined;
      } catch {
        // These rules are soft, so a failed lookup lets Create go ahead and report its own errors
        return undefined;
      }
    },
    [
      apolloCoreClient,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  const computeRelatedRecordRequiredConditionViolations = useCallback(
    async (
      draftRecord: Partial<ObjectRecord>,
    ): Promise<ValidationRuleViolation[]> => {
      const relatedRecordRequiredConditionChecks =
        getRelatedRecordRequiredConditionChecks({
          draftRecord,
          objectMetadataItem,
          objectMetadataItems,
          objectPermissionsByObjectMetadataId,
        });

      const violationsByRelatedRecord = await Promise.all(
        relatedRecordRequiredConditionChecks.map(
          async (relatedRecordRequiredConditionCheck) => {
            const relatedRecord = await findRelatedRecord(
              relatedRecordRequiredConditionCheck,
            );

            return isDefined(relatedRecord)
              ? computeRelatedRecordRequiredConditionCheckViolations({
                  relatedRecordRequiredConditionCheck,
                  relatedRecord,
                  canUpdateField: getCanUpdateField(
                    relatedRecordRequiredConditionCheck
                      .relatedObjectMetadataItem.id,
                  ),
                })
              : [];
          },
        ),
      );

      return violationsByRelatedRecord.flat();
    },
    [
      findRelatedRecord,
      getCanUpdateField,
      objectMetadataItem,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  return {
    hasRequiredConditions,
    computeRequiredConditionViolations,
    computeRelatedRecordRequiredConditionViolations,
  };
};
