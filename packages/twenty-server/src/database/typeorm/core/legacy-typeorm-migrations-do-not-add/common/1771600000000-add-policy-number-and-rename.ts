import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddPolicyNumberAndRename1771600000000
  implements MigrationInterface
{
  name = 'AddPolicyNumberAndRename1771600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const workspaces = await queryRunner.query(
      `SELECT w.id, w."workspaceCustomApplicationId", ds.schema as "schemaName"
       FROM core.workspace w
       JOIN core."dataSource" ds ON ds."workspaceId" = w.id
       WHERE w."deletedAt" IS NULL AND ds."isRemote" = false`,
    );

    for (const workspace of workspaces) {
      const schemaName = workspace.schemaName;

      if (!schemaName) {
        continue;
      }

      // Find the policy table name (may be "policy" or "_policy")
      const policyTable = await this.findTableName(
        queryRunner,
        schemaName,
        'policy',
      );

      if (!policyTable) {
        continue;
      }

      // 1. Add policyNumber column
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${policyTable}"
         ADD COLUMN IF NOT EXISTS "policyNumber" text`,
      );

      // 2. Copy current name into policyNumber (only where policyNumber is empty)
      await queryRunner.query(
        `UPDATE "${schemaName}"."${policyTable}"
         SET "policyNumber" = name
         WHERE "policyNumber" IS NULL AND name IS NOT NULL`,
      );

      // 3. Update name to "<Carrier> - <ProductType>" via joins
      const carrierTable = await this.findTableName(
        queryRunner,
        schemaName,
        'carrier',
      );
      const productTable = await this.findTableName(
        queryRunner,
        schemaName,
        'product',
      );
      const productTypeTable = await this.findTableName(
        queryRunner,
        schemaName,
        'productType',
      );

      if (carrierTable || productTable) {
        // Build the update query dynamically based on which tables exist
        await this.updatePolicyNames(
          queryRunner,
          schemaName,
          policyTable,
          carrierTable,
          productTable,
          productTypeTable,
        );
      }

      // 4. Relabel the "name" field from "Policy Number" to "Name"
      await queryRunner.query(
        `UPDATE core."fieldMetadata" fm
         SET label = 'Name'
         FROM core."objectMetadata" om
         WHERE om.id = fm."objectMetadataId"
           AND om."nameSingular" = 'policy'
           AND om."workspaceId" = '${workspace.id}'
           AND fm.name = 'name'
           AND fm.label = 'Policy Number'`,
      );

      // 5. Add field metadata for policyNumber (idempotent)
      await this.addFieldMetadata(queryRunner, workspace);

      // 5. Add _displayName -> name mapping to live HealthSherpa pipeline (idempotent)
      await this.addPipelineFieldMapping(queryRunner, workspace.id);

      // 6. Bump metadata version
      await queryRunner.query(
        `UPDATE core.workspace
         SET "metadataVersion" = "metadataVersion" + 1
         WHERE id = '${workspace.id}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const workspaces = await queryRunner.query(
      `SELECT w.id, ds.schema as "schemaName"
       FROM core.workspace w
       JOIN core."dataSource" ds ON ds."workspaceId" = w.id
       WHERE w."deletedAt" IS NULL AND ds."isRemote" = false`,
    );

    for (const workspace of workspaces) {
      const schemaName = workspace.schemaName;

      if (!schemaName) {
        continue;
      }

      const policyTable = await this.findTableName(
        queryRunner,
        schemaName,
        'policy',
      );

      if (!policyTable) {
        continue;
      }

      // 1. Copy policyNumber back to name
      await queryRunner.query(
        `UPDATE "${schemaName}"."${policyTable}"
         SET name = "policyNumber"
         WHERE "policyNumber" IS NOT NULL`,
      );

      // 2. Drop policyNumber column
      await queryRunner.query(
        `ALTER TABLE "${schemaName}"."${policyTable}"
         DROP COLUMN IF EXISTS "policyNumber"`,
      );

      // 3. Remove field metadata
      const objectMetadata = await queryRunner.query(
        `SELECT id FROM core."objectMetadata"
         WHERE "workspaceId" = '${workspace.id}'
           AND "nameSingular" = 'policy'`,
      );

      if (objectMetadata.length > 0) {
        await queryRunner.query(
          `DELETE FROM core."fieldMetadata"
           WHERE "objectMetadataId" = '${objectMetadata[0].id}'
             AND name = 'policyNumber'
             AND "workspaceId" = '${workspace.id}'`,
        );
      }

      // 4. Remove pipeline field mapping
      await queryRunner.query(
        `DELETE FROM core."ingestionFieldMapping"
         WHERE "sourceFieldPath" = '_displayName'
           AND "targetFieldName" = 'name'
           AND "pipelineId" IN (
             SELECT id FROM core."ingestionPipeline"
             WHERE "workspaceId" = '${workspace.id}'
               AND name = 'Health Sherpa Policies'
           )`,
      );

      // 5. Bump metadata version
      await queryRunner.query(
        `UPDATE core.workspace
         SET "metadataVersion" = "metadataVersion" + 1
         WHERE id = '${workspace.id}'`,
      );
    }
  }

  private async findTableName(
    queryRunner: QueryRunner,
    schemaName: string,
    baseName: string,
  ): Promise<string | null> {
    // Check for underscore-prefixed table first (newer convention)
    const prefixed = await queryRunner.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = '${schemaName}'
        AND table_name = '_${baseName}'
      )`,
    );

    if (prefixed[0].exists) {
      return `_${baseName}`;
    }

    // Fall back to non-prefixed table
    const unprefixed = await queryRunner.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = '${schemaName}'
        AND table_name = '${baseName}'
      )`,
    );

    if (unprefixed[0].exists) {
      return baseName;
    }

    return null;
  }

  private async updatePolicyNames(
    queryRunner: QueryRunner,
    schemaName: string,
    policyTable: string,
    carrierTable: string | null,
    productTable: string | null,
    productTypeTable: string | null,
  ): Promise<void> {
    // Use a subquery approach to compute the display name
    // PostgreSQL UPDATE ... FROM doesn't support LEFT JOIN on the target table

    const s = `"${schemaName}"`;

    // Build carrier name subquery
    const carrierSubquery = carrierTable
      ? `(SELECT c.name FROM ${s}."${carrierTable}" c WHERE c.id = p."carrierId")`
      : `NULL`;

    // Build product type name subquery
    let productTypeSubquery = 'NULL';

    if (productTable && productTypeTable) {
      productTypeSubquery = `(
        SELECT pt.name FROM ${s}."${productTable}" pr
        JOIN ${s}."${productTypeTable}" pt ON pt.id = pr."productTypeId"
        WHERE pr.id = p."productId"
      )`;
    } else if (productTable) {
      // No product type table — fall back to product name
      productTypeSubquery = `(
        SELECT pr.name FROM ${s}."${productTable}" pr
        WHERE pr.id = p."productId"
      )`;
    }

    // Update policies that have at least a carrier or product
    await queryRunner.query(
      `UPDATE ${s}."${policyTable}" p
       SET name = COALESCE(${carrierSubquery}, 'Unknown')
                  || ' - '
                  || COALESCE(${productTypeSubquery}, 'Unknown')
       WHERE p."carrierId" IS NOT NULL OR p."productId" IS NOT NULL`,
    );
  }

  private async addFieldMetadata(
    queryRunner: QueryRunner,
    workspace: { id: string; workspaceCustomApplicationId: string | null },
  ): Promise<void> {
    const objectMetadata = await queryRunner.query(
      `SELECT id FROM core."objectMetadata"
       WHERE "workspaceId" = '${workspace.id}'
         AND "nameSingular" = 'policy'`,
    );

    if (objectMetadata.length === 0) {
      return;
    }

    const objectMetadataId = objectMetadata[0].id;

    // Check if field already exists
    const existing = await queryRunner.query(
      `SELECT id FROM core."fieldMetadata"
       WHERE "objectMetadataId" = '${objectMetadataId}'
         AND name = 'policyNumber'
         AND "workspaceId" = '${workspace.id}'`,
    );

    if (existing.length > 0) {
      return;
    }

    const appId = workspace.workspaceCustomApplicationId || null;
    const appIdClause = appId ? `'${appId}'` : 'NULL';

    await queryRunner.query(
      `INSERT INTO core."fieldMetadata" (
        id,
        "objectMetadataId",
        type,
        name,
        label,
        "defaultValue",
        description,
        icon,
        "isCustom",
        "isActive",
        "isSystem",
        "isNullable",
        "isUnique",
        "isLabelSyncedWithName",
        "workspaceId",
        "universalIdentifier",
        "applicationId",
        "createdAt",
        "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        '${objectMetadataId}',
        'TEXT',
        'policyNumber',
        'Policy Number',
        NULL,
        'The policy number or application ID from the carrier',
        'IconHash',
        true,
        true,
        false,
        true,
        false,
        false,
        '${workspace.id}',
        gen_random_uuid(),
        ${appIdClause},
        NOW(),
        NOW()
      )`,
    );
  }

  private async addPipelineFieldMapping(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    // Find the Health Sherpa pipeline
    const pipelines = await queryRunner.query(
      `SELECT id FROM core."ingestionPipeline"
       WHERE "workspaceId" = '${workspaceId}'
         AND name = 'Health Sherpa Policies'
         AND "deletedAt" IS NULL`,
    );

    if (pipelines.length === 0) {
      return;
    }

    const pipelineId = pipelines[0].id;

    // Check if mapping already exists
    const existing = await queryRunner.query(
      `SELECT id FROM core."ingestionFieldMapping"
       WHERE "pipelineId" = '${pipelineId}'
         AND "sourceFieldPath" = '_displayName'
         AND "targetFieldName" = 'name'`,
    );

    if (existing.length > 0) {
      return;
    }

    // Get next position
    const maxPos = await queryRunner.query(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_pos
       FROM core."ingestionFieldMapping"
       WHERE "pipelineId" = '${pipelineId}'`,
    );

    await queryRunner.query(
      `INSERT INTO core."ingestionFieldMapping" (
        id,
        "pipelineId",
        "sourceFieldPath",
        "targetFieldName",
        "targetCompositeSubField",
        "transform",
        "relationTargetObjectName",
        "relationMatchFieldName",
        "relationAutoCreate",
        "position"
      ) VALUES (
        gen_random_uuid(),
        '${pipelineId}',
        '_displayName',
        'name',
        NULL,
        NULL,
        NULL,
        NULL,
        false,
        ${maxPos[0].next_pos}
      )`,
    );
  }
}
