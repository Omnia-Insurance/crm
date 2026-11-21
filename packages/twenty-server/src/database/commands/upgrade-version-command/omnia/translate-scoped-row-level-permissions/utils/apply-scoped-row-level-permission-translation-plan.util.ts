import { FeatureFlagKey } from 'twenty-shared/types';
import { type EntityManager } from 'typeorm';

import { type ScopedRowLevelPermissionTranslationPlan } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type';

// Rules first, then the root groups that point at them, then the rows that point at both
export const applyScopedRowLevelPermissionTranslationPlan = async ({
  entityManager,
  workspaceId,
  plan,
}: {
  entityManager: Pick<EntityManager, 'query'>;
  workspaceId: string;
  plan: ScopedRowLevelPermissionTranslationPlan;
}): Promise<void> => {
  const {
    rowLevelPermissionRulesToInsert,
    rootPredicateGroupsToInsert,
    predicateUpdates,
    predicateGroupUpdates,
    fieldPermissionRuleLinks,
    objectPermissionGrantsUpserts,
    predicateIdsToSoftDelete,
    predicateGroupIdsToSoftDelete,
  } = plan;

  if (rowLevelPermissionRulesToInsert.length > 0) {
    await entityManager.query(
      `INSERT INTO "core"."rowLevelPermissionRule"
         ("id", "workspaceId", "universalIdentifier", "applicationId", "roleId", "objectMetadataId",
          "canCreateRecords", "canReadRecords", "canUpdateRecords", "canSoftDeleteRecords", "canDestroyRecords")
       SELECT "rule"."id", $1, "rule"."universalIdentifier", "rule"."applicationId", "rule"."roleId",
              "rule"."objectMetadataId", "rule"."canCreateRecords", "rule"."canReadRecords",
              "rule"."canUpdateRecords", "rule"."canSoftDeleteRecords", "rule"."canDestroyRecords"
       FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::uuid[],
                   $7::boolean[], $8::boolean[], $9::boolean[], $10::boolean[], $11::boolean[])
         AS "rule"("id", "universalIdentifier", "applicationId", "roleId", "objectMetadataId",
                   "canCreateRecords", "canReadRecords", "canUpdateRecords", "canSoftDeleteRecords",
                   "canDestroyRecords")`,
      [
        workspaceId,
        rowLevelPermissionRulesToInsert.map(({ id }) => id),
        rowLevelPermissionRulesToInsert.map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
        rowLevelPermissionRulesToInsert.map(
          ({ applicationId }) => applicationId,
        ),
        rowLevelPermissionRulesToInsert.map(({ roleId }) => roleId),
        rowLevelPermissionRulesToInsert.map(
          ({ objectMetadataId }) => objectMetadataId,
        ),
        rowLevelPermissionRulesToInsert.map(
          ({ grants }) => grants.canCreateRecords,
        ),
        rowLevelPermissionRulesToInsert.map(
          ({ grants }) => grants.canReadRecords,
        ),
        rowLevelPermissionRulesToInsert.map(
          ({ grants }) => grants.canUpdateRecords,
        ),
        rowLevelPermissionRulesToInsert.map(
          ({ grants }) => grants.canSoftDeleteRecords,
        ),
        rowLevelPermissionRulesToInsert.map(
          ({ grants }) => grants.canDestroyRecords,
        ),
      ],
    );
  }

  // One row per statement so the untyped scope parameter takes the column's enum type
  for (const rootPredicateGroup of rootPredicateGroupsToInsert) {
    await entityManager.query(
      `INSERT INTO "core"."rowLevelPermissionPredicateGroup"
         ("id", "workspaceId", "universalIdentifier", "applicationId", "roleId", "objectMetadataId",
          "parentRowLevelPermissionPredicateGroupId", "rowLevelPermissionRuleId", "logicalOperator",
          "scope", "canCreateRecords", "canReadRecords", "canUpdateRecords", "canSoftDeleteRecords",
          "canDestroyRecords")
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'AND', $8, $9, $10, $11, $12, $13)`,
      [
        rootPredicateGroup.id,
        workspaceId,
        rootPredicateGroup.universalIdentifier,
        rootPredicateGroup.applicationId,
        rootPredicateGroup.roleId,
        rootPredicateGroup.objectMetadataId,
        rootPredicateGroup.rowLevelPermissionRuleId,
        rootPredicateGroup.scope,
        rootPredicateGroup.grants.canCreateRecords,
        rootPredicateGroup.grants.canReadRecords,
        rootPredicateGroup.grants.canUpdateRecords,
        rootPredicateGroup.grants.canSoftDeleteRecords,
        rootPredicateGroup.grants.canDestroyRecords,
      ],
    );
  }

  if (predicateUpdates.length > 0) {
    await entityManager.query(
      `UPDATE "core"."rowLevelPermissionPredicate" AS "predicate"
       SET "fieldMetadataId" = "planned"."fieldMetadataId",
           "relationFieldMetadataId" = "planned"."relationFieldMetadataId",
           "workspaceMemberFieldMetadataId" = "planned"."workspaceMemberFieldMetadataId",
           "value" = CASE WHEN "planned"."isConvertedToRelationHop" THEN NULL ELSE "predicate"."value" END,
           "subFieldName" = CASE WHEN "planned"."isConvertedToRelationHop" THEN NULL ELSE "predicate"."subFieldName" END,
           "workspaceMemberSubFieldName" = CASE WHEN "planned"."isConvertedToRelationHop" THEN NULL ELSE "predicate"."workspaceMemberSubFieldName" END,
           "rowLevelPermissionPredicateGroupId" = "planned"."rowLevelPermissionPredicateGroupId",
           "rowLevelPermissionRuleId" = "planned"."rowLevelPermissionRuleId",
           "updatedAt" = now()
       FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::boolean[], $7::uuid[], $8::uuid[])
         AS "planned"("id", "fieldMetadataId", "relationFieldMetadataId", "workspaceMemberFieldMetadataId",
                      "isConvertedToRelationHop", "rowLevelPermissionPredicateGroupId",
                      "rowLevelPermissionRuleId")
       WHERE "predicate"."id" = "planned"."id" AND "predicate"."workspaceId" = $1`,
      [
        workspaceId,
        predicateUpdates.map(({ id }) => id),
        predicateUpdates.map(({ fieldMetadataId }) => fieldMetadataId),
        predicateUpdates.map(
          ({ relationFieldMetadataId }) => relationFieldMetadataId,
        ),
        predicateUpdates.map(
          ({ workspaceMemberFieldMetadataId }) =>
            workspaceMemberFieldMetadataId,
        ),
        predicateUpdates.map(
          ({ isConvertedToRelationHop }) => isConvertedToRelationHop,
        ),
        predicateUpdates.map(
          ({ rowLevelPermissionPredicateGroupId }) =>
            rowLevelPermissionPredicateGroupId,
        ),
        predicateUpdates.map(
          ({ rowLevelPermissionRuleId }) => rowLevelPermissionRuleId,
        ),
      ],
    );
  }

  if (predicateGroupUpdates.length > 0) {
    await entityManager.query(
      `UPDATE "core"."rowLevelPermissionPredicateGroup" AS "predicateGroup"
       SET "parentRowLevelPermissionPredicateGroupId" = "planned"."parentRowLevelPermissionPredicateGroupId",
           "rowLevelPermissionRuleId" = "planned"."rowLevelPermissionRuleId",
           "canCreateRecords" = COALESCE("planned"."canCreateRecords", "predicateGroup"."canCreateRecords"),
           "canReadRecords" = COALESCE("planned"."canReadRecords", "predicateGroup"."canReadRecords"),
           "canUpdateRecords" = COALESCE("planned"."canUpdateRecords", "predicateGroup"."canUpdateRecords"),
           "canSoftDeleteRecords" = COALESCE("planned"."canSoftDeleteRecords", "predicateGroup"."canSoftDeleteRecords"),
           "canDestroyRecords" = COALESCE("planned"."canDestroyRecords", "predicateGroup"."canDestroyRecords"),
           "updatedAt" = now()
       FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::boolean[], $6::boolean[], $7::boolean[],
                   $8::boolean[], $9::boolean[])
         AS "planned"("id", "parentRowLevelPermissionPredicateGroupId", "rowLevelPermissionRuleId",
                      "canCreateRecords", "canReadRecords", "canUpdateRecords", "canSoftDeleteRecords",
                      "canDestroyRecords")
       WHERE "predicateGroup"."id" = "planned"."id" AND "predicateGroup"."workspaceId" = $1`,
      [
        workspaceId,
        predicateGroupUpdates.map(({ id }) => id),
        predicateGroupUpdates.map(
          ({ parentRowLevelPermissionPredicateGroupId }) =>
            parentRowLevelPermissionPredicateGroupId,
        ),
        predicateGroupUpdates.map(
          ({ rowLevelPermissionRuleId }) => rowLevelPermissionRuleId,
        ),
        predicateGroupUpdates.map(
          ({ grants }) => grants?.canCreateRecords ?? null,
        ),
        predicateGroupUpdates.map(
          ({ grants }) => grants?.canReadRecords ?? null,
        ),
        predicateGroupUpdates.map(
          ({ grants }) => grants?.canUpdateRecords ?? null,
        ),
        predicateGroupUpdates.map(
          ({ grants }) => grants?.canSoftDeleteRecords ?? null,
        ),
        predicateGroupUpdates.map(
          ({ grants }) => grants?.canDestroyRecords ?? null,
        ),
      ],
    );
  }

  if (fieldPermissionRuleLinks.length > 0) {
    await entityManager.query(
      `UPDATE "core"."fieldPermission" AS "fieldPermission"
       SET "rowLevelPermissionRuleId" = "link"."rowLevelPermissionRuleId"
       FROM unnest($2::uuid[], $3::uuid[]) AS "link"("id", "rowLevelPermissionRuleId")
       WHERE "fieldPermission"."id" = "link"."id" AND "fieldPermission"."workspaceId" = $1`,
      [
        workspaceId,
        fieldPermissionRuleLinks.map(({ id }) => id),
        fieldPermissionRuleLinks.map(
          ({ rowLevelPermissionRuleId }) => rowLevelPermissionRuleId,
        ),
      ],
    );
  }

  for (const [tableName, ids] of [
    ['rowLevelPermissionPredicate', predicateIdsToSoftDelete],
    ['rowLevelPermissionPredicateGroup', predicateGroupIdsToSoftDelete],
  ] as const) {
    if (ids.length === 0) {
      continue;
    }

    await entityManager.query(
      `UPDATE "core"."${tableName}"
       SET "deletedAt" = now(), "updatedAt" = now()
       WHERE "workspaceId" = $1 AND "id" = ANY($2::uuid[]) AND "deletedAt" IS NULL`,
      [workspaceId, ids],
    );
  }

  // Only the grant columns change, so the row's Omnia sidebar and edit window settings survive
  if (objectPermissionGrantsUpserts.length > 0) {
    await entityManager.query(
      `INSERT INTO "core"."objectPermission"
         ("workspaceId", "universalIdentifier", "applicationId", "roleId", "objectMetadataId",
          "canCreateObjectRecords", "canReadObjectRecords", "canUpdateObjectRecords",
          "canSoftDeleteObjectRecords", "canDestroyObjectRecords")
       SELECT $1, "pair"."universalIdentifier", "pair"."applicationId", "pair"."roleId",
              "pair"."objectMetadataId", "pair"."canCreateObjectRecords", "pair"."canReadObjectRecords",
              "pair"."canUpdateObjectRecords", "pair"."canSoftDeleteObjectRecords",
              "pair"."canDestroyObjectRecords"
       FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::boolean[], $7::boolean[],
                   $8::boolean[], $9::boolean[], $10::boolean[])
         AS "pair"("universalIdentifier", "applicationId", "roleId", "objectMetadataId",
                   "canCreateObjectRecords", "canReadObjectRecords", "canUpdateObjectRecords",
                   "canSoftDeleteObjectRecords", "canDestroyObjectRecords")
       ON CONFLICT ("objectMetadataId", "roleId") DO UPDATE SET
         "canCreateObjectRecords" = EXCLUDED."canCreateObjectRecords",
         "canReadObjectRecords" = EXCLUDED."canReadObjectRecords",
         "canUpdateObjectRecords" = EXCLUDED."canUpdateObjectRecords",
         "canSoftDeleteObjectRecords" = EXCLUDED."canSoftDeleteObjectRecords",
         "canDestroyObjectRecords" = EXCLUDED."canDestroyObjectRecords",
         "updatedAt" = now()`,
      [
        workspaceId,
        objectPermissionGrantsUpserts.map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
        objectPermissionGrantsUpserts.map(({ applicationId }) => applicationId),
        objectPermissionGrantsUpserts.map(({ roleId }) => roleId),
        objectPermissionGrantsUpserts.map(
          ({ objectMetadataId }) => objectMetadataId,
        ),
        objectPermissionGrantsUpserts.map(
          ({ grants }) => grants.canCreateObjectRecords,
        ),
        objectPermissionGrantsUpserts.map(
          ({ grants }) => grants.canReadObjectRecords,
        ),
        objectPermissionGrantsUpserts.map(
          ({ grants }) => grants.canUpdateObjectRecords,
        ),
        objectPermissionGrantsUpserts.map(
          ({ grants }) => grants.canSoftDeleteObjectRecords,
        ),
        objectPermissionGrantsUpserts.map(
          ({ grants }) => grants.canDestroyObjectRecords,
        ),
      ],
    );
  }

  if (plan.shouldEnableRelationHop) {
    await entityManager.query(
      `INSERT INTO "core"."featureFlag" ("workspaceId", "key", "value")
       VALUES ($1, $2, true)
       ON CONFLICT ("key", "workspaceId") DO UPDATE SET "value" = true, "updatedAt" = now()`,
      [
        workspaceId,
        FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED,
      ],
    );
  }
};
