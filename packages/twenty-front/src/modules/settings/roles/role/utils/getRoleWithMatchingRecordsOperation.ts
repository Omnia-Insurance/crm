import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { isDefined } from 'twenty-shared/utils';
import { type RowLevelPermissionRule } from '~/generated-metadata/graphql';
import { v4 } from 'uuid';

type RuleOperationKey =
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords';

export const getRoleWithMatchingRecordsOperation = ({
  role,
  objectMetadataId,
  ruleOperationKey,
  isMatchingRecords,
}: {
  role: RoleWithPartialMembers;
  objectMetadataId: string;
  ruleOperationKey: RuleOperationKey;
  isMatchingRecords: boolean;
}): RoleWithPartialMembers => {
  const rules = role.rowLevelPermissionRules ?? [];
  const existingRuleIndex = rules.findIndex(
    (rule) => rule.objectMetadataId === objectMetadataId,
  );
  const existingRule = rules[existingRuleIndex];

  // Like a new filter, a new rule restricts every operation to matching records
  const draftRule: RowLevelPermissionRule = isDefined(existingRule)
    ? { ...existingRule }
    : {
        id: v4(),
        objectMetadataId,
        canReadRecords: true,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: true,
        canDestroyRecords: true,
      };

  draftRule[ruleOperationKey] = isMatchingRecords;

  // Writing every record needs reading every record
  if (ruleOperationKey === 'canReadRecords' && isMatchingRecords) {
    draftRule.canUpdateRecords = true;
    draftRule.canSoftDeleteRecords = true;
    draftRule.canDestroyRecords = true;
  }

  draftRule.canCreateRecords = draftRule.canUpdateRecords;

  if (!isDefined(existingRule)) {
    return { ...role, rowLevelPermissionRules: [...rules, draftRule] };
  }

  return {
    ...role,
    rowLevelPermissionRules: rules.flatMap((rule, ruleIndex) => {
      if (rule.objectMetadataId !== objectMetadataId) {
        return [rule];
      }

      return ruleIndex === existingRuleIndex ? [draftRule] : [];
    }),
  };
};
