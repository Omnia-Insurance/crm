import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceCacheResult } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { findUpsertMatchingRecordIds } from 'src/modules/omnia/utils/find-upsert-matching-record-ids.util';

type AgentProfileAssignmentRecord = CreateManyResolverArgs['data'][number];

type AssignmentMetadataMaps = WorkspaceCacheResult<
  ['flatObjectMetadataMaps', 'flatFieldMetadataMapsOrm', 'flatIndexMaps']
>;

@Injectable()
export class AgentProfileAssignmentService {
  constructor(
    private readonly agentProfileResolverService: AgentProfileResolverService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  // Stamps the caller's agent profile on rows that will be inserted. An upserted row
  // that matches an existing record keeps its owner, so CSV re-imports never reassign it.
  async assignAgentProfileToNewRecords({
    authContext,
    objectNameSingular,
    agentFieldName,
    records,
    isUpsert,
  }: {
    authContext: WorkspaceAuthContext;
    objectNameSingular: string;
    agentFieldName: string;
    records: AgentProfileAssignmentRecord[];
    isUpsert: boolean;
  }): Promise<void> {
    if (!isUserAuthContext(authContext)) {
      return;
    }

    const recordsWithoutAgentId = records.filter(
      (record) => !isDefined(record[agentFieldName]),
    );

    if (recordsWithoutAgentId.length === 0) {
      return;
    }

    const workspaceId = authContext.workspace.id;
    const metadataMaps = await this.workspaceCacheService.getOrRecompute(
      workspaceId,
      ['flatObjectMetadataMaps', 'flatFieldMetadataMapsOrm', 'flatIndexMaps'],
    );

    const flatObjectMetadata = this.findFlatObjectMetadata({
      objectNameSingular,
      metadataMaps,
    });

    if (!isDefined(flatObjectMetadata)) {
      return;
    }

    const agentRelationFieldName = this.findAgentRelationFieldName({
      flatObjectMetadata,
      agentFieldName,
      metadataMaps,
    });

    // A nested connect, create or disconnect on the relation already decides the agent
    const unassignedRecords = recordsWithoutAgentId.filter(
      (record) =>
        !isDefined(agentRelationFieldName) ||
        !isDefined(record[agentRelationFieldName]),
    );

    const recordsToInsert = isUpsert
      ? await this.filterRecordsWithoutExistingMatch({
          workspaceId,
          flatObjectMetadata,
          metadataMaps,
          records: unassignedRecords,
        })
      : unassignedRecords;

    if (recordsToInsert.length === 0) {
      return;
    }

    const agentProfileId =
      await this.agentProfileResolverService.resolveAgentProfileId({
        workspaceId,
        workspaceMemberId: authContext.workspaceMemberId,
      });

    if (!isDefined(agentProfileId)) {
      return;
    }

    for (const record of recordsToInsert) {
      record[agentFieldName] = agentProfileId;
    }
  }

  private findFlatObjectMetadata({
    objectNameSingular,
    metadataMaps,
  }: {
    objectNameSingular: string;
    metadataMaps: AssignmentMetadataMaps;
  }): FlatObjectMetadata | undefined {
    const objectMetadataId = buildObjectIdByNameMaps(
      metadataMaps.flatObjectMetadataMaps,
    ).idByNameSingular[objectNameSingular];

    return isDefined(objectMetadataId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: objectMetadataId,
          flatEntityMaps: metadataMaps.flatObjectMetadataMaps,
        })
      : undefined;
  }

  private findAgentRelationFieldName({
    flatObjectMetadata,
    agentFieldName,
    metadataMaps,
  }: {
    flatObjectMetadata: FlatObjectMetadata;
    agentFieldName: string;
    metadataMaps: AssignmentMetadataMaps;
  }): string | undefined {
    const agentRelationFieldId = buildFieldMapsFromFlatObjectMetadata(
      metadataMaps.flatFieldMetadataMapsOrm,
      flatObjectMetadata,
    ).fieldIdByJoinColumnName[agentFieldName];

    return isDefined(agentRelationFieldId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: agentRelationFieldId,
          flatEntityMaps: metadataMaps.flatFieldMetadataMapsOrm,
        })?.name
      : undefined;
  }

  private async filterRecordsWithoutExistingMatch({
    workspaceId,
    flatObjectMetadata,
    metadataMaps,
    records,
  }: {
    workspaceId: string;
    flatObjectMetadata: FlatObjectMetadata;
    metadataMaps: AssignmentMetadataMaps;
    records: AgentProfileAssignmentRecord[];
  }): Promise<AgentProfileAssignmentRecord[]> {
    const matchingRecordIds = await findUpsertMatchingRecordIds({
      workspaceId,
      flatObjectMetadata,
      flatFieldMetadataMaps: metadataMaps.flatFieldMetadataMapsOrm,
      flatIndexMaps: metadataMaps.flatIndexMaps,
      records,
      workspaceOrmManager: this.workspaceOrmManager,
    });

    return records.filter(
      (_record, index) => !isDefined(matchingRecordIds[index]),
    );
  }
}
