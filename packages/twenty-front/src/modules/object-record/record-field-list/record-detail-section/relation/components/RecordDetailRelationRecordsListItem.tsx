import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { RecordChip } from '@/object-record/components/RecordChip';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { RecordFieldList } from '@/object-record/record-field-list/components/RecordFieldList';
import { useRecordFieldsScopeContextOrThrow } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { RecordDetailRecordsListItemContainer } from '@/object-record/record-field-list/record-detail-section/components/RecordDetailRecordsListItemContainer';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { FieldInputEventContext } from '@/object-record/record-field/ui/contexts/FieldInputEventContext';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { singleRecordPickerSelectedIdComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSelectedIdComponentState';
import { getRecordFieldCardRelationPickerDropdownId } from '@/object-record/record-show/utils/getRecordFieldCardRelationPickerDropdownId';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { getForeignKeyNameFromRelationFieldName } from '@/object-record/utils/getForeignKeyNameFromRelationFieldName';
import { ReconciliationRelationDiffsScope } from '@/reconciliation/components/ReconciliationRelationDiffsScope';
import { ReconciliationRelationNameDiffChip } from '@/reconciliation/components/ReconciliationRelationNameDiffChip';
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownRoot } from '@/ui/layout/dropdown/components/DropdownRoot';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { motion } from 'framer-motion';
import { useCallback, useContext } from 'react';
import {
  computeMorphRelationGqlFieldName,
  CustomError,
  isDefined,
} from 'twenty-shared/utils';
import { doNotTranslate } from 'twenty-shared/i18n';
import { LightIconButton } from 'twenty-ui/components/input';
import { Dropdown } from 'twenty-ui/components/navigation';
import {
  IconChevronDown,
  IconDotsVertical,
  IconUnlink,
  type IconComponent,
} from 'twenty-ui/icon';
import { Collapsible } from 'twenty-ui/primitives/layout';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

const StyledClickableZone = styled.div`
  align-items: center;
  cursor: pointer;
  display: flex;
  flex: 1 0 auto;
  height: 100%;
  justify-content: flex-end;
`;

const StyledHoverRevealedAction = styled.div`
  display: flex;
`;

const MotionIconChevronDown = motion.create(IconChevronDown);

type RecordDetailRelationRecordsListItemProps = {
  isExpanded: boolean;
  onClick: (relationRecordId: string) => void;
  relationRecord: ObjectRecord;
  relationObjectMetadataNameSingular: string;
  relationFieldMetadataId: string;
};

export const RecordDetailRelationRecordsListItem = ({
  isExpanded,
  onClick,
  relationRecord,
  relationObjectMetadataNameSingular,
  relationFieldMetadataId,
}: RecordDetailRelationRecordsListItemProps) => {
  const { t } = useLingui();
  const { scopeInstanceId } = useRecordFieldsScopeContextOrThrow();
  const {
    fieldDefinition,
    recordId,
    isRecordFieldReadOnly: parentIsRecordFieldReadOnly,
  } = useContext(FieldContext);

  const { onSubmit } = useContext(FieldInputEventContext);

  // OMNIA-CUSTOM: the reconciliation review annotates relation chips and the
  // expanded record with BOB diffs; null everywhere else.
  const reconciliationDiffs = useContext(ReconciliationDiffsContext);

  const { relationType, objectMetadataNameSingular } =
    fieldDefinition.metadata as FieldRelationMetadata;

  const { objectMetadataItems } = useObjectMetadataItems();
  const objectMetadataItem = objectMetadataItems.find(
    (objectMetadataItemToFind) =>
      objectMetadataItemToFind.nameSingular === objectMetadataNameSingular,
  );

  if (!objectMetadataItem) {
    throw new CustomError(
      doNotTranslate('Object metadata item not found'),
      'OBJECT_METADATA_ITEM_NOT_FOUND',
    );
  }

  const isToOneObject = relationType === RelationType.MANY_TO_ONE;
  const { objectMetadataItem: relationObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: relationObjectMetadataNameSingular,
    });

  const { updateOneRecord: updateOneRelationRecord } = useUpdateOneRecord();

  const dropdownInstanceId = `record-field-card-menu:${scopeInstanceId}:${relationFieldMetadataId}:${relationRecord.id}`;

  const dropdownId = getRecordFieldCardRelationPickerDropdownId({
    fieldDefinition,
    recordId,
    instanceId: scopeInstanceId,
  });
  const setSingleRecordPickerSelectedId = useSetAtomComponentState(
    singleRecordPickerSelectedIdComponentState,
    dropdownId,
  );

  const relationFieldMetadataItem = relationObjectMetadataItem.fields.find(
    ({ id }) => id === relationFieldMetadataId,
  );

  const relationFieldMetadataIsMorphRelation =
    relationFieldMetadataItem?.type === FieldMetadataType.MORPH_RELATION;

  const computedName = relationFieldMetadataItem
    ? computeMorphRelationGqlFieldName({
        fieldName: relationFieldMetadataItem.name,
        relationType: relationFieldMetadataItem.settings.relationType,
        targetObjectMetadataNameSingular: objectMetadataItem.nameSingular,
        targetObjectMetadataNamePlural: objectMetadataItem.namePlural,
      })
    : '';

  const updateOneRecordInput = relationFieldMetadataIsMorphRelation
    ? {
        [getForeignKeyNameFromRelationFieldName(computedName)]: null,
      }
    : {
        [getForeignKeyNameFromRelationFieldName(
          relationFieldMetadataItem?.name ?? '',
        )]: null,
      };

  const handleDetach = () => {
    if (!relationFieldMetadataItem?.name) {
      return;
    }

    if (isToOneObject) {
      onSubmit?.({ newValue: null });
    } else {
      updateOneRelationRecord({
        objectNameSingular: relationObjectMetadataNameSingular,
        idToUpdate: relationRecord.id,
        updateOneRecordInput,
      });
    }

    setSingleRecordPickerSelectedId(undefined);
  };

  const handleClick = () => onClick(relationRecord.id);

  const AnimatedIconChevronDown = useCallback<IconComponent>(
    (props) => (
      <MotionIconChevronDown
        className={props.className}
        color={props.color}
        size={props.size}
        stroke={props.stroke}
        initial={{ rotate: isExpanded ? 0 : -180 }}
        animate={{ rotate: isExpanded ? -180 : 0 }}
      />
    ),
    [isExpanded],
  );

  return (
    <>
      <RecordDetailRecordsListItemContainer data-testid="record-detail-records-list-item">
        {/* OMNIA-CUSTOM: name diff (old -> new, Accept/Undo) on the review page */}
        {isDefined(reconciliationDiffs) ? (
          <ReconciliationRelationNameDiffChip
            relationRecord={relationRecord}
            relationObjectMetadataNameSingular={
              relationObjectMetadataItem.nameSingular
            }
            relationFieldName={fieldDefinition.metadata.fieldName}
          />
        ) : (
          <RecordChip
            record={relationRecord}
            objectNameSingular={relationObjectMetadataItem.nameSingular}
          />
        )}
        <StyledClickableZone onClick={handleClick} data-testid="expand-button">
          <StyledHoverRevealedAction className="displayOnHover">
            <LightIconButton emphasis="subtle" aria-label={t`Expand relation`}>
              <AnimatedIconChevronDown />
            </LightIconButton>
          </StyledHoverRevealedAction>
        </StyledClickableZone>
        {!parentIsRecordFieldReadOnly && (
          <DropdownRoot dropdownId={dropdownInstanceId} type="menu">
            <StyledHoverRevealedAction className="displayOnHover">
              <Dropdown.Trigger
                render={
                  <LightIconButton
                    emphasis="subtle"
                    aria-label={t`More options`}
                  >
                    <IconDotsVertical />
                  </LightIconButton>
                }
              />
            </StyledHoverRevealedAction>
            <DropdownContent
              side="right"
              align="start"
              width={GenericDropdownContentWidth.Medium}
            >
              <Dropdown.Section>
                {/* OMNIA-CUSTOM: Delete intentionally omitted. Admins deleted the
                    related Agent or Lead while trying to detach it; deletion
                    happens from the object's own page. */}
                <Dropdown.ActionItem
                  startIcon={<IconUnlink />}
                  onClick={handleDetach}
                >{t`Detach`}</Dropdown.ActionItem>
              </Dropdown.Section>
            </DropdownContent>
          </DropdownRoot>
        )}
      </RecordDetailRecordsListItemContainer>
      <Collapsible.Root open={isExpanded}>
        <Collapsible.Panel containAnimation={false}>
          {/* OMNIA-CUSTOM: re-roots `<relation>.*` review diffs on the related record */}
          <ReconciliationRelationDiffsScope
            relationFieldName={fieldDefinition.metadata.fieldName}
          >
            <RecordFieldList
              instanceId={`${scopeInstanceId}-relation-${relationRecord.id}`}
              objectNameSingular={relationObjectMetadataNameSingular}
              objectRecordId={relationRecord.id}
            />
          </ReconciliationRelationDiffsScope>
        </Collapsible.Panel>
      </Collapsible.Root>
    </>
  );
};
