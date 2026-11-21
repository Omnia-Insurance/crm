import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { findUpsertMatchingRecordIds } from 'src/modules/omnia/utils/find-upsert-matching-record-ids.util';
import { getNowUtc } from 'src/modules/policy/utils/get-today-for-member.util';

type PolicySubmittedDateArgs = {
  workspaceCacheService: WorkspaceCacheService;
  workspaceOrmManager: WorkspaceOrmManager;
};

const findPoliciesToInsert = async ({
  workspaceId,
  records,
  workspaceCacheService,
  workspaceOrmManager,
}: PolicySubmittedDateArgs & {
  workspaceId: string;
  records: Partial<ObjectRecord>[];
}): Promise<Partial<ObjectRecord>[]> => {
  const { flatObjectMetadataMaps, flatFieldMetadataMapsOrm, flatIndexMaps } =
    await workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMapsOrm',
      'flatIndexMaps',
    ]);

  const policyObjectMetadataId = buildObjectIdByNameMaps(flatObjectMetadataMaps)
    .idByNameSingular.policy;
  const policyFlatObjectMetadata = isDefined(policyObjectMetadataId)
    ? findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: policyObjectMetadataId,
        flatEntityMaps: flatObjectMetadataMaps,
      })
    : undefined;

  if (!isDefined(policyFlatObjectMetadata)) {
    return [];
  }

  const matchingPolicyIds = await findUpsertMatchingRecordIds({
    workspaceId,
    flatObjectMetadata: policyFlatObjectMetadata,
    flatFieldMetadataMaps: flatFieldMetadataMapsOrm,
    flatIndexMaps,
    records,
    workspaceOrmManager,
  });

  return records.filter(
    (_record, index) => !isDefined(matchingPolicyIds[index]),
  );
};

// Only a user's new policies are dated now: ingestion, integrations and apps send their own date.
// Stamped before the insert, the last point where an upsert's updates of stored policies are known;
// the create field check lets a creator set submittedDate even where the role locks it afterwards.
export const stampSubmittedDateOnNewPolicies = async ({
  authContext,
  records,
  isUpsert,
  workspaceCacheService,
  workspaceOrmManager,
}: PolicySubmittedDateArgs & {
  authContext: WorkspaceAuthContext;
  records: Partial<ObjectRecord>[];
  isUpsert: boolean;
}): Promise<void> => {
  if (!isUserAuthContext(authContext)) {
    return;
  }

  const undatedRecords = records.filter(
    (record) => !isDefined(record.submittedDate),
  );

  if (undatedRecords.length === 0) {
    return;
  }

  const recordsToDate = isUpsert
    ? await findPoliciesToInsert({
        workspaceId: authContext.workspace.id,
        records: undatedRecords,
        workspaceCacheService,
        workspaceOrmManager,
      })
    : undatedRecords;

  const submittedDate = getNowUtc();

  for (const record of recordsToDate) {
    record.submittedDate = submittedDate;
  }
};
