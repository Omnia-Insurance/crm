import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type ConflictingFieldGroup } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/types/conflicting-field-group.type';
import { buildWhereConditions } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/build-where-conditions.util';
import { getConflictingFields } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/get-conflicting-fields.util';
import { getValueFromPath } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/get-value-from-path.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

// Same matching as the create-many runner's upsert, without its multiple-match error
const findMatchingRecordId = ({
  record,
  conflictingFieldGroups,
  existingRecords,
}: {
  record: Partial<ObjectRecord>;
  conflictingFieldGroups: ConflictingFieldGroup[];
  existingRecords: Partial<ObjectRecord>[];
}): string | undefined => {
  for (const { conflictingProperties } of conflictingFieldGroups) {
    const requestedValues = conflictingProperties.map(({ fullPath }) =>
      getValueFromPath(record, fullPath),
    );

    if (requestedValues.some((value) => !isDefined(value))) {
      continue;
    }

    const matchingRecord = existingRecords.find((existingRecord) =>
      conflictingProperties.every(({ fullPath }, index) => {
        const existingValue = getValueFromPath(existingRecord, fullPath);

        return (
          isDefined(existingValue) && existingValue === requestedValues[index]
        );
      }),
    );

    if (isDefined(matchingRecord?.id)) {
      return matchingRecord.id;
    }
  }

  return undefined;
};

// For each upserted row, the id of the stored record the runner updates with it,
// or undefined when the runner inserts the row
export const findUpsertMatchingRecordIds = async ({
  workspaceId,
  flatObjectMetadata,
  flatFieldMetadataMaps,
  flatIndexMaps,
  records,
  workspaceOrmManager,
}: {
  workspaceId: string;
  flatObjectMetadata: FlatObjectMetadata;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  flatIndexMaps: FlatEntityMaps<FlatIndexMetadata>;
  records: Partial<ObjectRecord>[];
  workspaceOrmManager: WorkspaceOrmManager;
}): Promise<(string | undefined)[]> => {
  const conflictingFieldGroups = getConflictingFields(
    flatObjectMetadata,
    flatFieldMetadataMaps,
    flatIndexMaps,
  );
  const whereConditions = buildWhereConditions(records, conflictingFieldGroups);

  if (whereConditions.length === 0) {
    return records.map(() => undefined);
  }

  const conflictingColumnNames = conflictingFieldGroups.flatMap(
    ({ conflictingProperties }) =>
      conflictingProperties.map(({ column }) => column),
  );

  const existingRecords = await workspaceOrmManager.executeInWorkspaceContext(
    async () =>
      // Existence check only: the matched ids sort rows into updates and inserts, never reaching the caller
      workspaceOrmManager
        .getRepositoryWithoutPermissionChecks(flatObjectMetadata.nameSingular)
        .find({
          where: whereConditions,
          select: [...new Set(['id', ...conflictingColumnNames])],
          // Soft-deleted matches count, as the runner restores them instead of inserting
          withDeleted: true,
        }),
    buildSystemAuthContext(workspaceId),
  );

  return records.map((record) =>
    findMatchingRecordId({ record, conflictingFieldGroups, existingRecords }),
  );
};
