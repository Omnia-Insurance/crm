import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { isLabelIdentifierField } from '@/object-metadata/utils/isLabelIdentifierField';
import { isRecordFieldReadOnly } from '@/object-record/read-only/utils/isRecordFieldReadOnly';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import {
  FieldContext,
  type GenericFieldContextType,
} from '@/object-record/record-field/ui/contexts/FieldContext';
import { isFieldRelationManyToOne } from '@/object-record/record-field/ui/types/guards/isFieldRelationManyToOne';
import { isFieldRelationOneToMany } from '@/object-record/record-field/ui/types/guards/isFieldRelationOneToMany';
import { getTargetObjectMetadataIdsFromField } from '@/object-record/record-field/ui/utils/junction/getTargetObjectMetadataIdsFromField';
import { isUsableJunctionConfig } from '@/object-record/record-field/ui/utils/junction/isUsableJunctionConfig';
import { resolveJunctionConfig } from '@/object-record/record-field/ui/utils/junction/resolveJunctionConfig';
import { buildRelationSubFieldDefinition } from '@/object-record/record-field/utils/buildRelationSubFieldDefinition';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { useRecordTableRowContextOrThrow } from '@/object-record/record-table/contexts/RecordTableRowContext';
import { RecordTableUpdateContext } from '@/object-record/record-table/contexts/RecordTableUpdateContext';
import { isRecordTableCellsNonEditableComponentState } from '@/object-record/record-table/states/isRecordTableCellsNonEditableComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { isNonEmptyString } from '@sniptt/guards';
import { useContext, useMemo, type ReactNode } from 'react';
import { canReachSomeRecords, isDefined } from 'twenty-shared/utils';
type RecordTableCellFieldContextGenericProps = {
  recordField: RecordField;
  children: ReactNode;
};

export const RecordTableCellFieldContextGeneric = ({
  recordField,
  children,
}: RecordTableCellFieldContextGenericProps) => {
  const { recordId, isRecordReadOnly, restrictedFieldNames } =
    useRecordTableRowContextOrThrow();

  const isRecordTableCellsNonEditable = useAtomComponentStateValue(
    isRecordTableCellsNonEditableComponentState,
  );

  const { objectMetadataItem, objectMetadataItems, objectPermissions } =
    useRecordTableContextOrThrow();

  const {
    objectPermissionsByObjectMetadataId,
    fieldMetadataItemByFieldMetadataItemId,
    fieldDefinitionByFieldMetadataItemId,
  } = useRecordIndexContextOrThrow();

  const fieldDefinition =
    fieldDefinitionByFieldMetadataItemId[recordField.fieldMetadataItemId];
  const fieldMetadataItem =
    fieldMetadataItemByFieldMetadataItemId[recordField.fieldMetadataItemId];

  const updateRecord = useContext(RecordTableUpdateContext);

  const { fieldMetadataItemId, subFieldName } = recordField;

  // OMNIA-CUSTOM: relation sub-field column ("Lead / Date of Birth"); null when the role cannot read the field
  const relationSubFieldDefinition = useMemo(
    () =>
      isNonEmptyString(subFieldName) && isDefined(fieldDefinition)
        ? buildRelationSubFieldDefinition({
            relationFieldDefinition: fieldDefinition,
            subFieldName,
            objectMetadataItems,
          })
        : undefined,
    [fieldDefinition, subFieldName, objectMetadataItems],
  );

  // OMNIA-CUSTOM: memoized (one value per cell), so every hook runs before upstream's early return
  const fieldContextValue = useMemo<GenericFieldContextType | null>(() => {
    if (!isDefined(fieldMetadataItem)) {
      return null;
    }

    let hasObjectReadPermissions = canReachSomeRecords({
      objectRecordsPermissions: objectPermissions,
      operationType: 'read',
    });
    let isInvalidJunctionRelation = false;

    // todo @guillim : adjust this to handle morph relations permissions display
    if (
      isFieldRelationManyToOne(fieldDefinition) ||
      isFieldRelationOneToMany(fieldDefinition)
    ) {
      const relationObjectMetadataId =
        fieldDefinition.metadata.relationObjectMetadataId;

      const relationObjectPermissions = getObjectPermissionsForObject(
        objectPermissionsByObjectMetadataId,
        relationObjectMetadataId,
      );

      hasObjectReadPermissions = canReachSomeRecords({
        objectRecordsPermissions: relationObjectPermissions,
        operationType: 'read',
      });

      if (hasObjectReadPermissions) {
        const junctionConfig = resolveJunctionConfig({
          settings: fieldDefinition.metadata.settings,
          relationObjectMetadataId,
          relationTargetFieldMetadataId:
            fieldDefinition.metadata.relationFieldMetadataId,
          sourceObjectMetadataId: objectMetadataItem.id,
          objectMetadataItems,
        });

        if (isDefined(junctionConfig)) {
          isInvalidJunctionRelation = !isUsableJunctionConfig(junctionConfig);

          if (isInvalidJunctionRelation) {
            hasObjectReadPermissions = false;
          }

          const targetObjectMetadataIds = junctionConfig.targetFields.flatMap(
            getTargetObjectMetadataIdsFromField,
          );

          if (targetObjectMetadataIds.length > 0) {
            hasObjectReadPermissions = targetObjectMetadataIds.some(
              (targetId) =>
                canReachSomeRecords({
                  objectRecordsPermissions: getObjectPermissionsForObject(
                    objectPermissionsByObjectMetadataId,
                    targetId,
                  ),
                  operationType: 'read',
                }),
            );
          }
        }
      }
    }

    const isFieldRestricted = restrictedFieldNames.includes(
      fieldDefinition.metadata.fieldName,
    );

    // OMNIA-CUSTOM: the checks above use the base relation, so an unreadable target shows "Not shared"
    const isRelationSubFieldColumn = isNonEmptyString(subFieldName);

    return {
      fieldMetadataItemId,
      recordId,
      fieldDefinition: relationSubFieldDefinition ?? fieldDefinition,
      useUpdateRecord: updateRecord ? () => [updateRecord, {}] : undefined,
      isLabelIdentifier: isLabelIdentifierField({
        fieldMetadataItem: {
          id: fieldDefinition.fieldMetadataId,
          name: fieldDefinition.metadata.fieldName,
        },
        objectMetadataItem,
      }),
      displayedMaxRows: 1,
      isRecordFieldReadOnly:
        isRelationSubFieldColumn ||
        isRecordTableCellsNonEditable ||
        isInvalidJunctionRelation ||
        isFieldRestricted ||
        isRecordFieldReadOnly({
          isRecordReadOnly: isRecordReadOnly ?? false,
          objectMetadataId: objectMetadataItem.id,
          fieldMetadataItem,
          fieldDefinition,
          objectPermissionsByObjectMetadataId,
        }),
      isForbidden:
        !hasObjectReadPermissions ||
        isFieldRestricted ||
        relationSubFieldDefinition === null,
    };
  }, [
    fieldMetadataItem,
    fieldDefinition,
    relationSubFieldDefinition,
    subFieldName,
    fieldMetadataItemId,
    recordId,
    updateRecord,
    objectMetadataItem,
    objectMetadataItems,
    objectPermissions,
    objectPermissionsByObjectMetadataId,
    restrictedFieldNames,
    isRecordReadOnly,
    isRecordTableCellsNonEditable,
  ]);

  if (!isDefined(fieldContextValue)) {
    return null;
  }

  return (
    <FieldContext.Provider value={fieldContextValue}>
      {children}
    </FieldContext.Provider>
  );
};
