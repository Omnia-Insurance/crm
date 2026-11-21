import { Parent, ResolveField } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { findManyFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-many-flat-entity-by-id-in-flat-entity-maps.util';
import { isPermissionFlagGrantedToFlatRole } from 'src/engine/metadata-modules/flat-role/utils/is-permission-flag-granted-to-flat-role.util';
import { resolveEffectiveFlatEntityProperty } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity-property.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { ObjectSidebarVisibilityDTO } from 'src/modules/role-object-settings/dtos/object-sidebar-visibility.dto';
import { resolveShowInSidebar } from 'src/modules/role-object-settings/utils/resolve-show-in-sidebar.util';

@MetadataResolver(() => UserWorkspaceEntity)
export class UserWorkspaceSidebarVisibilityResolver {
  constructor(private readonly workspaceCacheService: WorkspaceCacheService) {}

  @ResolveField(() => [ObjectSidebarVisibilityDTO])
  async objectSidebarVisibility(
    @Parent() userWorkspace: UserWorkspaceEntity,
    @AuthWorkspace({ allowUndefined: true })
    workspace: WorkspaceEntity | undefined,
    @AuthUserWorkspaceId({ allowUndefined: true })
    userWorkspaceId: string | undefined,
  ): Promise<ObjectSidebarVisibilityDTO[]> {
    // User.workspaces exposes every membership row; only the caller's own is resolved
    if (!isDefined(workspace) || userWorkspace.id !== userWorkspaceId) {
      return [];
    }

    const {
      userWorkspaceRoleMap,
      flatRoleMaps,
      flatRolePermissionFlagMaps,
      flatObjectPermissionMaps,
      flatObjectMetadataMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspace.id, [
      'userWorkspaceRoleMap',
      'flatRoleMaps',
      'flatRolePermissionFlagMaps',
      'flatObjectPermissionMaps',
      'flatObjectMetadataMaps',
    ]);

    const roleId = userWorkspaceRoleMap[userWorkspace.id];
    const flatRole = isDefined(roleId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: roleId,
          flatEntityMaps: flatRoleMaps,
        })
      : undefined;

    // No role while the workspace is being created; throwing here would null currentUserWorkspace
    if (!isDefined(flatRole)) {
      return [];
    }

    const isWorkflowsPermissionGranted = isPermissionFlagGrantedToFlatRole({
      flatRole,
      permissionFlag: PermissionFlagType.WORKFLOWS,
      flatRolePermissionFlagMaps,
    });

    const flatObjectPermissionByObjectMetadataId = new Map(
      findManyFlatEntityByIdInFlatEntityMaps({
        flatEntityIds: flatRole.objectPermissionIds,
        flatEntityMaps: flatObjectPermissionMaps,
      }).map((flatObjectPermission) => [
        flatObjectPermission.objectMetadataId,
        flatObjectPermission,
      ]),
    );

    // A standard object turned back on keeps isActive false and records the change as a workspace override
    return Object.values(flatObjectMetadataMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter((flatObjectMetadata) =>
        resolveEffectiveFlatEntityProperty({
          metadataName: 'objectMetadata',
          flatEntity: flatObjectMetadata,
          property: 'isActive',
        }),
      )
      .map((flatObjectMetadata) => ({
        objectMetadataId: flatObjectMetadata.id,
        showInSidebar: resolveShowInSidebar({
          flatObjectMetadata,
          flatRole,
          flatObjectPermission: flatObjectPermissionByObjectMetadataId.get(
            flatObjectMetadata.id,
          ),
          isWorkflowsPermissionGranted,
        }),
      }));
  }
}
