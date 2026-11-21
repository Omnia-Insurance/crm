import { resolveSettingsRoleObjectRecordsGrant } from '@/settings/roles/role/utils/resolveSettingsRoleObjectRecordsGrant';
import { isDefined } from 'twenty-shared/utils';
import {
  type ObjectPermissionInput,
  type Role,
  type RowLevelPermissionRule,
} from '~/generated-metadata/graphql';

type RuleOperationKey =
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords';

type FilteredObjectRecordsAccess = {
  objectRecordsGrant: Required<
    Pick<
      ObjectPermissionInput,
      | 'canReadObjectRecords'
      | 'canUpdateObjectRecords'
      | 'canSoftDeleteObjectRecords'
      | 'canDestroyObjectRecords'
    >
  >;
  rowLevelPermissionRuleGrant: Pick<
    RowLevelPermissionRule,
    | 'canReadRecords'
    | 'canCreateRecords'
    | 'canUpdateRecords'
    | 'canSoftDeleteRecords'
    | 'canDestroyRecords'
  >;
};

// In the draft, a rule grant marks an operation restricted to matching records.
// An all-records object grant bypasses rules, so a matching operation is always an explicit object-level false.
export const resolveObjectRecordsAccessForFilteredObject = ({
  role,
  objectMetadataId,
}: {
  role: Pick<
    Role,
    | 'objectPermissions'
    | 'rowLevelPermissionRules'
    | 'canReadAllObjectRecords'
    | 'canUpdateAllObjectRecords'
    | 'canSoftDeleteAllObjectRecords'
    | 'canDestroyAllObjectRecords'
  >;
  objectMetadataId: string;
}): FilteredObjectRecordsAccess => {
  const operationGrants = resolveSettingsRoleObjectRecordsGrant({
    role,
    objectMetadataId,
  });
  const objectPermission = role.objectPermissions?.find(
    (rolePermission) => rolePermission.objectMetadataId === objectMetadataId,
  );
  const draftRule = role.rowLevelPermissionRules?.find(
    (rule) => rule.objectMetadataId === objectMetadataId,
  );

  // A filter without a draft rule is new, and a new filter restricts every operation
  const isRestrictedToMatchingRecords = (ruleOperationKey: RuleOperationKey) =>
    !isDefined(draftRule) || draftRule[ruleOperationKey] === true;

  const isReadRestricted = isRestrictedToMatchingRecords('canReadRecords');
  const canReadAllRecords = operationGrants.canReadRecords && !isReadRestricted;

  // The API rejects an object-level write without an object-level read
  const isWriteRestricted = (ruleOperationKey: RuleOperationKey) =>
    !canReadAllRecords || isRestrictedToMatchingRecords(ruleOperationKey);

  const isUpdateRestricted = isWriteRestricted('canUpdateRecords');
  const isSoftDeleteRestricted = isWriteRestricted('canSoftDeleteRecords');
  const isDestroyRestricted = isWriteRestricted('canDestroyRecords');

  return {
    objectRecordsGrant: {
      canReadObjectRecords: isReadRestricted
        ? false
        : (objectPermission?.canReadObjectRecords ?? null),
      canUpdateObjectRecords: isUpdateRestricted
        ? false
        : (objectPermission?.canUpdateObjectRecords ?? null),
      canSoftDeleteObjectRecords: isSoftDeleteRestricted
        ? false
        : (objectPermission?.canSoftDeleteObjectRecords ?? null),
      canDestroyObjectRecords: isDestroyRestricted
        ? false
        : (objectPermission?.canDestroyObjectRecords ?? null),
    },
    rowLevelPermissionRuleGrant: {
      canReadRecords: operationGrants.canReadRecords && isReadRestricted,
      // Create follows update while IS_CREATE_RECORDS_PERMISSION_ENABLED is off
      canCreateRecords: operationGrants.canUpdateRecords && isUpdateRestricted,
      canUpdateRecords: operationGrants.canUpdateRecords && isUpdateRestricted,
      canSoftDeleteRecords:
        operationGrants.canSoftDeleteRecords && isSoftDeleteRestricted,
      canDestroyRecords:
        operationGrants.canDestroyRecords && isDestroyRestricted,
    },
  };
};
