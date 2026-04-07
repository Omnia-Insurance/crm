import { getRoleWithUpsertedObjectPermission } from '@/settings/roles/role-permissions/object-level-permissions/utils/getRoleWithUpsertedObjectPermission';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { useSetAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useSetAtomFamilyState';
import { type OmniaObjectPermission } from '@/settings/roles/types/OmniaRoleExtensions';

export const useUpsertObjectPermissionInDraftRole = (roleId: string) => {
  const setSettingsDraftRole = useSetAtomFamilyState(
    settingsDraftRoleFamilyState,
    roleId,
  );

  const upsertObjectPermissionInDraftRole = (
    objectPermissionToUpsert: OmniaObjectPermission,
  ) => {
    setSettingsDraftRole((currentSettingsDraftRole) =>
      getRoleWithUpsertedObjectPermission(
        currentSettingsDraftRole,
        objectPermissionToUpsert,
      ),
    );
  };

  return {
    upsertObjectPermissionInDraftRole,
  };
};
