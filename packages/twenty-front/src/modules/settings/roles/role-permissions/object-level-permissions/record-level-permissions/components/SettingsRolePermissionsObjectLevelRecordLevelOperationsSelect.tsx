/* @license Enterprise */

import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { PermissionIcon } from '@/settings/roles/role-permissions/objects-permissions/components/PermissionIcon';
import { getRoleWithMatchingRecordsOperation } from '@/settings/roles/role/utils/getRoleWithMatchingRecordsOperation';
import { resolveObjectRecordsAccessForFilteredObject } from '@/settings/roles/role/utils/resolveObjectRecordsAccessForFilteredObject';
import { resolveSettingsRoleObjectRecordsGrant } from '@/settings/roles/role/utils/resolveSettingsRoleObjectRecordsGrant';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { Select } from '@/ui/input/components/Select';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useSetAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useSetAtomFamilyState';

const StyledTable = styled.div`
  margin-top: ${themeCssVariables.spacing[4]};
`;

const StyledPermissionContent = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  white-space: nowrap;
`;

const StyledPermissionLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
`;

const StyledCaption = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  white-space: nowrap;
`;

const OPERATION_COLUMNS = '1fr 180px';

type SettingsRolePermissionsObjectLevelRecordLevelOperationsSelectProps = {
  roleId: string;
  objectMetadataItem: EnrichedObjectMetadataItem;
};

// Per operation of a filtered object: All records keeps the object-level grant, Matching records goes through the rule
export const SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect = ({
  roleId,
  objectMetadataItem,
}: SettingsRolePermissionsObjectLevelRecordLevelOperationsSelectProps) => {
  const { t } = useLingui();

  const settingsDraftRole = useAtomFamilyStateValue(
    settingsDraftRoleFamilyState,
    roleId,
  );
  const setSettingsDraftRole = useSetAtomFamilyState(
    settingsDraftRoleFamilyState,
    roleId,
  );

  const isFilteredObject = (
    settingsDraftRole.rowLevelPermissionPredicates ?? []
  ).some((predicate) => predicate.objectMetadataId === objectMetadataItem.id);

  if (!isFilteredObject) {
    return null;
  }

  const operationGrants = resolveSettingsRoleObjectRecordsGrant({
    role: settingsDraftRole,
    objectMetadataId: objectMetadataItem.id,
  });
  const { rowLevelPermissionRuleGrant } =
    resolveObjectRecordsAccessForFilteredObject({
      role: settingsDraftRole,
      objectMetadataId: objectMetadataItem.id,
    });

  const canReadAllRecords =
    operationGrants.canReadRecords &&
    !rowLevelPermissionRuleGrant.canReadRecords;

  const objectLabelPlural = objectMetadataItem.labelPlural;

  const operations = [
    {
      ruleOperationKey: 'canReadRecords',
      permissionKey: 'canReadObjectRecords',
      label: t`See ${objectLabelPlural}`,
      isWriteOperation: false,
    },
    {
      ruleOperationKey: 'canUpdateRecords',
      permissionKey: 'canUpdateObjectRecords',
      label: t`Edit ${objectLabelPlural}`,
      isWriteOperation: true,
    },
    {
      ruleOperationKey: 'canSoftDeleteRecords',
      permissionKey: 'canSoftDeleteObjectRecords',
      label: t`Delete ${objectLabelPlural}`,
      isWriteOperation: true,
    },
    {
      ruleOperationKey: 'canDestroyRecords',
      permissionKey: 'canDestroyObjectRecords',
      label: t`Destroy ${objectLabelPlural}`,
      isWriteOperation: true,
    },
  ] as const;

  const grantedOperations = operations.filter(
    ({ ruleOperationKey }) => operationGrants[ruleOperationKey],
  );

  if (grantedOperations.length === 0) {
    return null;
  }

  const allRecordsOption = { label: t`All records`, value: false };
  const matchingRecordsOption = { label: t`Matching records`, value: true };

  const handleOperationChange = (
    ruleOperationKey: (typeof operations)[number]['ruleOperationKey'],
    isMatchingRecords: boolean,
  ) => {
    setSettingsDraftRole((currentSettingsDraftRole) =>
      getRoleWithMatchingRecordsOperation({
        role: currentSettingsDraftRole,
        objectMetadataId: objectMetadataItem.id,
        ruleOperationKey,
        isMatchingRecords,
      }),
    );
  };

  return (
    <StyledTable>
      <TableRow gridAutoColumns={OPERATION_COLUMNS}>
        <TableHeader>{t`Action`}</TableHeader>
        <TableHeader align="right">{t`Applies to`}</TableHeader>
      </TableRow>
      {grantedOperations.map(
        ({ ruleOperationKey, permissionKey, label, isWriteOperation }) => {
          // The API rejects an object-level write without an object-level read
          const isLockedToMatchingRecords =
            isWriteOperation && !canReadAllRecords;

          return (
            <TableRow
              key={ruleOperationKey}
              gridAutoColumns={OPERATION_COLUMNS}
            >
              <TableCell gap={themeCssVariables.spacing[1]}>
                <StyledPermissionContent>
                  <PermissionIcon permission={permissionKey} state="granted" />
                  <StyledPermissionLabel>{label}</StyledPermissionLabel>
                </StyledPermissionContent>
                {isLockedToMatchingRecords && (
                  <StyledCaption>
                    {' · '}
                    {t`Follows See`}
                  </StyledCaption>
                )}
              </TableCell>
              <TableCell
                align="right"
                padding={`0 ${themeCssVariables.spacing[1]} 0 ${themeCssVariables.spacing[2]}`}
              >
                <Select<boolean>
                  dropdownId={`record-level-operation-${roleId}-${objectMetadataItem.id}-${ruleOperationKey}`}
                  selectSizeVariant="small"
                  options={
                    isLockedToMatchingRecords
                      ? [matchingRecordsOption]
                      : [allRecordsOption, matchingRecordsOption]
                  }
                  value={rowLevelPermissionRuleGrant[ruleOperationKey]}
                  onChange={(isMatchingRecords) =>
                    handleOperationChange(ruleOperationKey, isMatchingRecords)
                  }
                  disabled={!settingsDraftRole.isEditable}
                />
              </TableCell>
            </TableRow>
          );
        },
      )}
    </StyledTable>
  );
};
