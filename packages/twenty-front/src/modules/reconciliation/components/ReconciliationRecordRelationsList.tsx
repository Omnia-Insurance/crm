import { isNonEmptyString } from '@sniptt/guards';
import { useContext } from 'react';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { formatFieldMetadataItemAsColumnDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsColumnDefinition';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useIsRecordReadOnly } from '@/object-record/read-only/hooks/useIsRecordReadOnly';
import { isRecordFieldReadOnly } from '@/object-record/read-only/utils/isRecordFieldReadOnly';
import { useFieldListFieldMetadataItems } from '@/object-record/record-field-list/hooks/useFieldListFieldMetadataItems';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useRecordShowContainerActions } from '@/object-record/record-show/hooks/useRecordShowContainerActions';
import { useRecordRestrictedFieldNames } from '@/object-record/record-store/hooks/useRecordRestrictedFieldNames';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { recordStoreRecordsSelector } from '@/object-record/record-store/states/selectors/recordStoreRecordsSelector';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { ReconciliationRecordRelationSection } from '@/reconciliation/components/ReconciliationRecordRelationSection';
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { getRelationFieldNamesWithPendingDiffs } from '@/reconciliation/utils/getRelationFieldNamesWithPendingDiffs';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

type ReconciliationRecordRelationsListProps = {
  objectNameSingular: string;
  objectRecordId: string;
  isReadOnly?: boolean;
  expandedRelationFieldNames?: string[];
};

export const ReconciliationRecordRelationsList = ({
  objectNameSingular,
  objectRecordId,
  isReadOnly = false,
  expandedRelationFieldNames = [],
}: ReconciliationRecordRelationsListProps) => {
  const reconciliationDiffs = useContext(ReconciliationDiffsContext);

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const { useUpdateOneObjectRecordMutation } = useRecordShowContainerActions({
    objectNameSingular,
  });

  const isRecordReadOnly = useIsRecordReadOnly({
    recordId: objectRecordId,
    objectMetadataId: objectMetadataItem.id,
  });

  // Built from readableFields and skips relations to objects the role cannot read
  const { boxedRelationFieldMetadataItems } = useFieldListFieldMetadataItems({
    objectNameSingular,
  });

  const restrictedFieldNames = useRecordRestrictedFieldNames(objectRecordId);

  const relationFieldMetadataItems = boxedRelationFieldMetadataItems.filter(
    (fieldMetadataItem) =>
      fieldMetadataItem.type === FieldMetadataType.RELATION &&
      !restrictedFieldNames.includes(fieldMetadataItem.name),
  );

  const recordStore = useAtomFamilyStateValue(
    recordStoreFamilyState,
    objectRecordId,
  );

  const relatedRecordIdByRelationFieldName = new Map(
    relationFieldMetadataItems.flatMap(
      (fieldMetadataItem): [string, string][] => {
        const relationValue = recordStore?.[fieldMetadataItem.name];

        return fieldMetadataItem.relation?.type === RelationType.MANY_TO_ONE &&
          isPlainObject(relationValue) &&
          isNonEmptyString(relationValue.id)
          ? [[fieldMetadataItem.name, relationValue.id]]
          : [];
      },
    ),
  );

  const relatedRecords = useAtomFamilySelectorValue(
    recordStoreRecordsSelector,
    { recordIds: [...relatedRecordIdByRelationFieldName.values()] },
  );

  const relatedRecordById = new Map(
    relatedRecords.map((relatedRecord) => [relatedRecord.id, relatedRecord]),
  );

  const relatedRecordByRelationFieldName = new Map(
    [...relatedRecordIdByRelationFieldName].flatMap(
      ([relationFieldName, relatedRecordId]): [string, ObjectRecord][] => {
        const relatedRecord = relatedRecordById.get(relatedRecordId);

        return isDefined(relatedRecord)
          ? [[relationFieldName, relatedRecord]]
          : [];
      },
    ),
  );

  const pendingRelationFieldNames = isDefined(reconciliationDiffs)
    ? getRelationFieldNamesWithPendingDiffs({
        fieldDiffs: reconciliationDiffs.fieldDiffs,
        relatedRecordByRelationFieldName,
      })
    : [];

  return (
    <>
      {relationFieldMetadataItems.map((fieldMetadataItem, index) => {
        const fieldDefinition = formatFieldMetadataItemAsColumnDefinition({
          field: fieldMetadataItem,
          position: index,
          objectMetadataItem,
        });

        return (
          <FieldContext.Provider
            key={objectRecordId + fieldMetadataItem.id}
            value={{
              recordId: objectRecordId,
              isLabelIdentifier: false,
              fieldDefinition,
              useUpdateRecord: useUpdateOneObjectRecordMutation,
              isDisplayModeFixHeight: true,
              isRecordFieldReadOnly:
                isReadOnly ||
                isRecordFieldReadOnly({
                  isRecordReadOnly,
                  objectMetadataId: objectMetadataItem.id,
                  fieldMetadataItem,
                  fieldDefinition,
                  objectPermissionsByObjectMetadataId,
                }),
            }}
          >
            <ReconciliationRecordRelationSection
              isAutoExpanded={
                pendingRelationFieldNames.includes(fieldMetadataItem.name) ||
                expandedRelationFieldNames.includes(fieldMetadataItem.name)
              }
            />
          </FieldContext.Provider>
        );
      })}
    </>
  );
};
