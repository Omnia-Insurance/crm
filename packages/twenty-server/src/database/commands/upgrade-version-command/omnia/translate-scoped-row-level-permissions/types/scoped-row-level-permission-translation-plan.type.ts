import { type LegacyRowLevelPermissionScope } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';

export type RowLevelPermissionRuleGrants = Pick<
  FlatRowLevelPermissionRule,
  | 'canCreateRecords'
  | 'canReadRecords'
  | 'canUpdateRecords'
  | 'canSoftDeleteRecords'
  | 'canDestroyRecords'
>;

export type ObjectPermissionGrants = {
  canCreateObjectRecords: boolean;
  canReadObjectRecords: boolean;
  canUpdateObjectRecords: boolean;
  canSoftDeleteObjectRecords: boolean;
  canDestroyObjectRecords: boolean;
};

export type RowLevelPermissionRuleToInsert = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  roleId: string;
  objectMetadataId: string;
  grants: RowLevelPermissionRuleGrants;
};

export type RootPredicateGroupToInsert = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  roleId: string;
  objectMetadataId: string;
  rowLevelPermissionRuleId: string;
  scope: LegacyRowLevelPermissionScope;
  grants: RowLevelPermissionRuleGrants;
};

export type RowLevelPermissionPredicateUpdate = {
  id: string;
  fieldMetadataId: string;
  relationFieldMetadataId: string | null;
  workspaceMemberFieldMetadataId: string | null;
  isConvertedToRelationHop: boolean;
  rowLevelPermissionPredicateGroupId: string | null;
  rowLevelPermissionRuleId: string;
};

export type RowLevelPermissionPredicateGroupUpdate = {
  id: string;
  parentRowLevelPermissionPredicateGroupId: string | null;
  rowLevelPermissionRuleId: string;
  // null keeps the stored grant columns of a group that is not a rule root
  grants: RowLevelPermissionRuleGrants | null;
};

export type FieldPermissionRuleLink = {
  id: string;
  rowLevelPermissionRuleId: string;
};

export type ObjectPermissionGrantsUpsert = {
  universalIdentifier: string;
  applicationId: string;
  roleId: string;
  objectMetadataId: string;
  grants: ObjectPermissionGrants;
};

export type ScopedRowLevelPermissionPairReport = {
  roleId: string;
  roleLabel: string | null;
  objectMetadataId: string;
  objectNameSingular: string | null;
  outcome: 'translated' | 'skipped' | 'removed';
  scopes: LegacyRowLevelPermissionScope[];
  rowLevelPermissionRuleIds: string[];
  ruleGrants: RowLevelPermissionRuleGrants | null;
  objectPermissionGrants: ObjectPermissionGrants | null;
  predicateCount: number;
  predicateGroupCount: number;
  relationHopConversionCount: number;
  hasRootPredicateGroupToInsert: boolean;
  warnings: string[];
};

export type ScopedRowLevelPermissionTranslationPlan = {
  aborts: string[];
  rowLevelPermissionRulesToInsert: RowLevelPermissionRuleToInsert[];
  rootPredicateGroupsToInsert: RootPredicateGroupToInsert[];
  predicateUpdates: RowLevelPermissionPredicateUpdate[];
  predicateGroupUpdates: RowLevelPermissionPredicateGroupUpdate[];
  fieldPermissionRuleLinks: FieldPermissionRuleLink[];
  objectPermissionGrantsUpserts: ObjectPermissionGrantsUpsert[];
  predicateIdsToSoftDelete: string[];
  predicateGroupIdsToSoftDelete: string[];
  shouldEnableRelationHop: boolean;
  pairReports: ScopedRowLevelPermissionPairReport[];
};
