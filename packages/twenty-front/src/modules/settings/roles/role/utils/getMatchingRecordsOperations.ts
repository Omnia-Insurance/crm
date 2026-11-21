import { resolveObjectRecordsAccessForFilteredObject } from '@/settings/roles/role/utils/resolveObjectRecordsAccessForFilteredObject';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';

// The rule grants a save would send: blind to server-assigned rule ids and to the choice of an operation that is off
export const getMatchingRecordsOperations = (role: RoleWithPartialMembers) =>
  [
    ...new Set(
      (role.rowLevelPermissionPredicates ?? []).map(
        ({ objectMetadataId }) => objectMetadataId,
      ),
    ),
  ]
    .sort()
    .map((objectMetadataId) => ({
      objectMetadataId,
      ...resolveObjectRecordsAccessForFilteredObject({ role, objectMetadataId })
        .rowLevelPermissionRuleGrant,
    }));
