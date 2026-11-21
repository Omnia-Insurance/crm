import { useUpsertObjectPermissionInDraftRole } from '@/settings/roles/role-permissions/object-level-permissions/hooks/useUpsertObjectPermissionInDraftRole';
import {
  OverridableCheckbox,
  type OverridableCheckboxType,
} from '@/settings/roles/role-permissions/object-level-permissions/object-form/components/OverridableCheckbox';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { IconLayoutSidebar } from 'twenty-ui/icon';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';
import { type ObjectPermission } from '~/generated-metadata/graphql';

const StyledPermissionContent = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  white-space: nowrap;
`;

const StyledIconWrapper = styled.div<{ isHidden: boolean }>`
  align-items: center;
  background: ${({ isHidden }) =>
    isHidden ? themeCssVariables.color.orange3 : themeCssVariables.color.blue3};
  border: 1px solid
    ${({ isHidden }) =>
      isHidden
        ? themeCssVariables.color.orange7
        : themeCssVariables.color.blue7};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isHidden }) =>
    isHidden ? themeCssVariables.color.orange : themeCssVariables.color.blue};
  display: flex;
  height: ${themeCssVariables.spacing[4]};
  justify-content: center;
  width: ${themeCssVariables.spacing[4]};
`;

const StyledPermissionLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
`;

const StyledOverrideInfo = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  white-space: nowrap;
`;

type SettingsRolePermissionsObjectLevelShowInSidebarRowProps = {
  roleId: string;
  objectMetadataItemId: string;
  isEditable: boolean;
  settingsDraftRoleObjectPermissions: ObjectPermission | undefined;
};

// Sidebar visibility is not a record permission: write only showInSidebar, never through
// the shared object-permission change helper, which also grants read (contract C4).
export const SettingsRolePermissionsObjectLevelShowInSidebarRow = ({
  roleId,
  objectMetadataItemId,
  isEditable,
  settingsDraftRoleObjectPermissions,
}: SettingsRolePermissionsObjectLevelShowInSidebarRowProps) => {
  const { t } = useLingui();
  const theme = useTheme();

  const settingsDraftRole = useAtomFamilyStateValue(
    settingsDraftRoleFamilyState,
    roleId,
  );

  const { upsertObjectPermissionInDraftRole } =
    useUpsertObjectPermissionInDraftRole(roleId);

  const roleShowsAllObjects = settingsDraftRole.showAllObjectsInSidebar;
  const objectShowInSidebar = settingsDraftRoleObjectPermissions?.showInSidebar;

  const isChecked = objectShowInSidebar === true;
  const isHiddenForObject =
    roleShowsAllObjects && objectShowInSidebar === false;
  const isShownForObject = !roleShowsAllObjects && isChecked;

  const checkboxType: OverridableCheckboxType = isHiddenForObject
    ? 'override'
    : roleShowsAllObjects
      ? 'default'
      : 'no_cta';

  const upsertShowInSidebar = (showInSidebar: boolean | null) => {
    upsertObjectPermissionInDraftRole({
      ...settingsDraftRoleObjectPermissions,
      objectMetadataId: objectMetadataItemId,
      showInSidebar,
    });
  };

  const handleCheckboxChange = () => {
    if (!isEditable) {
      return;
    }

    if (checkboxType === 'default') {
      upsertShowInSidebar(false);
    } else if (checkboxType === 'override') {
      upsertShowInSidebar(null);
    } else {
      upsertShowInSidebar(!isChecked);
    }
  };

  return (
    <TableRow
      gridAutoColumns="1fr 48px"
      onClick={handleCheckboxChange}
      cursor={!isEditable ? 'default' : 'pointer'}
    >
      <TableCell gap={themeCssVariables.spacing[1]}>
        <StyledPermissionContent>
          <StyledIconWrapper isHidden={isHiddenForObject}>
            <IconLayoutSidebar size={theme.icon.size.sm} />
          </StyledIconWrapper>
          <StyledPermissionLabel>{t`Show in Sidebar`}</StyledPermissionLabel>
        </StyledPermissionContent>
        <StyledOverrideInfo>
          {isHiddenForObject ? (
            <>
              {' · '}
              {t`Hidden for this object`}
            </>
          ) : isShownForObject ? (
            <>
              {' · '}
              {t`Shown for this object`}
            </>
          ) : roleShowsAllObjects ? (
            <>
              {' · '}
              {t`Inherited from role`}
            </>
          ) : null}
        </StyledOverrideInfo>
      </TableCell>
      <TableCell
        align="right"
        padding={`0 ${themeCssVariables.spacing[1]} 0 ${themeCssVariables.spacing[2]}`}
        onClick={(event) => event.stopPropagation()}
      >
        <OverridableCheckbox
          onChange={handleCheckboxChange}
          disabled={!isEditable}
          type={checkboxType}
          checked={isChecked}
        />
      </TableCell>
    </TableRow>
  );
};
