import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type MouseEvent, useContext, useMemo } from 'react';
import {
  isDefined,
  isNonEmptyString,
  isPlainObject,
} from 'twenty-shared/utils';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { RecordChip } from '@/object-record/components/RecordChip';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useIsRecordFieldReadOnly } from '@/object-record/read-only/hooks/useIsRecordFieldReadOnly';
import { useRecordRestrictedFieldNames } from '@/object-record/record-store/hooks/useRecordRestrictedFieldNames';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { getRelationScopedFieldDiffs } from '@/reconciliation/utils/getRelationScopedFieldDiffs';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';

const StyledDiffChipRow = styled.div<{ isAccepted: boolean }>`
  align-items: center;
  background: ${({ isAccepted }) =>
    isAccepted
      ? themeCssVariables.color.transparent.red2
      : themeCssVariables.color.transparent.green2};
  border-left: 2px solid
    ${({ isAccepted }) =>
      isAccepted ? themeCssVariables.color.red : themeCssVariables.color.green};
  border-radius: 0 ${themeCssVariables.border.radius.sm}
    ${themeCssVariables.border.radius.sm} 0;
  display: flex;
  flex: 1;
  gap: ${themeCssVariables.spacing[2]};
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

const StyledDiffArrow = styled.span`
  color: ${themeCssVariables.font.color.light};
`;

const StyledDiffName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

type RelationNameProposal =
  | {
      kind: 'fullName';
      oldFirstName: string;
      oldLastName: string;
      newFirstName: string;
      newLastName: string;
    }
  | { kind: 'text'; oldName: string; newName: string };

const getCurrentFullName = (currentName: unknown) => {
  const fullName = isPlainObject(currentName) ? currentName : {};

  return {
    firstName: isNonEmptyString(fullName.firstName) ? fullName.firstName : '',
    lastName: isNonEmptyString(fullName.lastName) ? fullName.lastName : '',
  };
};

// Person-style relations diff `name.firstName` / `name.lastName`; TEXT-named
// ones (agent) diff `name`. Other diffs show in the expanded field list.
const getRelationNameProposal = (
  relationFieldDiffs: FieldDiff[],
  currentName: unknown,
): RelationNameProposal | null => {
  const firstNameDiff = relationFieldDiffs.find(
    ({ crmField }) => crmField === 'name.firstName',
  );
  const lastNameDiff = relationFieldDiffs.find(
    ({ crmField }) => crmField === 'name.lastName',
  );

  if (isDefined(firstNameDiff) || isDefined(lastNameDiff)) {
    const currentFullName = getCurrentFullName(currentName);

    return {
      kind: 'fullName',
      oldFirstName: isDefined(firstNameDiff)
        ? (firstNameDiff.crmValue ?? '')
        : currentFullName.firstName,
      oldLastName: isDefined(lastNameDiff)
        ? (lastNameDiff.crmValue ?? '')
        : currentFullName.lastName,
      newFirstName: isDefined(firstNameDiff)
        ? (firstNameDiff.bobValue ?? '')
        : currentFullName.firstName,
      newLastName: isDefined(lastNameDiff)
        ? (lastNameDiff.bobValue ?? '')
        : currentFullName.lastName,
    };
  }

  const nameDiff = relationFieldDiffs.find(
    ({ crmField }) => crmField === 'name',
  );

  if (!isDefined(nameDiff)) {
    return null;
  }

  return {
    kind: 'text',
    oldName: nameDiff.crmValue ?? '',
    newName: nameDiff.bobValue ?? '',
  };
};

type ReconciliationRelationNameDiffChipProps = {
  relationRecord: ObjectRecord;
  relationObjectMetadataNameSingular: string;
  relationFieldName: string;
};

export const ReconciliationRelationNameDiffChip = ({
  relationRecord,
  relationObjectMetadataNameSingular,
  relationFieldName,
}: ReconciliationRelationNameDiffChipProps) => {
  const { t } = useLingui();

  const reconciliationDiffs = useContext(ReconciliationDiffsContext);

  const { objectMetadataItem: relationObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: relationObjectMetadataNameSingular,
    });

  // The mutation refreshes the record store, not necessarily the parent's copy.
  const recordStore = useAtomFamilyStateValue(
    recordStoreFamilyState,
    relationRecord.id,
  );

  const currentRelationRecord = useMemo(
    () =>
      isDefined(recordStore)
        ? { ...relationRecord, ...recordStore }
        : relationRecord,
    [relationRecord, recordStore],
  );

  const restrictedFieldNames = useRecordRestrictedFieldNames(relationRecord.id);

  const nameFieldMetadataItem = relationObjectMetadataItem.readableFields.find(
    ({ name }) => name === 'name',
  );

  const isNameFieldReadOnly = useIsRecordFieldReadOnly({
    fieldMetadataId: nameFieldMetadataItem?.id ?? '',
    objectMetadataId: relationObjectMetadataItem.id,
    recordId: relationRecord.id,
  });

  const { updateOneRecord } = useUpdateOneRecord();

  const nameProposal = useMemo(
    () =>
      isDefined(reconciliationDiffs)
        ? getRelationNameProposal(
            getRelationScopedFieldDiffs({
              fieldDiffs: reconciliationDiffs.fieldDiffs,
              relationFieldName,
            }),
            currentRelationRecord.name,
          )
        : null,
    [reconciliationDiffs, relationFieldName, currentRelationRecord.name],
  );

  // A reader who cannot see the name must not get it from the diff either.
  const isNameVisible =
    isDefined(nameFieldMetadataItem) && !restrictedFieldNames.includes('name');

  if (!isDefined(nameProposal) || !isNameVisible) {
    return (
      <RecordChip
        record={currentRelationRecord}
        objectNameSingular={relationObjectMetadataNameSingular}
      />
    );
  }

  const currentFullName = getCurrentFullName(currentRelationRecord.name);

  const isAccepted =
    nameProposal.kind === 'fullName'
      ? currentFullName.firstName === nameProposal.newFirstName &&
        currentFullName.lastName === nameProposal.newLastName
      : currentRelationRecord.name === nameProposal.newName;

  const displayedName =
    nameProposal.kind === 'fullName'
      ? [
          isAccepted ? nameProposal.oldFirstName : nameProposal.newFirstName,
          isAccepted ? nameProposal.oldLastName : nameProposal.newLastName,
        ]
          .filter(isNonEmptyString)
          .join(' ')
      : isAccepted
        ? nameProposal.oldName
        : nameProposal.newName;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();

    updateOneRecord({
      objectNameSingular: relationObjectMetadataNameSingular,
      idToUpdate: relationRecord.id,
      updateOneRecordInput:
        nameProposal.kind === 'fullName'
          ? {
              name: {
                firstName: isAccepted
                  ? nameProposal.oldFirstName
                  : nameProposal.newFirstName,
                lastName: isAccepted
                  ? nameProposal.oldLastName
                  : nameProposal.newLastName,
              },
            }
          : {
              name: isAccepted ? nameProposal.oldName : nameProposal.newName,
            },
    });
  };

  return (
    <StyledDiffChipRow isAccepted={isAccepted}>
      <RecordChip
        record={currentRelationRecord}
        objectNameSingular={relationObjectMetadataNameSingular}
      />
      <StyledDiffAnnotation>
        <StyledDiffArrow>→</StyledDiffArrow>
        <StyledDiffName>
          {isNonEmptyString(displayedName) ? displayedName : t`Empty`}
        </StyledDiffName>
      </StyledDiffAnnotation>
      <Button
        size="sm"
        variant={isAccepted ? 'outline' : 'solid'}
        color={isAccepted ? 'danger' : 'success'}
        disabled={isNameFieldReadOnly}
        onClick={handleClick}
      >
        {isAccepted ? t`Undo` : t`Accept`}
      </Button>
    </StyledDiffChipRow>
  );
};
