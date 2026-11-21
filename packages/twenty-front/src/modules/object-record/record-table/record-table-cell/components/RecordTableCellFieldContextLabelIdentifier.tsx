import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { isRecordFieldReadOnly } from '@/object-record/read-only/utils/isRecordFieldReadOnly';
import {
  FieldContext,
  type GenericFieldContextType,
} from '@/object-record/record-field/ui/contexts/FieldContext';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useGetRecordTableRowIndex } from '@/object-record/record-table/record-table-row/hooks/useGetRecordTableRowIndex';
import { RecordTableCellContext } from '@/object-record/record-table/contexts/RecordTableCellContext';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { useRecordTableRowContextOrThrow } from '@/object-record/record-table/contexts/RecordTableRowContext';
import { RecordTableUpdateContext } from '@/object-record/record-table/contexts/RecordTableUpdateContext';
import { isRecordTableCellsNonEditableComponentState } from '@/object-record/record-table/states/isRecordTableCellsNonEditableComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useCallback, useContext, useMemo, type ReactNode } from 'react';
import { canReachSomeRecords, isDefined } from 'twenty-shared/utils';

type RecordTableCellFieldContextLabelIdentifierProps = {
  children: ReactNode;
};

export const RecordTableCellFieldContextLabelIdentifier = ({
  children,
}: RecordTableCellFieldContextLabelIdentifierProps) => {
  const {
    objectPermissionsByObjectMetadataId,
    fieldMetadataItemByFieldMetadataItemId,
    fieldDefinitionByFieldMetadataItemId,
  } = useRecordIndexContextOrThrow();
  const { recordId, isRecordReadOnly, restrictedFieldNames } =
    useRecordTableRowContextOrThrow();

  const { getRecordTableRowIndex } = useGetRecordTableRowIndex();

  const isRecordTableCellsNonEditable = useAtomComponentStateValue(
    isRecordTableCellsNonEditableComponentState,
  );

  const { recordField } = useContext(RecordTableCellContext);
  const { objectMetadataItem, onRecordIdentifierClick, triggerEvent } =
    useRecordTableContextOrThrow();

  const objectPermissions = getObjectPermissionsForObject(
    objectPermissionsByObjectMetadataId,
    objectMetadataItem.id,
  );

  const hasObjectReadPermissions = canReachSomeRecords({
    objectRecordsPermissions: objectPermissions,
    operationType: 'read',
  });

  const updateRecord = useContext(RecordTableUpdateContext);

  const fieldDefinition =
    fieldDefinitionByFieldMetadataItemId[recordField.fieldMetadataItemId];
  const fieldMetadataItem =
    fieldMetadataItemByFieldMetadataItemId[recordField.fieldMetadataItemId];

  // OMNIA-CUSTOM: memoized (one value per row), so every hook runs before upstream's early return
  const handleChipClick = useCallback(() => {
    const rowIndex = getRecordTableRowIndex();

    if (isDefined(rowIndex)) {
      onRecordIdentifierClick?.(rowIndex, recordId);
    }
  }, [getRecordTableRowIndex, onRecordIdentifierClick, recordId]);

  const fieldContextValue = useMemo<GenericFieldContextType | null>(
    () =>
      isDefined(fieldMetadataItem)
        ? {
            recordId,
            fieldDefinition,
            useUpdateRecord: updateRecord
              ? () => [updateRecord, {}]
              : undefined,
            isLabelIdentifier: true,
            displayedMaxRows: 1,
            isRecordFieldReadOnly:
              isRecordTableCellsNonEditable ||
              restrictedFieldNames.includes(
                fieldDefinition.metadata.fieldName,
              ) ||
              isRecordFieldReadOnly({
                isRecordReadOnly: isRecordReadOnly ?? false,
                objectMetadataId: objectMetadataItem.id,
                fieldMetadataItem,
                fieldDefinition,
                objectPermissionsByObjectMetadataId,
              }),
            maxWidth: recordField.size,
            onRecordChipClick: handleChipClick,
            isForbidden: !hasObjectReadPermissions,
            triggerEvent,
          }
        : null,
    [
      fieldMetadataItem,
      fieldDefinition,
      recordId,
      updateRecord,
      isRecordTableCellsNonEditable,
      restrictedFieldNames,
      isRecordReadOnly,
      objectMetadataItem.id,
      objectPermissionsByObjectMetadataId,
      recordField.size,
      handleChipClick,
      hasObjectReadPermissions,
      triggerEvent,
    ],
  );

  if (!isDefined(fieldContextValue)) {
    return null;
  }

  return (
    <FieldContext.Provider value={fieldContextValue}>
      {children}
    </FieldContext.Provider>
  );
};
