import { isNonEmptyString } from '@sniptt/guards';
import { useContext, useLayoutEffect, useMemo, useState } from 'react';
import { FieldMetadataType } from 'twenty-shared/types';
import {
  canReachSomeRecords,
  findById,
  isDefined,
  isFieldValueRestricted,
  isPlainObject,
} from 'twenty-shared/utils';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { FieldDisplay } from '@/object-record/record-field/ui/components/FieldDisplay';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { ForbiddenFieldDisplay } from '@/object-record/record-field/ui/meta-types/display/components/ForbiddenFieldDisplay';
import { getRelationSubFieldMetadataItem } from '@/object-record/record-field/utils/getRelationSubFieldMetadataItem';
import { isRelationSubFieldDefinition } from '@/object-record/record-field/utils/isRelationSubFieldDefinition';
import { useRecordFieldValue } from '@/object-record/record-store/hooks/useRecordFieldValue';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { TextDisplay } from '@/ui/field/display/components/TextDisplay/TextDisplay';

const isNestedRelationRecord = (value: unknown): value is ObjectRecord =>
  isPlainObject(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.__typename);

// OMNIA-CUSTOM: cell of a relation sub-field column such as "Lead / Date of Birth"
export const RelationSubFieldDisplay = () => {
  const fieldContext = useContext(FieldContext);
  const { recordId, fieldDefinition } = fieldContext;
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const { upsertRecordsInStore } = useUpsertRecordsInStore();
  const [hydratedRelatedRecordId, setHydratedRelatedRecordId] = useState<
    string | null
  >(null);

  const relationSubFieldMetadata = isRelationSubFieldDefinition(fieldDefinition)
    ? fieldDefinition.metadata
    : undefined;
  const targetObjectMetadataId =
    relationSubFieldMetadata?.relationObjectMetadataId ?? '';
  const subFieldName = relationSubFieldMetadata?.subFieldName ?? '';

  // Only fields the role can read get a definition, so an unreadable sub-field shows
  // the lock even when the server sends its value
  const subFieldMetadataItem = getRelationSubFieldMetadataItem({
    targetObjectMetadataId,
    subFieldName,
    objectMetadataItems,
  });
  const targetObjectMetadataItem = objectMetadataItems.find(
    findById(targetObjectMetadataId),
  );
  const canReadTargetRecords = canReachSomeRecords({
    objectRecordsPermissions: getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      targetObjectMetadataId,
    ),
    operationType: 'read',
  });

  const subFieldDefinition = useMemo(
    () =>
      isDefined(subFieldMetadataItem) && isDefined(targetObjectMetadataItem)
        ? formatFieldMetadataItemAsFieldDefinition({
            field: subFieldMetadataItem,
            objectMetadataItem: targetObjectMetadataItem,
          })
        : undefined,
    [subFieldMetadataItem, targetObjectMetadataItem],
  );

  // The column carries the sub-field's type; the value read here is the relation's
  const relatedRecord = useRecordFieldValue<ObjectRecord | null>(
    recordId,
    fieldDefinition.metadata.fieldName,
    { type: FieldMetadataType.RELATION, metadata: fieldDefinition.metadata },
  );
  const relatedRecordId =
    isPlainObject(relatedRecord) && isNonEmptyString(relatedRecord.id)
      ? relatedRecord.id
      : undefined;

  const canDisplaySubField =
    isDefined(subFieldDefinition) && canReadTargetRecords;

  // The related record only lives nested in the row, while native displays read the
  // store by record id. A layout effect: the cell re-renders with it before the paint
  useLayoutEffect(() => {
    if (
      !canDisplaySubField ||
      !isDefined(relatedRecord) ||
      !isDefined(relatedRecordId)
    ) {
      return;
    }

    upsertRecordsInStore({
      partialRecords: [
        relatedRecord,
        ...Object.values(relatedRecord).filter(isNestedRelationRecord),
      ],
    });
    setHydratedRelatedRecordId(relatedRecordId);
  }, [
    canDisplaySubField,
    relatedRecord,
    relatedRecordId,
    upsertRecordsInStore,
  ]);

  if (!isDefined(relationSubFieldMetadata)) {
    return <TextDisplay text="" />;
  }

  if (!isDefined(subFieldDefinition) || !canReadTargetRecords) {
    return <ForbiddenFieldDisplay />;
  }

  if (!isDefined(relatedRecord) || !isDefined(relatedRecordId)) {
    return <TextDisplay text="" />;
  }

  if (isFieldValueRestricted(relatedRecord[subFieldName])) {
    return <ForbiddenFieldDisplay />;
  }

  if (hydratedRelatedRecordId !== relatedRecordId) {
    return <TextDisplay text="" />;
  }

  return (
    <FieldContext.Provider
      value={{
        ...fieldContext,
        fieldMetadataItemId: subFieldDefinition.fieldMetadataId,
        recordId: relatedRecordId,
        fieldDefinition: subFieldDefinition,
        isLabelIdentifier: false,
        isRecordFieldReadOnly: true,
      }}
    >
      <FieldDisplay />
    </FieldContext.Provider>
  );
};
