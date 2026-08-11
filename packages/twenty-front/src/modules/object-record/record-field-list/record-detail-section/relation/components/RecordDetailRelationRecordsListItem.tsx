import { styled } from '@linaria/react';
import { motion } from 'framer-motion';
import { useCallback, useContext, useMemo, useRef, useState } from 'react';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { RecordChip } from '@/object-record/components/RecordChip';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { RecordFieldList } from '@/object-record/record-field-list/components/RecordFieldList';
// OMNIA-CUSTOM: reconciliation diffs context
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { useRecordFieldsScopeContextOrThrow } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { RecordDetailRecordsListItemContainer } from '@/object-record/record-field-list/record-detail-section/components/RecordDetailRecordsListItemContainer';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { FieldInputEventContext } from '@/object-record/record-field/ui/contexts/FieldInputEventContext';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { singleRecordPickerSelectedIdComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSelectedIdComponentState';
import { getRecordFieldCardRelationPickerDropdownId } from '@/object-record/record-show/utils/getRecordFieldCardRelationPickerDropdownId';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { getForeignKeyNameFromRelationFieldName } from '@/object-record/utils/getForeignKeyNameFromRelationFieldName';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { isDropdownOpenComponentState } from '@/ui/layout/dropdown/states/isDropdownOpenComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { t } from '@lingui/core/macro';
import {
  computeMorphRelationGqlFieldName,
  CustomError,
} from 'twenty-shared/utils';
import {
  IconChevronDown,
  IconDotsVertical,
  IconUnlink,
  type IconComponent,
} from 'twenty-ui/icon';
import { LightIconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { MenuItem } from 'twenty-ui/navigation';
import { AnimatedEaseInOut } from 'twenty-ui/layout';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

const StyledClickableZone = styled.div`
  align-items: center;
  cursor: pointer;
  display: flex;
  flex: 1 0 auto;
  height: 100%;
  justify-content: flex-end;
`;

const MotionIconChevronDown = motion.create(IconChevronDown);

// OMNIA-CUSTOM: Diff highlight wrapper for the relation chip row
const StyledDiffChipRow = styled.div<{ accepted: boolean }>`
  align-items: center;
  background: ${({ accepted }) =>
    accepted
      ? themeCssVariables.color.transparent.red2
      : themeCssVariables.color.transparent.green2};
  border-left: 2px solid
    ${({ accepted }) =>
      accepted ? themeCssVariables.color.red : themeCssVariables.color.green};
  border-radius: 0 ${themeCssVariables.border.radius.sm}
    ${themeCssVariables.border.radius.sm} 0;
  display: flex;
  flex: 1;
  gap: ${themeCssVariables.spacing[2]};
  margin: -${themeCssVariables.spacing[1]} 0;
  min-width: 0;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledDiffAnnotation = styled.span`
  align-items: center;
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  white-space: nowrap;
`;

const StyledDiffOldName = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  text-decoration: line-through;
`;

const StyledDiffArrow = styled.span`
  color: ${themeCssVariables.font.color.light};
`;

const StyledDiffNewName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledDiffBtn = styled.button<{ isAccepted: boolean }>`
  background: ${({ isAccepted }) =>
    isAccepted ? themeCssVariables.color.red : themeCssVariables.color.green};
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  height: 20px;
  opacity: 0.75;
  padding: 0 ${themeCssVariables.spacing[2]};
  &:hover {
    opacity: 1;
  }
`;

type RecordDetailRelationRecordsListItemProps = {
  isExpanded: boolean;
  onClick: (relationRecordId: string) => void;
  relationRecord: ObjectRecord;
  relationObjectMetadataNameSingular: string;
  relationFieldMetadataId: string;
  showRequiredIndicator?: boolean;
};

export const RecordDetailRelationRecordsListItem = ({
  isExpanded,
  onClick,
  relationRecord,
  relationObjectMetadataNameSingular,
  relationFieldMetadataId,
  showRequiredIndicator = false,
}: RecordDetailRelationRecordsListItemProps) => {
  const { scopeInstanceId } = useRecordFieldsScopeContextOrThrow();
  const {
    fieldDefinition,
    recordId,
    isRecordFieldReadOnly: parentIsRecordFieldReadOnly,
  } = useContext(FieldContext);

  const { onSubmit } = useContext(FieldInputEventContext);

  // OMNIA-CUSTOM: Get reconciliation diffs for this relation's fields
  const reconDiffs = useContext(ReconciliationDiffsContext);
  const relationName = fieldDefinition?.metadata?.fieldName;
  const relationFieldDiffs = useMemo(() => {
    if (!reconDiffs?.fieldDiffs || !relationName) return undefined;
    const relDiffs = reconDiffs.fieldDiffs.filter(
      (d) =>
        d.crmField?.startsWith(`${relationName}.`) &&
        d.bobValue !== null &&
        d.bobValue !== d.crmValue,
    );
    if (relDiffs.length === 0) return undefined;
    return relDiffs.map((d) => ({
      ...d,
      crmField: d.crmField?.slice(relationName.length + 1) ?? d.crmField,
    }));
  }, [reconDiffs, relationName]);

  // OMNIA-CUSTOM: Extract this relation's name diffs (composite or single).
  // "Name-shaped" covers both composite (lead.name.firstName/lastName) and
  // single TEXT name fields (agent.name). Non-name diffs surface only on
  // the expanded RecordFieldList — the chip is name-focused.
  const compositeNameDiffs = useMemo(() => {
    if (!relationFieldDiffs) return [];
    return relationFieldDiffs.filter((d) => d.crmField?.startsWith('name.'));
  }, [relationFieldDiffs]);

  const singleNameDiff = useMemo(() => {
    if (!relationFieldDiffs) return null;
    return relationFieldDiffs.find((d) => d.crmField === 'name') ?? null;
  }, [relationFieldDiffs]);

  const hasNameDiff = compositeNameDiffs.length > 0 || singleNameDiff !== null;

  type NameProposal =
    | {
        kind: 'composite';
        oldFirst: string;
        oldLast: string;
        newFirst: string;
        newLast: string;
      }
    | { kind: 'single'; oldValue: string; newValue: string };

  const proposedName = useMemo<NameProposal | null>(() => {
    const recordObj = relationRecord as Record<string, unknown>;

    if (compositeNameDiffs.length > 0) {
      const first = compositeNameDiffs.find(
        (d) => d.crmField === 'name.firstName',
      );
      const last = compositeNameDiffs.find(
        (d) => d.crmField === 'name.lastName',
      );
      const nameVal =
        recordObj.name && typeof recordObj.name === 'object'
          ? (recordObj.name as Record<string, string>)
          : null;
      const currentFirst = nameVal?.firstName ?? null;
      const currentLast = nameVal?.lastName ?? null;
      return {
        kind: 'composite',
        oldFirst: first?.crmValue ?? currentFirst ?? '',
        oldLast: last?.crmValue ?? currentLast ?? '',
        newFirst: first?.bobValue ?? currentFirst ?? '',
        newLast: last?.bobValue ?? currentLast ?? '',
      };
    }

    if (singleNameDiff) {
      const currentValue =
        typeof recordObj.name === 'string' ? recordObj.name : '';
      return {
        kind: 'single',
        oldValue: singleNameDiff.crmValue ?? currentValue,
        newValue: singleNameDiff.bobValue ?? currentValue,
      };
    }

    return null;
  }, [compositeNameDiffs, singleNameDiff, relationRecord]);

  // Check if name has already been accepted (current value matches proposed)
  const nameAccepted = useMemo(() => {
    if (!proposedName) return false;
    const recordObj = relationRecord as Record<string, unknown>;

    if (proposedName.kind === 'composite') {
      const name = recordObj.name as Record<string, string> | null;
      if (!name) return false;
      return (
        name.firstName === proposedName.newFirst &&
        name.lastName === proposedName.newLast
      );
    }

    return recordObj.name === proposedName.newValue;
  }, [proposedName, relationRecord]);

  const { updateOneRecord: updateRelationRecordForName } = useUpdateOneRecord();

  const handleAcceptName = useCallback(() => {
    if (!proposedName) return;

    const newName =
      proposedName.kind === 'composite'
        ? {
            name: {
              firstName: nameAccepted
                ? proposedName.oldFirst
                : proposedName.newFirst,
              lastName: nameAccepted
                ? proposedName.oldLast
                : proposedName.newLast,
            },
          }
        : {
            name: nameAccepted ? proposedName.oldValue : proposedName.newValue,
          };

    updateRelationRecordForName({
      objectNameSingular: relationObjectMetadataNameSingular,
      idToUpdate: relationRecord.id,
      updateOneRecordInput: newName,
    });
  }, [
    proposedName,
    nameAccepted,
    relationRecord.id,
    relationObjectMetadataNameSingular,
    updateRelationRecordForName,
  ]);

  const { relationType, objectMetadataNameSingular } =
    fieldDefinition.metadata as FieldRelationMetadata;

  const { objectMetadataItems } = useObjectMetadataItems();
  const objectMetadataItem = objectMetadataItems.find(
    (objectMetadataItemToFind) =>
      objectMetadataItemToFind.nameSingular === objectMetadataNameSingular,
  );

  if (!objectMetadataItem) {
    throw new CustomError(
      'Object metadata item not found',
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

  const { closeDropdown } = useCloseDropdown();
  const isDropdownOpen = useAtomComponentStateValue(
    isDropdownOpenComponentState,
    dropdownInstanceId,
  );

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
    closeDropdown(dropdownInstanceId);

    if (!relationFieldMetadataItem?.name) return;

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
      <RecordDetailRecordsListItemContainer
        isDropdownOpen={isDropdownOpen}
        data-testid="record-detail-records-list-item"
      >
        {hasNameDiff && proposedName ? (
          <StyledDiffChipRow accepted={nameAccepted}>
            <RecordChip
              record={relationRecord}
              objectNameSingular={relationObjectMetadataItem.nameSingular}
            />
            <StyledDiffAnnotation>
              <StyledDiffArrow>→</StyledDiffArrow>
              <StyledDiffNewName>
                {proposedName.kind === 'composite'
                  ? nameAccepted
                    ? `${proposedName.oldFirst} ${proposedName.oldLast}`
                    : `${proposedName.newFirst} ${proposedName.newLast}`
                  : nameAccepted
                    ? proposedName.oldValue
                    : proposedName.newValue}
              </StyledDiffNewName>
            </StyledDiffAnnotation>
            <StyledDiffBtn
              isAccepted={nameAccepted}
              onClick={(e) => {
                e.stopPropagation();
                handleAcceptName();
              }}
            >
              {nameAccepted ? 'Undo' : 'Accept'}
            </StyledDiffBtn>
          </StyledDiffChipRow>
        ) : (
          <RecordChip
            record={relationRecord}
            objectNameSingular={relationObjectMetadataItem.nameSingular}
          />
        )}
        <StyledClickableZone onClick={handleClick} data-testid="expand-button">
          <LightIconButton
            className="displayOnHover"
            Icon={AnimatedIconChevronDown}
            accent="tertiary"
          />
        </StyledClickableZone>
        {!parentIsRecordFieldReadOnly && (
          <Dropdown
            dropdownId={dropdownInstanceId}
            dropdownPlacement="right-start"
            clickableComponent={
              <LightIconButton
                className="displayOnHover"
                Icon={IconDotsVertical}
                accent="tertiary"
              />
            }
            dropdownComponents={
              <DropdownContent>
                <DropdownMenuItemsContainer>
                  {/*
                    OMNIA-CUSTOM: Delete intentionally omitted. Detaching a
                    relation from a record's detail panel must never delete the
                    related record itself — admins were accidentally deleting
                    Agents/Leads/etc. from here. Deletion happens from the
                    object's own page.
                  */}
                  <MenuItem
                    LeftIcon={IconUnlink}
                    text={t`Detach`}
                    onClick={handleDetach}
                  />
                </DropdownMenuItemsContainer>
              </DropdownContent>
            }
          />
        )}
      </RecordDetailRecordsListItemContainer>
      <AnimatedEaseInOut isOpen={isExpanded}>
        <RecordFieldList
          instanceId={`${scopeInstanceId}-relation-${relationRecord.id}`}
          objectNameSingular={relationObjectMetadataNameSingular}
          objectRecordId={relationRecord.id}
          showDuplicatesSection={false}
          showRelationSections={false}
          excludeCreatedAtAndUpdatedAt={true}
          excludeFieldMetadataIds={[relationFieldMetadataId]}
          showRequiredIndicator={showRequiredIndicator}
          fieldDiffs={relationFieldDiffs}
        />
      </AnimatedEaseInOut>
    </>
  );
};
