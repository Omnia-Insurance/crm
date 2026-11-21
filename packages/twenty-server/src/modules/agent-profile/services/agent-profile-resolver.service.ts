import { Injectable, Logger } from '@nestjs/common';

import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { getJoinColumnNameForRelationField } from 'src/engine/metadata-modules/field-metadata/utils/get-join-column-name-for-relation-field.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { getFlatFieldsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/utils/get-flat-fields-for-flat-object-metadata.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// Brokerage names the object agentProfile; agent is the planned rename
const AGENT_PROFILE_OBJECT_NAMES = ['agentProfile', 'agent'];

type AgentProfileWorkspaceMemberLink = {
  agentProfileObjectNameSingular: string;
  workspaceMemberJoinColumnName: string;
};

@Injectable()
export class AgentProfileResolverService {
  private readonly logger = new Logger(AgentProfileResolverService.name);

  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  async resolveAgentProfileId({
    workspaceId,
    workspaceMemberId,
  }: {
    workspaceId: string;
    workspaceMemberId: string;
  }): Promise<string | null> {
    try {
      const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
        await this.workspaceCacheService.getOrRecompute(workspaceId, [
          'flatObjectMetadataMaps',
          'flatFieldMetadataMaps',
        ]);

      const agentProfileWorkspaceMemberLink =
        this.findAgentProfileWorkspaceMemberLink({
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        });

      if (!isDefined(agentProfileWorkspaceMemberLink)) {
        this.logger.warn(
          `No agent profile object linked to workspace members in workspace ${workspaceId}`,
        );

        return null;
      }

      const { agentProfileObjectNameSingular, workspaceMemberJoinColumnName } =
        agentProfileWorkspaceMemberLink;

      const agentProfile =
        await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
          // System lookup: ownership stamping needs the caller's profile even when their role cannot read it
          const agentProfileRepository =
            this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
              agentProfileObjectNameSingular,
            );

          return agentProfileRepository.findOne({
            where: { [workspaceMemberJoinColumnName]: workspaceMemberId },
            select: ['id'],
          });
        }, buildSystemAuthContext(workspaceId));

      if (!isDefined(agentProfile)) {
        this.logger.warn(
          `No agent profile found for workspace member ${workspaceMemberId} in workspace ${workspaceId}`,
        );

        return null;
      }

      return agentProfile.id;
    } catch (error) {
      this.logger.error(
        `Failed to resolve agent profile for workspace member ${workspaceMemberId} in workspace ${workspaceId}`,
        error instanceof Error ? error.stack : undefined,
      );

      return null;
    }
  }

  private findAgentProfileWorkspaceMemberLink({
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
  }: {
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  }): AgentProfileWorkspaceMemberLink | undefined {
    const { idByNameSingular } = buildObjectIdByNameMaps(
      flatObjectMetadataMaps,
    );
    const workspaceMemberObjectMetadataId = idByNameSingular.workspaceMember;

    const agentProfileFlatObjectMetadata = AGENT_PROFILE_OBJECT_NAMES.map(
      (objectNameSingular) => idByNameSingular[objectNameSingular],
    )
      .filter(isDefined)
      .map((objectMetadataId) =>
        findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: objectMetadataId,
          flatEntityMaps: flatObjectMetadataMaps,
        }),
      )
      .find((flatObjectMetadata) => flatObjectMetadata?.isActive === true);

    if (
      !isDefined(workspaceMemberObjectMetadataId) ||
      !isDefined(agentProfileFlatObjectMetadata)
    ) {
      return undefined;
    }

    const workspaceMemberRelationFields = getFlatFieldsFromFlatObjectMetadata(
      agentProfileFlatObjectMetadata,
      flatFieldMetadataMaps,
    ).filter(
      (flatFieldMetadata) =>
        flatFieldMetadata.isActive &&
        isFlatFieldMetadataOfType(
          flatFieldMetadata,
          FieldMetadataType.RELATION,
        ) &&
        flatFieldMetadata.settings?.relationType === RelationType.MANY_TO_ONE &&
        flatFieldMetadata.relationTargetObjectMetadataId ===
          workspaceMemberObjectMetadataId,
    );

    // agentProfile.manager also targets workspaceMember: pick the relation the RLS hop reads (contract C2)
    const workspaceMemberRelationField =
      workspaceMemberRelationFields.find(
        ({ name }) => name === 'workspaceMember',
      ) ??
      (workspaceMemberRelationFields.length === 1
        ? workspaceMemberRelationFields[0]
        : undefined);

    if (!isDefined(workspaceMemberRelationField)) {
      return undefined;
    }

    return {
      agentProfileObjectNameSingular:
        agentProfileFlatObjectMetadata.nameSingular,
      workspaceMemberJoinColumnName: getJoinColumnNameForRelationField(
        workspaceMemberRelationField,
      ),
    };
  }
}
