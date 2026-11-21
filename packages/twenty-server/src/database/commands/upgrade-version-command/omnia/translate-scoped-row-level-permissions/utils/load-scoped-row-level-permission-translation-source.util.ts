import { FeatureFlagKey } from 'twenty-shared/types';
import { type DataSource } from 'typeorm';

import {
  type ScopedRowLevelPermissionPredicateGroupRow,
  type ScopedRowLevelPermissionPredicateRow,
  type ScopedRowLevelPermissionTranslationSource,
  type TranslationApplicationRow,
  type TranslationFieldMetadataRow,
  type TranslationFieldPermissionRow,
  type TranslationObjectMetadataRow,
  type TranslationRoleRow,
  type TranslationRowLevelPermissionRuleRow,
} from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type';
import { RECORD_ACCESS_FEATURE_FLAG_KEYS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/record-access-feature-flag-keys.constant';

const SCOPE_COLUMNS = [
  ['rowLevelPermissionPredicate', 'scope'],
  ['rowLevelPermissionPredicateGroup', 'scope'],
] as const;

const RULE_COLUMNS = [
  ['rowLevelPermissionRule', 'id'],
  ['rowLevelPermissionPredicate', 'rowLevelPermissionRuleId'],
  ['rowLevelPermissionPredicate', 'relationFieldMetadataId'],
  ['rowLevelPermissionPredicateGroup', 'rowLevelPermissionRuleId'],
  ['fieldPermission', 'rowLevelPermissionRuleId'],
  ['fieldPermission', 'rowLevelPermissionPredicateGroupId'],
] as const;

const TRANSLATION_FEATURE_FLAG_KEYS: FeatureFlagKey[] = [
  FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED,
  ...RECORD_ACCESS_FEATURE_FLAG_KEYS,
];

// The scope column is no longer on any entity, so every row is read with raw SQL; undefined means
// the workspace never had Omnia scopes and there is nothing to translate
export const loadScopedRowLevelPermissionTranslationSource = async ({
  dataSource,
  workspaceId,
}: {
  dataSource: Pick<DataSource, 'query'>;
  workspaceId: string;
}): Promise<ScopedRowLevelPermissionTranslationSource | undefined> => {
  const existingColumns = await dataSource.query<
    { tableName: string; columnName: string }[]
  >(
    `SELECT "table_name" AS "tableName", "column_name" AS "columnName"
     FROM "information_schema"."columns"
     WHERE "table_schema" = 'core'
       AND "table_name" = ANY($1::text[])
       AND "column_name" = ANY($2::text[])`,
    [
      [...SCOPE_COLUMNS, ...RULE_COLUMNS].map(([tableName]) => tableName),
      [...SCOPE_COLUMNS, ...RULE_COLUMNS].map(([, columnName]) => columnName),
    ],
  );

  const findMissingColumns = (
    columns: readonly (readonly [string, string])[],
  ): string[] =>
    columns
      .filter(
        ([tableName, columnName]) =>
          !existingColumns.some(
            (existingColumn) =>
              existingColumn.tableName === tableName &&
              existingColumn.columnName === columnName,
          ),
      )
      .map(([tableName, columnName]) => `${tableName}.${columnName}`);

  const missingScopeColumns = findMissingColumns(SCOPE_COLUMNS);

  if (missingScopeColumns.length === SCOPE_COLUMNS.length) {
    return undefined;
  }

  const missingColumns = [
    ...missingScopeColumns,
    ...findMissingColumns(RULE_COLUMNS),
  ];

  if (missingColumns.length > 0) {
    throw new Error(
      `Workspace ${workspaceId}: core is missing ${missingColumns.join(', ')}; run the 2.58 instance commands before translating scoped row level permissions`,
    );
  }

  const predicates = await dataSource.query<
    ScopedRowLevelPermissionPredicateRow[]
  >(
    `SELECT "id", "universalIdentifier", "applicationId", "roleId", "objectMetadataId",
            "fieldMetadataId", "relationFieldMetadataId", "workspaceMemberFieldMetadataId",
            "operand"::text AS "operand", "subFieldName", "rowLevelPermissionPredicateGroupId",
            "rowLevelPermissionRuleId", "scope"::text AS "scope"
     FROM "core"."rowLevelPermissionPredicate"
     WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
    [workspaceId],
  );

  const predicateGroups = await dataSource.query<
    ScopedRowLevelPermissionPredicateGroupRow[]
  >(
    `SELECT "id", "universalIdentifier", "applicationId", "roleId", "objectMetadataId",
            "parentRowLevelPermissionPredicateGroupId", "rowLevelPermissionRuleId",
            "scope"::text AS "scope", "deletedAt" IS NOT NULL AS "isDeleted"
     FROM "core"."rowLevelPermissionPredicateGroup"
     WHERE "workspaceId" = $1`,
    [workspaceId],
  );

  const rowLevelPermissionRules = await dataSource.query<
    TranslationRowLevelPermissionRuleRow[]
  >(
    `SELECT "id", "roleId", "objectMetadataId"
     FROM "core"."rowLevelPermissionRule"
     WHERE "workspaceId" = $1`,
    [workspaceId],
  );

  const roles = await dataSource.query<TranslationRoleRow[]>(
    `SELECT "id", "universalIdentifier", "applicationId", "label"
     FROM "core"."role"
     WHERE "workspaceId" = $1`,
    [workspaceId],
  );

  const objectMetadatas = await dataSource.query<
    TranslationObjectMetadataRow[]
  >(
    `SELECT "id", "universalIdentifier", "nameSingular"
     FROM "core"."objectMetadata"
     WHERE "workspaceId" = $1`,
    [workspaceId],
  );

  const fieldMetadatas = await dataSource.query<TranslationFieldMetadataRow[]>(
    `SELECT "id", "objectMetadataId", "name", "type"::text AS "type", "isActive",
            "relationTargetObjectMetadataId", "settings"->>'relationType' AS "relationType"
     FROM "core"."fieldMetadata"
     WHERE "workspaceId" = $1`,
    [workspaceId],
  );

  const applications = await dataSource.query<TranslationApplicationRow[]>(
    `SELECT "id", "universalIdentifier"
     FROM "core"."application"
     WHERE "workspaceId" = $1`,
    [workspaceId],
  );

  const fieldPermissions = await dataSource.query<
    TranslationFieldPermissionRow[]
  >(
    `SELECT "id", "roleId", "objectMetadataId", "rowLevelPermissionPredicateGroupId",
            "rowLevelPermissionRuleId"
     FROM "core"."fieldPermission"
     WHERE "workspaceId" = $1 AND "rowLevelPermissionPredicateGroupId" IS NOT NULL`,
    [workspaceId],
  );

  const featureFlagRows = await dataSource.query<
    { key: FeatureFlagKey; value: boolean }[]
  >(
    `SELECT "key", "value"
     FROM "core"."featureFlag"
     WHERE "workspaceId" = $1 AND "key" = ANY($2::text[])`,
    [workspaceId, TRANSLATION_FEATURE_FLAG_KEYS],
  );

  return {
    predicates,
    predicateGroups,
    rowLevelPermissionRules,
    roles,
    objectMetadatas,
    fieldMetadatas,
    applications,
    fieldPermissions,
    featureFlags: Object.fromEntries(
      featureFlagRows.map(({ key, value }) => [key, value]),
    ),
  };
};
