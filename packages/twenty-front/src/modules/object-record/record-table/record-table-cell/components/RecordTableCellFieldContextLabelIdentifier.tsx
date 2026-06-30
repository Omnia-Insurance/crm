import { useGetIsMetadataItemFromStandardApplication } from '@/object-metadata/hooks/useGetIsMetadataItemFromStandardApplication';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { isRecordFieldReadOnly } from '@/object-record/read-only/utils/isRecordFieldReadOnly';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { shouldCompactRecordIndexLabelIdentifierComponentState } from '@/object-record/record-index/states/shouldCompactRecordIndexLabelIdentifierComponentState';
import { RecordTableCellContext } from '@/object-record/record-table/contexts/RecordTableCellContext';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { useRecordTableRowContextOrThrow } from '@/object-record/record-table/contexts/RecordTableRowContext';
import { RecordTableUpdateContext } from '@/object-record/record-table/contexts/RecordTableUpdateContext';
import { isRecordTableCellsNonEditableComponentState } from '@/object-record/record-table/states/isRecordTableCellsNonEditableComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useCallback, useContext, useMemo, type ReactNode } from 'react';

type RecordTableCellFieldContextLabelIdentifierProps = {
  children: ReactNode;
};

export const RecordTableCellFieldContextLabelIdentifier = ({
  children,
}: RecordTableCellFieldContextLabelIdentifierProps) => {
  const {
    objectPermissionsByObjectMetadataId,
    fieldDefinitionByFieldMetadataItemId,
  } = useRecordIndexContextOrThrow();
  const { recordId, isRecordReadOnly, rowIndex } =
    useRecordTableRowContextOrThrow();

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

  const shouldCompactRecordIndexLabelIdentifier = useAtomComponentStateValue(
    shouldCompactRecordIndexLabelIdentifierComponentState,
  );

  const hasObjectReadPermissions = objectPermissions.canReadObjectRecords;

  const updateRecord = useContext(RecordTableUpdateContext);
  const getIsMetadataItemFromStandardApplication =
    useGetIsMetadataItemFromStandardApplication();

  const fieldDefinition =
    fieldDefinitionByFieldMetadataItemId[recordField.fieldMetadataItemId];

  // OMNIA-CUSTOM: Memoize callback and context value — this component renders
  // per label-identifier cell. Without memoization, every parent re-render
  // creates new object/function refs, cascading re-renders to all consumers.
  const handleChipClick = useCallback(() => {
    onRecordIdentifierClick?.(rowIndex, recordId);
  }, [onRecordIdentifierClick, rowIndex, recordId]);

  const useUpdateRecordHook = useMemo(
    () =>
      updateRecord
        ? (): [(params: any) => void, any] => [updateRecord, {}]
        : undefined,
    [updateRecord],
  );

  const contextValue = useMemo(
    () => ({
      recordId,
      fieldDefinition,
      useUpdateRecord: useUpdateRecordHook,
      isLabelIdentifier: true,
      isLabelIdentifierCompact: shouldCompactRecordIndexLabelIdentifier,
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
            id: recordField.fieldMetadataItemId,
            isUIEditable: fieldDefinition.metadata.isUIEditable ?? true,
          },
          fieldDefinition,
          objectPermissionsByObjectMetadataId,
        }),
      maxWidth: recordField.size,
      onRecordChipClick: handleChipClick,
      isForbidden: !hasObjectReadPermissions,
      triggerEvent,
    }),
    [
      recordId,
      fieldDefinition,
      useUpdateRecordHook,
      shouldCompactRecordIndexLabelIdentifier,
      isRecordTableCellsNonEditable,
      isRecordReadOnly,
      objectMetadataItem,
      objectPermissions,
      recordField.fieldMetadataItemId,
      recordField.size,
      handleChipClick,
      hasObjectReadPermissions,
      triggerEvent,
      objectPermissionsByObjectMetadataId,
      getIsMetadataItemFromStandardApplication,
    ],
  );

  return (
    <FieldContext.Provider value={contextValue}>{children}</FieldContext.Provider>
  );
};
