import { useGetIsMetadataItemFromStandardApplication } from '@/object-metadata/hooks/useGetIsMetadataItemFromStandardApplication';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { isLabelIdentifierField } from '@/object-metadata/utils/isLabelIdentifierField';
import { isRecordFieldReadOnly } from '@/object-record/read-only/utils/isRecordFieldReadOnly';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { isFieldRelationManyToOne } from '@/object-record/record-field/ui/types/guards/isFieldRelationManyToOne';
import { isFieldRelationOneToMany } from '@/object-record/record-field/ui/types/guards/isFieldRelationOneToMany';
import { getJunctionConfig } from '@/object-record/record-field/ui/utils/junction/getJunctionConfig';
import { getTargetObjectMetadataIdsFromField } from '@/object-record/record-field/ui/utils/junction/getTargetObjectMetadataIdsFromField';
import { hasJunctionConfig } from '@/object-record/record-field/ui/utils/junction/hasJunctionConfig';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { useRecordTableRowContextOrThrow } from '@/object-record/record-table/contexts/RecordTableRowContext';
import { RecordTableUpdateContext } from '@/object-record/record-table/contexts/RecordTableUpdateContext';
import { isRecordTableCellsNonEditableComponentState } from '@/object-record/record-table/states/isRecordTableCellsNonEditableComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useContext, useMemo, type ReactNode } from 'react';
import { isDefined } from 'twenty-shared/utils';
type RecordTableCellFieldContextGenericProps = {
  recordField: RecordField;
  children: ReactNode;
};

export const RecordTableCellFieldContextGeneric = ({
  recordField,
  children,
}: RecordTableCellFieldContextGenericProps) => {
  const { recordId, isRecordReadOnly } = useRecordTableRowContextOrThrow();

  const isRecordTableCellsNonEditable = useAtomComponentStateValue(
    isRecordTableCellsNonEditableComponentState,
  );

  const { objectMetadataItem, objectMetadataItems, objectPermissions } =
    useRecordTableContextOrThrow();

  const {
    objectPermissionsByObjectMetadataId,
    fieldDefinitionByFieldMetadataItemId,
  } = useRecordIndexContextOrThrow();

  let fieldDefinition =
    fieldDefinitionByFieldMetadataItemId[recordField.fieldMetadataItemId];

  // OMNIA-CUSTOM: For sub-field columns, override the field definition to inject
  // subFieldName into metadata so FieldDisplay routes to RelationSubFieldDisplay.
  // We also look up the sub-field's type/label from the target object metadata.
  if (isDefined(recordField.subFieldName) && isDefined(fieldDefinition)) {
    const targetObjectNameSingular = (
      fieldDefinition.metadata as Record<string, unknown>
    ).relationObjectMetadataNameSingular as string | undefined;

    const targetObjectMetadata = targetObjectNameSingular
      ? objectMetadataItems.find(
          (item) => item.nameSingular === targetObjectNameSingular,
        )
      : undefined;

    const subFieldMeta = targetObjectMetadata?.fields.find(
      (f) => f.name === recordField.subFieldName && f.isActive,
    );

    fieldDefinition = {
      ...fieldDefinition,
      fieldMetadataId: `${fieldDefinition.fieldMetadataId}.${recordField.subFieldName}`,
      label: `${fieldDefinition.label} / ${subFieldMeta?.label ?? recordField.subFieldName}`,
      type: (subFieldMeta?.type ?? fieldDefinition.type) as any,
      isUIEditable: false,
      metadata: {
        ...fieldDefinition.metadata,
        subFieldName: recordField.subFieldName,
        isUIEditable: false,
      } as any,
    };
  }

  const updateRecord = useContext(RecordTableUpdateContext);
  const getIsMetadataItemFromStandardApplication =
    useGetIsMetadataItemFromStandardApplication();

  let hasObjectReadPermissions = objectPermissions.canReadObjectRecords;

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

    hasObjectReadPermissions = relationObjectPermissions.canReadObjectRecords;

    if (
      hasObjectReadPermissions &&
      hasJunctionConfig(fieldDefinition.metadata.settings)
    ) {
      const junctionConfig = getJunctionConfig({
        settings: fieldDefinition.metadata.settings,
        relationObjectMetadataId,
        sourceObjectMetadataId: objectMetadataItem.id,
        objectMetadataItems,
      });

      if (isDefined(junctionConfig)) {
        const targetObjectMetadataIds = junctionConfig.targetFields.flatMap(
          getTargetObjectMetadataIdsFromField,
        );

        if (targetObjectMetadataIds.length > 0) {
          hasObjectReadPermissions = targetObjectMetadataIds.some(
            (targetId) =>
              getObjectPermissionsForObject(
                objectPermissionsByObjectMetadataId,
                targetId,
              ).canReadObjectRecords,
          );
        }
      }
    }
  }

  // OMNIA-CUSTOM: Memoize context value — this component renders per cell
  // (O(rows × fields)). Without memoization, every parent re-render creates
  // a new object reference, forcing all FieldContext consumers to re-render.
  const useUpdateRecordHook = useMemo(
    () =>
      updateRecord
        ? (): [(params: any) => void, any] => [updateRecord, {}]
        : undefined,
    [updateRecord],
  );

  const contextValue = useMemo(
    () => ({
      fieldMetadataItemId: recordField.fieldMetadataItemId,
      recordId,
      fieldDefinition: fieldDefinition,
      useUpdateRecord: useUpdateRecordHook,
      isLabelIdentifier: isLabelIdentifierField({
        fieldMetadataItem: {
          id: fieldDefinition.fieldMetadataId,
          name: fieldDefinition.metadata.fieldName,
        },
        objectMetadataItem,
      }),
      displayedMaxRows: 1,
      isRecordFieldReadOnly:
        isRecordTableCellsNonEditable ||
        isRecordFieldReadOnly({
          isRecordReadOnly: isRecordReadOnly ?? false,
          isSystemObject: objectMetadataItem.isSystem,
          isFieldFromStandardApplication:
            getIsMetadataItemFromStandardApplication({
              applicationId: fieldDefinition.metadata.applicationId,
            }),
          objectPermissions,
          fieldMetadataItem: {
            id: fieldDefinition.fieldMetadataId,
            isUIEditable: fieldDefinition.metadata.isUIEditable ?? true,
          },
          fieldDefinition,
          objectPermissionsByObjectMetadataId,
        }),
      isForbidden: !hasObjectReadPermissions,
    }),
    [
      recordField.fieldMetadataItemId,
      recordId,
      fieldDefinition,
      useUpdateRecordHook,
      objectMetadataItem,
      isRecordTableCellsNonEditable,
      isRecordReadOnly,
      objectPermissions,
      hasObjectReadPermissions,
      objectPermissionsByObjectMetadataId,
      getIsMetadataItemFromStandardApplication,
    ],
  );

  return (
    <FieldContext.Provider value={contextValue}>
      {children}
    </FieldContext.Provider>
  );
};
