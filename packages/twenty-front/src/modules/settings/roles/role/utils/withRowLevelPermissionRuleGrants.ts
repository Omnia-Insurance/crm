// OMNIA-CUSTOM: the fold reads the object-level all-records grants (contract C1)
import { resolveSettingsRoleObjectRecordsGrant } from '@/settings/roles/role/utils/resolveSettingsRoleObjectRecordsGrant';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { isDefined } from 'twenty-shared/utils';
// OMNIA-CUSTOM: rule operation keys of isGrantedByEveryRule (contract C1)
import { type RowLevelPermissionRule } from '~/generated-metadata/graphql';

// An object filtered by row level rules keeps its object-level grant off, so its toggles show its rule grants
export const withRowLevelPermissionRuleGrants = (
  role: RoleWithPartialMembers,
): RoleWithPartialMembers => {
  const filteredObjectMetadataIds = new Set(
    (role.rowLevelPermissionPredicates ?? []).map(
      ({ objectMetadataId }) => objectMetadataId,
    ),
  );
  const rules = (role.rowLevelPermissionRules ?? []).filter(
    ({ objectMetadataId }) => filteredObjectMetadataIds.has(objectMetadataId),
  );

  if (rules.length === 0) {
    return role;
  }

  const objectPermissions = [...(role.objectPermissions ?? [])];
  // OMNIA-CUSTOM: the API gives every rule of an object one grant set; folding keeps what all of them grant,
  // so a rule written outside it never widens access on the next save (contract C1)
  const isGrantedByEveryRule = (
    objectMetadataId: string,
    ruleOperationKey: keyof Pick<
      RowLevelPermissionRule,
      | 'canReadRecords'
      | 'canUpdateRecords'
      | 'canSoftDeleteRecords'
      | 'canDestroyRecords'
    >,
  ) =>
    rules
      .filter((rule) => rule.objectMetadataId === objectMetadataId)
      .every((rule) => rule[ruleOperationKey]);

  for (const rule of rules) {
    const objectPermissionIndex = objectPermissions.findIndex(
      ({ objectMetadataId }) => objectMetadataId === rule.objectMetadataId,
    );
    // A grant equal to the all-objects one stays inherited, so it keeps following that toggle
    const inheritWhenEqual = ({
      ruleGrant,
      allObjectsGrant,
    }: {
      ruleGrant: boolean;
      allObjectsGrant: boolean;
    }) => (ruleGrant === allObjectsGrant ? null : ruleGrant);
    // OMNIA-CUSTOM: an all-records object grant wins over the rule, so the toggle is on when either grants (contract C1)
    const objectRecordsGrant = resolveSettingsRoleObjectRecordsGrant({
      role,
      objectMetadataId: rule.objectMetadataId,
    });
    const ruleGrants = {
      objectMetadataId: rule.objectMetadataId,
      canReadObjectRecords: inheritWhenEqual({
        ruleGrant:
          objectRecordsGrant.canReadRecords ||
          isGrantedByEveryRule(rule.objectMetadataId, 'canReadRecords'),
        allObjectsGrant: role.canReadAllObjectRecords,
      }),
      canUpdateObjectRecords: inheritWhenEqual({
        ruleGrant:
          objectRecordsGrant.canUpdateRecords ||
          isGrantedByEveryRule(rule.objectMetadataId, 'canUpdateRecords'),
        allObjectsGrant: role.canUpdateAllObjectRecords,
      }),
      canSoftDeleteObjectRecords: inheritWhenEqual({
        ruleGrant:
          objectRecordsGrant.canSoftDeleteRecords ||
          isGrantedByEveryRule(rule.objectMetadataId, 'canSoftDeleteRecords'),
        allObjectsGrant: role.canSoftDeleteAllObjectRecords,
      }),
      canDestroyObjectRecords: inheritWhenEqual({
        ruleGrant:
          objectRecordsGrant.canDestroyRecords ||
          isGrantedByEveryRule(rule.objectMetadataId, 'canDestroyRecords'),
        allObjectsGrant: role.canDestroyAllObjectRecords,
      }),
    };

    if (objectPermissionIndex === -1) {
      objectPermissions.push(ruleGrants);
    } else if (isDefined(objectPermissions[objectPermissionIndex])) {
      objectPermissions[objectPermissionIndex] = {
        ...objectPermissions[objectPermissionIndex],
        ...ruleGrants,
      };
    }
  }

  // OMNIA-CUSTOM: one draft rule per object; true marks an operation without an object-level grant, which
  // reaches matching records only (revoked ones too, so granting them later starts there) (contract C1)
  const foldedRuleObjectMetadataIds = new Set<string>();
  const rowLevelPermissionRules = (role.rowLevelPermissionRules ?? []).flatMap(
    (rule) => {
      if (!filteredObjectMetadataIds.has(rule.objectMetadataId)) {
        return [rule];
      }

      if (foldedRuleObjectMetadataIds.has(rule.objectMetadataId)) {
        return [];
      }

      foldedRuleObjectMetadataIds.add(rule.objectMetadataId);

      const objectRecordsGrant = resolveSettingsRoleObjectRecordsGrant({
        role,
        objectMetadataId: rule.objectMetadataId,
      });

      return [
        {
          ...rule,
          canReadRecords: !objectRecordsGrant.canReadRecords,
          canCreateRecords: !objectRecordsGrant.canUpdateRecords,
          canUpdateRecords: !objectRecordsGrant.canUpdateRecords,
          canSoftDeleteRecords: !objectRecordsGrant.canSoftDeleteRecords,
          canDestroyRecords: !objectRecordsGrant.canDestroyRecords,
        },
      ];
    },
  );

  return { ...role, objectPermissions, rowLevelPermissionRules };
};
