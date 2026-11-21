import { useUpsertObjectPermissionInDraftRole } from '@/settings/roles/role-permissions/object-level-permissions/hooks/useUpsertObjectPermissionInDraftRole';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { Select } from '@/ui/input/components/Select';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { IconClockHour8 } from 'twenty-ui/icon';
import { type SelectOption } from 'twenty-ui/primitives/input';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';
import { type ObjectPermission } from '~/generated-metadata/graphql';

const StyledTableRow = styled(TableRow)`
  align-items: center;
  display: flex;
`;

const StyledPermissionCell = styled(TableCell)`
  align-items: center;
  display: flex;
  flex: 1;
  gap: ${themeCssVariables.spacing[1]};
  padding-left: ${themeCssVariables.spacing[2]};
`;

const StyledPermissionContent = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledPermissionLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
`;

const StyledOverrideInfo = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSelectCell = styled(TableCell)`
  align-items: center;
  display: flex;
  justify-content: flex-end;
  padding-right: ${themeCssVariables.spacing[1]};
`;

const StyledIconWrapper = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.blue3};
  border: 1px solid ${themeCssVariables.color.blue7};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  height: ${themeCssVariables.spacing[4]};
  justify-content: center;
  width: ${themeCssVariables.spacing[4]};
`;

const StyledIcon = styled.div`
  align-items: center;
  color: ${themeCssVariables.color.blue};
  display: flex;
  justify-content: center;
`;

type SettingsRolePermissionsObjectLevelEditWindowRowProps = {
  roleId: string;
  objectMetadataItemId: string;
  isEditable: boolean;
  settingsDraftRoleObjectPermissions: ObjectPermission | undefined;
};

export const SettingsRolePermissionsObjectLevelEditWindowRow = ({
  roleId,
  objectMetadataItemId,
  isEditable,
  settingsDraftRoleObjectPermissions,
}: SettingsRolePermissionsObjectLevelEditWindowRowProps) => {
  const { t } = useLingui();
  const theme = useTheme();

  const editWindowOptions: SelectOption<number | null>[] = [
    { value: null, label: t`No limit` },
    { value: 5, label: t`5 minutes` },
    { value: 10, label: t`10 minutes` },
    { value: 15, label: t`15 minutes` },
    { value: 60, label: t`1 hour` },
    { value: 240, label: t`4 hours` },
    { value: 720, label: t`12 hours` },
    { value: 1440, label: t`24 hours` },
    { value: 2880, label: t`48 hours` },
    { value: 10080, label: t`7 days` },
  ];

  const settingsDraftRole = useAtomFamilyStateValue(
    settingsDraftRoleFamilyState,
    roleId,
  );

  const { upsertObjectPermissionInDraftRole } =
    useUpsertObjectPermissionInDraftRole(roleId);

  const roleDefault = settingsDraftRole.editWindowMinutes ?? null;

  const objectEditWindowMinutes =
    settingsDraftRoleObjectPermissions?.editWindowMinutes;

  const isInherited = !isDefined(objectEditWindowMinutes);

  const effectiveValue = isInherited ? roleDefault : objectEditWindowMinutes;

  const roleDefaultLabel =
    editWindowOptions.find((option) => option.value === roleDefault)?.label ??
    t`${roleDefault} minutes`;

  const handleChange = (value: number | null) => {
    upsertObjectPermissionInDraftRole({
      ...settingsDraftRoleObjectPermissions,
      objectMetadataId: objectMetadataItemId,
      editWindowMinutes: value,
    });
  };

  return (
    <StyledTableRow>
      <StyledPermissionCell>
        <StyledPermissionContent>
          <StyledIconWrapper>
            <StyledIcon>
              <IconClockHour8 size={theme.icon.size.sm} />
            </StyledIcon>
          </StyledIconWrapper>
          <StyledPermissionLabel>{t`Edit window`}</StyledPermissionLabel>
        </StyledPermissionContent>
        <StyledOverrideInfo>
          {isInherited && isDefined(roleDefault) ? (
            <>
              {' · '}
              {t`Inherited from role (${roleDefaultLabel})`}
            </>
          ) : null}
        </StyledOverrideInfo>
      </StyledPermissionCell>
      <StyledSelectCell onClick={(event) => event.stopPropagation()}>
        <Select
          dropdownId={`edit-window-${objectMetadataItemId}`}
          options={editWindowOptions}
          value={effectiveValue}
          onChange={handleChange}
          disabled={!isEditable}
          selectSizeVariant="small"
        />
      </StyledSelectCell>
    </StyledTableRow>
  );
};
