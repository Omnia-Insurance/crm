import {
  type FeatureFlagKey,
  type FieldMetadataType,
} from 'twenty-shared/types';

import { type RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';

// Values of the legacy Omnia "scope" column, which no entity maps any more
export type LegacyRowLevelPermissionScope = 'ALL' | 'READ' | 'WRITE';

export type ScopedRowLevelPermissionPredicateRow = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  roleId: string;
  objectMetadataId: string;
  fieldMetadataId: string;
  relationFieldMetadataId: string | null;
  workspaceMemberFieldMetadataId: string | null;
  operand: string;
  subFieldName: string | null;
  rowLevelPermissionPredicateGroupId: string | null;
  rowLevelPermissionRuleId: string | null;
  scope: LegacyRowLevelPermissionScope;
};

export type ScopedRowLevelPermissionPredicateGroupRow = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  roleId: string;
  objectMetadataId: string;
  parentRowLevelPermissionPredicateGroupId: string | null;
  rowLevelPermissionRuleId: string | null;
  scope: LegacyRowLevelPermissionScope;
  isDeleted: boolean;
};

export type TranslationRowLevelPermissionRuleRow = {
  id: string;
  roleId: string;
  objectMetadataId: string;
};

export type TranslationRoleRow = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  label: string;
};

export type TranslationObjectMetadataRow = {
  id: string;
  universalIdentifier: string;
  nameSingular: string;
};

export type TranslationFieldMetadataRow = {
  id: string;
  objectMetadataId: string;
  name: string;
  type: FieldMetadataType;
  isActive: boolean;
  relationTargetObjectMetadataId: string | null;
  relationType: RelationType | null;
};

export type TranslationApplicationRow = {
  id: string;
  universalIdentifier: string;
};

export type TranslationFieldPermissionRow = {
  id: string;
  roleId: string;
  objectMetadataId: string;
  rowLevelPermissionPredicateGroupId: string;
  rowLevelPermissionRuleId: string | null;
};

// Predicates are live rows only; groups include deleted ones so broken parents can be named
export type ScopedRowLevelPermissionTranslationSource = {
  predicates: ScopedRowLevelPermissionPredicateRow[];
  predicateGroups: ScopedRowLevelPermissionPredicateGroupRow[];
  rowLevelPermissionRules: TranslationRowLevelPermissionRuleRow[];
  roles: TranslationRoleRow[];
  objectMetadatas: TranslationObjectMetadataRow[];
  fieldMetadatas: TranslationFieldMetadataRow[];
  applications: TranslationApplicationRow[];
  fieldPermissions: TranslationFieldPermissionRow[];
  featureFlags: Partial<Record<FeatureFlagKey, boolean>>;
};
