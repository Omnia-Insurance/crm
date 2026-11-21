// OMNIA-CUSTOM: per-operation choice of filtered objects (contract C1)
import { getMatchingRecordsOperations } from '@/settings/roles/role/utils/getMatchingRecordsOperations';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { isDefined } from 'twenty-shared/utils';
import { getDirtyFields } from '~/utils/getDirtyFields';
import { isDeeplyEqual } from '~/utils/isDeeplyEqual';

export const getRoleDirtyFields = (
  draftRole: RoleWithPartialMembers,
  persistedRole: RoleWithPartialMembers | undefined,
): Partial<RoleWithPartialMembers> => {
  const allDirtyFields = getDirtyFields(draftRole, persistedRole);
  // OMNIA-CUSTOM: rules only hold the All records / Matching records choice of filtered objects (contract C1)
  const {
    rowLevelPermissionRules: _rowLevelPermissionRules,
    ...dirtyFieldsWithoutRules
  } = allDirtyFields;
  const dirtyFields =
    isDefined(persistedRole) &&
    isDeeplyEqual(
      getMatchingRecordsOperations(draftRole),
      getMatchingRecordsOperations(persistedRole),
    )
      ? dirtyFieldsWithoutRules
      : allDirtyFields;

  if (
    isDefined(persistedRole) &&
    isDeeplyEqual(
      draftRole.permissionFlags?.map(({ flag }) => flag).sort() ?? [],
      persistedRole.permissionFlags?.map(({ flag }) => flag).sort() ?? [],
    )
  ) {
    const { permissionFlags: _permissionFlags, ...otherDirtyFields } =
      dirtyFields;

    return otherDirtyFields;
  }

  return dirtyFields;
};
