import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { isSystemAuthContext } from 'src/engine/core-modules/auth/guards/is-system-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/permissions/permissions.exception';
import { PrincipalPermissionsReadService } from 'src/engine/permissions/principal-permissions-read.service';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type TimelineActivityMutationInput } from 'src/modules/timeline/query-hooks/types/timeline-activity-mutation-input.type';
import { getObjectByTargetColumnName } from 'src/modules/timeline/utils/omit-restricted-fields-from-timeline-activity.util';

const throwPermissionDenied = (): never => {
  throw new PermissionsException(
    PermissionsExceptionMessage.PERMISSION_DENIED,
    PermissionsExceptionCode.PERMISSION_DENIED,
  );
};

// A nested target is only checked when it connects by id; any other nested input is refused
const findTargetRecordId = (value: unknown): unknown => {
  if (!isPlainObject(value)) {
    return value;
  }

  const { connect } = value;

  return isPlainObject(connect) && isPlainObject(connect.where)
    ? connect.where.id
    : undefined;
};

const findDescribedRecordIdsByObjectMetadataId = ({
  records,
  flatObjectMetadataMaps,
}: {
  records: TimelineActivityMutationInput[];
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): Map<string, Set<string>> => {
  const objectByTargetColumnName = getObjectByTargetColumnName(
    flatObjectMetadataMaps,
  );
  const describedRecordIdsByObjectMetadataId = new Map<string, Set<string>>();

  const addDescribedRecord = (
    flatObjectMetadata: FlatObjectMetadata | undefined,
    recordId: unknown,
  ) => {
    if (!isDefined(flatObjectMetadata) || !isNonEmptyString(recordId)) {
      return throwPermissionDenied();
    }

    const recordIds =
      describedRecordIdsByObjectMetadataId.get(flatObjectMetadata.id) ??
      new Set<string>();

    recordIds.add(recordId);
    describedRecordIdsByObjectMetadataId.set(flatObjectMetadata.id, recordIds);
  };

  for (const record of records) {
    for (const [fieldName, value] of Object.entries(record)) {
      if (fieldName.startsWith('target') && isDefined(value)) {
        addDescribedRecord(
          objectByTargetColumnName.get(fieldName) ??
            objectByTargetColumnName.get(`${fieldName}Id`),
          findTargetRecordId(value),
        );
      }
    }

    if (isNonEmptyString(record.linkedObjectMetadataId)) {
      addDescribedRecord(
        findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: record.linkedObjectMetadataId,
          flatEntityMaps: flatObjectMetadataMaps,
        }),
        record.linkedRecordId,
      );
    }
  }

  return describedRecordIdsByObjectMetadataId;
};

// A timeline entry speaks for the records it describes, so only those who may edit them can add one
@Injectable()
export class TimelineActivityWriteAuthorizationService {
  constructor(
    private readonly principalPermissionsReadService: PrincipalPermissionsReadService,
    private readonly recordPermissionsReadService: RecordPermissionsReadService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async assertMayDescribeRecordsOrThrow({
    authContext,
    records,
  }: {
    authContext: WorkspaceAuthContext;
    records: TimelineActivityMutationInput[];
  }): Promise<void> {
    if (isSystemAuthContext(authContext) || records.length === 0) {
      return;
    }

    const principals =
      await this.principalPermissionsReadService.resolvePermissionsPrincipals({
        authContext,
      });

    if (!isDefined(principals)) {
      return throwPermissionDenied();
    }

    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(
        authContext.workspace.id,
        ['flatObjectMetadataMaps'],
      );

    const describedRecordIdsByObjectMetadataId =
      findDescribedRecordIdsByObjectMetadataId({
        records,
        flatObjectMetadataMaps,
      });

    const canUpdateDescribedRecords = await Promise.all(
      [...describedRecordIdsByObjectMetadataId].map(
        ([objectMetadataId, recordIds]) =>
          this.recordPermissionsReadService.canAccessRecords({
            principals,
            objectMetadataId,
            operationType: 'update',
            recordIds: [...recordIds],
          }),
      ),
    );

    if (canUpdateDescribedRecords.includes(false)) {
      throwPermissionDenied();
    }
  }
}
