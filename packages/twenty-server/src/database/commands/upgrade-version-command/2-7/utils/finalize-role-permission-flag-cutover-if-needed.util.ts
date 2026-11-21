import { type QueryRunner } from 'typeorm';
import { isNonEmptyArray } from 'twenty-shared/utils';

type FinalizeRolePermissionFlagCutoverResult = {
  wasCutoverPending: boolean;
  relinkedWorkspaceIds: string[];
};

// Shared by the 2.7 Finalize command and the Omnia 2.8 catch-up: whichever
// runs second finds no "flag" column and does nothing.
export const finalizeRolePermissionFlagCutoverIfNeeded = async (
  queryRunner: QueryRunner,
): Promise<FinalizeRolePermissionFlagCutoverResult> => {
  const flagColumns: { column_name: string }[] = await queryRunner.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'rolePermissionFlag'
       AND column_name = 'flag'`,
  );

  if (!isNonEmptyArray(flagColumns)) {
    return { wasCutoverPending: false, relinkedWorkspaceIds: [] };
  }

  await queryRunner.query(
    `ALTER TABLE "core"."rolePermissionFlag"
     DROP CONSTRAINT IF EXISTS "IDX_ROLE_PERMISSION_FLAG_FLAG_ROLE_ID_UNIQUE"`,
  );

  const unlinkedWorkspaces: { workspaceId: string }[] = await queryRunner.query(
    `SELECT DISTINCT "workspaceId" FROM "core"."rolePermissionFlag"
     WHERE "permissionFlagId" IS NULL`,
  );

  if (isNonEmptyArray(unlinkedWorkspaces)) {
    // Long-lived workspaces kept rows the 2.6 link step never linked. The table
    // is small, so the relink shares the SET NOT NULL transaction.
    await queryRunner.query(
      `UPDATE "core"."rolePermissionFlag" rolePermissionFlag
          SET "permissionFlagId" = permissionFlag."id"
         FROM "core"."permissionFlag" permissionFlag
        WHERE rolePermissionFlag."permissionFlagId" IS NULL
          AND permissionFlag."key" = rolePermissionFlag."flag"
          AND permissionFlag."workspaceId" = rolePermissionFlag."workspaceId"`,
    );

    const orphanFlags: { flag: string; count: string }[] =
      await queryRunner.query(
        `SELECT "flag", count(*) AS "count" FROM "core"."rolePermissionFlag"
         WHERE "permissionFlagId" IS NULL
         GROUP BY "flag"`,
      );

    if (isNonEmptyArray(orphanFlags)) {
      const inventory = orphanFlags
        .map(({ flag, count }) => `${flag}: ${count}`)
        .join(', ');

      // The failed run leaves per-workspace rows for this step, and the workspace
      // barrier before it refuses a plain rerun until they are gone.
      throw new Error(
        `core."rolePermissionFlag" still holds rows whose flag matches no core."permissionFlag" key (${inventory}). Delete or relink them, then run DELETE FROM core."upgradeMigration" WHERE name LIKE '%RolePermissionFlagCutover%' AND status = 'failed' AND "workspaceId" IS NOT NULL; and rerun the upgrade.`,
      );
    }
  }

  await queryRunner.query(
    `ALTER TABLE "core"."rolePermissionFlag"
     ALTER COLUMN "permissionFlagId" SET NOT NULL`,
  );

  await queryRunner.query(
    `ALTER TABLE "core"."rolePermissionFlag" DROP COLUMN IF EXISTS "flag"`,
  );

  return {
    wasCutoverPending: true,
    relinkedWorkspaceIds: unlinkedWorkspaces.map(
      ({ workspaceId }) => workspaceId,
    ),
  };
};
