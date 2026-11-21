import { isDefined } from 'twenty-shared/utils';

import {
  type ObjectPermissionGrants,
  type RowLevelPermissionRuleGrants,
  type ScopedRowLevelPermissionPairReport,
  type ScopedRowLevelPermissionTranslationPlan,
} from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type';

const formatGrantFlags = (grantFlags: boolean[]): string =>
  `C/R/U/SD/D=${grantFlags.map((isGranted) => (isGranted ? 1 : 0)).join('/')}`;

const formatRuleGrants = (ruleGrants: RowLevelPermissionRuleGrants) =>
  formatGrantFlags([
    ruleGrants.canCreateRecords,
    ruleGrants.canReadRecords,
    ruleGrants.canUpdateRecords,
    ruleGrants.canSoftDeleteRecords,
    ruleGrants.canDestroyRecords,
  ]);

const formatObjectPermissionGrants = (
  objectPermissionGrants: ObjectPermissionGrants,
) =>
  formatGrantFlags([
    objectPermissionGrants.canCreateObjectRecords,
    objectPermissionGrants.canReadObjectRecords,
    objectPermissionGrants.canUpdateObjectRecords,
    objectPermissionGrants.canSoftDeleteObjectRecords,
    objectPermissionGrants.canDestroyObjectRecords,
  ]);

const formatPairReport = (pairReport: ScopedRowLevelPermissionPairReport) => {
  const pairDescription = `role ${pairReport.roleId} "${pairReport.roleLabel ?? 'unknown'}" on ${pairReport.objectNameSingular ?? 'unknown'} (${pairReport.objectMetadataId}), scopes ${pairReport.scopes.join('+')}`;

  if (pairReport.outcome === 'skipped') {
    return `skipped ${pairDescription}: already linked to rule(s) ${pairReport.rowLevelPermissionRuleIds.join(', ')}`;
  }

  if (pairReport.outcome === 'removed') {
    return [
      `removed ${pairDescription}: ${pairReport.predicateCount} predicate(s) and ${pairReport.predicateGroupCount} group(s) soft-deleted, no rule`,
      isDefined(pairReport.objectPermissionGrants)
        ? `object permission ${formatObjectPermissionGrants(pairReport.objectPermissionGrants)}`
        : 'no object permission',
      ...pairReport.warnings.map((warning) => `WARNING ${warning}`),
    ].join('; ');
  }

  const grantsDescription =
    isDefined(pairReport.ruleGrants) &&
    isDefined(pairReport.objectPermissionGrants)
      ? `rule ${formatRuleGrants(pairReport.ruleGrants)}, object permission ${formatObjectPermissionGrants(pairReport.objectPermissionGrants)}`
      : 'no grants';

  return [
    `translated ${pairDescription} -> rule ${pairReport.rowLevelPermissionRuleIds.join(', ')}: ${grantsDescription}`,
    `${pairReport.predicateCount} predicate(s), ${pairReport.predicateGroupCount} group(s), ${pairReport.relationHopConversionCount} relation hop(s) converted`,
    pairReport.hasRootPredicateGroupToInsert
      ? 'new AND root group over its trees'
      : 'tree kept as is',
    ...pairReport.warnings.map((warning) => `WARNING ${warning}`),
  ].join('; ');
};

// Ids, labels and counts only: predicate values can hold record data
export const formatScopedRowLevelPermissionTranslationReport = (
  plan: ScopedRowLevelPermissionTranslationPlan,
): string[] => [
  `${plan.rowLevelPermissionRulesToInsert.length} rule(s), ${plan.rootPredicateGroupsToInsert.length} root group(s) and ${plan.objectPermissionGrantsUpserts.length} object permission(s) to write, ${plan.predicateUpdates.length} predicate(s), ${plan.predicateGroupUpdates.length} group(s) and ${plan.fieldPermissionRuleLinks.length} field permission(s) to link, ${plan.predicateIdsToSoftDelete.length} predicate(s) and ${plan.predicateGroupIdsToSoftDelete.length} group(s) to soft-delete${plan.shouldEnableRelationHop ? ', relation hop flag to enable' : ''}, ${plan.aborts.length} blocking issue(s)`,
  ...plan.pairReports.map(formatPairReport),
];
