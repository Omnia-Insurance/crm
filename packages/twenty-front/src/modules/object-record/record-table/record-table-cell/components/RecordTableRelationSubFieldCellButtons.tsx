import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { type RelationSubFieldMetadata } from '@/object-record/record-field/types/RelationSubFieldMetadata';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useGetSecondaryFieldButton } from '@/object-record/record-field/ui/hooks/useGetSecondaryFieldButton';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { getRelationSubFieldMetadataItem } from '@/object-record/record-field/utils/getRelationSubFieldMetadataItem';
import { useResolveOpenRecordIn } from '@/object-record/record-index/hooks/useResolveOpenRecordIn';
import { useRecordFieldValue } from '@/object-record/record-store/hooks/useRecordFieldValue';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordTableCellButtons } from '@/object-record/record-table/record-table-cell/components/RecordTableCellButtons';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useContext, useMemo } from 'react';
import {
  AppPath,
  FieldMetadataType,
  OpenRecordIn,
  StandardObjectNameSingular,
} from 'twenty-shared/types';
import {
  findById,
  isDefined,
  isFieldValueRestricted,
  isPlainObject,
} from 'twenty-shared/utils';
import { IconArrowUpRight } from 'twenty-ui/icon';
import { useNavigateApp } from '~/hooks/useNavigateApp';

type RecordTableRelationSubFieldCellButtonsContentProps = {
  relatedObjectNameSingular: string;
};

const RecordTableRelationSubFieldCellButtonsContent = ({
  relatedObjectNameSingular,
}: RecordTableRelationSubFieldCellButtonsContentProps) => {
  const { t } = useLingui();
  const { recordId: relatedRecordId } = useContext(FieldContext);

  const secondaryButton = useGetSecondaryFieldButton();

  const openRecordIn = useResolveOpenRecordIn(relatedObjectNameSingular);
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const navigate = useNavigateApp();

  // Like RecordChip: workspace members have no record page to open
  const canOpenRelatedRecord =
    relatedObjectNameSingular !== StandardObjectNameSingular.WorkspaceMember;

  const handleOpenRelatedRecordClick = () => {
    if (openRecordIn === OpenRecordIn.SIDE_PANEL) {
      openRecordInSidePanel({
        recordId: relatedRecordId,
        objectNameSingular: relatedObjectNameSingular,
      });

      return;
    }

    navigate(AppPath.RecordShowPage, {
      objectNameSingular: relatedObjectNameSingular,
      objectRecordId: relatedRecordId,
    });
  };

  const buttons = [
    ...secondaryButton,
    ...(canOpenRelatedRecord
      ? [
          {
            onClick: handleOpenRelatedRecordClick,
            Icon: IconArrowUpRight,
            ariaLabel: t`Open related record`,
          },
        ]
      : []),
  ];

  if (buttons.length === 0) {
    return null;
  }

  return <RecordTableCellButtons buttons={buttons} />;
};

type RecordTableRelationSubFieldCellButtonsProps = {
  fieldDefinition: FieldDefinition<RelationSubFieldMetadata>;
};

// OMNIA-CUSTOM: hover buttons of a relation sub-field column; they act on the related record, not the row's
export const RecordTableRelationSubFieldCellButtons = ({
  fieldDefinition,
}: RecordTableRelationSubFieldCellButtonsProps) => {
  const { recordId, isForbidden } = useContext(FieldContext);
  const { objectMetadataItems } = useRecordTableContextOrThrow();

  const {
    fieldName,
    relationObjectMetadataId,
    relationObjectMetadataNameSingular,
    subFieldName,
  } = fieldDefinition.metadata;

  // The column carries the sub-field's type; the value read here is the relation's
  const relatedRecord = useRecordFieldValue<ObjectRecord | null>(
    recordId,
    fieldName,
    { type: FieldMetadataType.RELATION, metadata: fieldDefinition.metadata },
  );

  const subFieldDefinition = useMemo(() => {
    const targetObjectMetadataItem = objectMetadataItems.find(
      findById(relationObjectMetadataId),
    );

    const subFieldMetadataItem = getRelationSubFieldMetadataItem({
      targetObjectMetadataId: relationObjectMetadataId,
      subFieldName,
      objectMetadataItems,
    });

    return isDefined(targetObjectMetadataItem) &&
      isDefined(subFieldMetadataItem)
      ? formatFieldMetadataItemAsFieldDefinition({
          field: subFieldMetadataItem,
          objectMetadataItem: targetObjectMetadataItem,
        })
      : undefined;
  }, [objectMetadataItems, relationObjectMetadataId, subFieldName]);

  const relatedRecordId =
    isPlainObject(relatedRecord) && isNonEmptyString(relatedRecord.id)
      ? relatedRecord.id
      : undefined;

  // Nothing to act on: an empty relation, or a cell that shows the "Not shared" lock
  if (
    isForbidden === true ||
    !isDefined(relatedRecordId) ||
    !isDefined(subFieldDefinition) ||
    isFieldValueRestricted(relatedRecord?.[subFieldName])
  ) {
    return null;
  }

  // The native field context at the related record, so copy, call and mail read its value
  return (
    <FieldContext.Provider
      value={{
        fieldMetadataItemId: subFieldDefinition.fieldMetadataId,
        recordId: relatedRecordId,
        fieldDefinition: subFieldDefinition,
        isLabelIdentifier: false,
        isRecordFieldReadOnly: true,
      }}
    >
      <RecordTableRelationSubFieldCellButtonsContent
        relatedObjectNameSingular={relationObjectMetadataNameSingular}
      />
    </FieldContext.Provider>
  );
};
