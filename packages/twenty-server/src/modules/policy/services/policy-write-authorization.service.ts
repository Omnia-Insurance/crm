import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { PrincipalPermissionsReadService } from 'src/engine/permissions/principal-permissions-read.service';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceCacheResult } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { findUpsertMatchingRecordIds } from 'src/modules/omnia/utils/find-upsert-matching-record-ids.util';
import { findPolicyUpdateTargets } from 'src/modules/policy/query-hooks/utils/find-policy-update-targets.util';
import { type PolicyUpdateDenial } from 'src/modules/policy/types/policy-update-denial.type';
import { type PolicyUpdateTarget } from 'src/modules/policy/types/policy-update-target.type';
import { formatDuration } from 'src/modules/policy/utils/format-duration.util';
import { resolveEditWindowMinutes } from 'src/modules/role-object-settings/utils/resolve-edit-window-minutes.util';

type PolicyUpdateAuthorizationArgs = {
  authContext: WorkspaceAuthContext;
  policies: PolicyUpdateTarget[];
};

type PolicyUpdateEvaluation = {
  denials: PolicyUpdateDenial[];
  editWindowMinutes: number | null;
};

type EditWindowCacheMaps = WorkspaceCacheResult<
  ['userWorkspaceRoleMap', 'flatRoleMaps', 'flatObjectPermissionMaps']
>;

const isWithinEditWindow = ({
  createdAt,
  editWindowMinutes,
}: {
  createdAt: string;
  editWindowMinutes: number;
}): boolean =>
  Date.now() - new Date(createdAt).getTime() <= editWindowMinutes * 60 * 1000;

// Pre-checks a user's policy edits with the engine's own record permissions, then the
// Omnia edit window (contract C3). Callers pass existing, non-deleted policies; system,
// API-key and application writes are left to the engine, which also enforces the write.
@Injectable()
export class PolicyWriteAuthorizationService {
  constructor(
    private readonly principalPermissionsReadService: PrincipalPermissionsReadService,
    private readonly recordPermissionsReadService: RecordPermissionsReadService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  async assertUserMayUpdatePolicies(
    args: PolicyUpdateAuthorizationArgs,
  ): Promise<void> {
    const { denials, editWindowMinutes } =
      await this.evaluatePolicyUpdates(args);

    // Checked first so the edit-window message never reveals a foreign policy's age
    if (denials.some(({ reason }) => reason === 'row-level-security')) {
      throw new ForbiddenError(
        'Editing this record violates row-level security',
        {
          userFriendlyMessage: msg`Editing this record violates row-level security.`,
        },
      );
    }

    if (denials.length > 0 && isDefined(editWindowMinutes)) {
      const window = formatDuration(editWindowMinutes * 60 * 1000);

      throw new ForbiddenError(
        `Policies older than ${window} can only be edited by administrators`,
        {
          userFriendlyMessage: msg`This policy can no longer be edited. Only administrators can modify policies after ${window}.`,
        },
      );
    }
  }

  // An upserted row that matches a stored policy updates it, so it passes the same checks as an update
  async assertUserMayUpsertPolicies({
    authContext,
    records,
  }: {
    authContext: WorkspaceAuthContext;
    records: Partial<ObjectRecord>[];
  }): Promise<void> {
    if (!isUserAuthContext(authContext) || records.length === 0) {
      return;
    }

    const workspaceId = authContext.workspace.id;
    const { flatObjectMetadataMaps, flatFieldMetadataMapsOrm, flatIndexMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMapsOrm',
        'flatIndexMaps',
      ]);

    const policyObjectMetadataId = buildObjectIdByNameMaps(
      flatObjectMetadataMaps,
    ).idByNameSingular.policy;
    const policyFlatObjectMetadata = isDefined(policyObjectMetadataId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: policyObjectMetadataId,
          flatEntityMaps: flatObjectMetadataMaps,
        })
      : undefined;

    if (!isDefined(policyFlatObjectMetadata)) {
      return;
    }

    const matchingPolicyIds = (
      await findUpsertMatchingRecordIds({
        workspaceId,
        flatObjectMetadata: policyFlatObjectMetadata,
        flatFieldMetadataMaps: flatFieldMetadataMapsOrm,
        flatIndexMaps,
        records,
        workspaceOrmManager: this.workspaceOrmManager,
      })
    ).filter(isDefined);

    if (matchingPolicyIds.length === 0) {
      return;
    }

    await this.assertUserMayUpdatePolicies({
      authContext,
      policies: await findPolicyUpdateTargets({
        workspaceId,
        policyIds: [...new Set(matchingPolicyIds)],
        workspaceOrmManager: this.workspaceOrmManager,
      }),
    });
  }

  async findPolicyUpdateDenials(
    args: PolicyUpdateAuthorizationArgs,
  ): Promise<PolicyUpdateDenial[]> {
    const { denials } = await this.evaluatePolicyUpdates(args);

    return denials;
  }

  private async evaluatePolicyUpdates({
    authContext,
    policies,
  }: PolicyUpdateAuthorizationArgs): Promise<PolicyUpdateEvaluation> {
    if (!isUserAuthContext(authContext) || policies.length === 0) {
      return { denials: [], editWindowMinutes: null };
    }

    const principals =
      await this.principalPermissionsReadService.resolvePermissionsPrincipals({
        authContext,
      });

    // The engine refuses the write itself when the caller resolves to no principals
    if (!isDefined(principals)) {
      return { denials: [], editWindowMinutes: null };
    }

    const {
      flatObjectMetadataMaps,
      userWorkspaceRoleMap,
      flatRoleMaps,
      flatObjectPermissionMaps,
    } = await this.workspaceCacheService.getOrRecompute(
      authContext.workspace.id,
      [
        'flatObjectMetadataMaps',
        'userWorkspaceRoleMap',
        'flatRoleMaps',
        'flatObjectPermissionMaps',
      ],
    );

    const policyObjectMetadataId = buildObjectIdByNameMaps(
      flatObjectMetadataMaps,
    ).idByNameSingular.policy;

    if (!isDefined(policyObjectMetadataId)) {
      return {
        denials: policies.map<PolicyUpdateDenial>(({ id }) => ({
          policyId: id,
          reason: 'row-level-security',
        })),
        editWindowMinutes: null,
      };
    }

    const grantedPolicyIds =
      await this.recordPermissionsReadService.filterGrantedRecordIds({
        principals,
        objectMetadataId: policyObjectMetadataId,
        operationType: 'update',
        recordIds: policies.map(({ id }) => id),
      });

    const editWindowMinutes = this.findEditWindowMinutes({
      authContext,
      policyObjectMetadataId,
      userWorkspaceRoleMap,
      flatRoleMaps,
      flatObjectPermissionMaps,
    });

    const denials = policies.flatMap<PolicyUpdateDenial>(
      ({ id, createdAt }) => {
        if (!grantedPolicyIds.has(id.toLowerCase())) {
          return [{ policyId: id, reason: 'row-level-security' }];
        }

        if (
          isDefined(editWindowMinutes) &&
          !isWithinEditWindow({ createdAt, editWindowMinutes })
        ) {
          return [{ policyId: id, reason: 'edit-window' }];
        }

        return [];
      },
    );

    return { denials, editWindowMinutes };
  }

  private findEditWindowMinutes({
    authContext,
    policyObjectMetadataId,
    userWorkspaceRoleMap,
    flatRoleMaps,
    flatObjectPermissionMaps,
  }: EditWindowCacheMaps & {
    authContext: UserWorkspaceAuthContext;
    policyObjectMetadataId: string;
  }): number | null {
    const roleId = userWorkspaceRoleMap[authContext.userWorkspaceId];
    const flatRole = isDefined(roleId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: roleId,
          flatEntityMaps: flatRoleMaps,
        })
      : undefined;

    if (
      !isDefined(flatRole) ||
      flatRole.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier
    ) {
      return null;
    }

    const flatObjectPermission = Object.values(
      flatObjectPermissionMaps.byUniversalIdentifier,
    ).find(
      (objectPermission) =>
        isDefined(objectPermission) &&
        objectPermission.roleId === flatRole.id &&
        objectPermission.objectMetadataId === policyObjectMetadataId,
    );

    return resolveEditWindowMinutes({ flatRole, flatObjectPermission });
  }
}
