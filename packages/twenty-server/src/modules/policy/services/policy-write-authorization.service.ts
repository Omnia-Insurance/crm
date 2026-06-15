import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { RowLevelPermissionPredicateScope } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { formatDuration } from 'src/modules/policy/utils/format-duration.util';

type PolicyWriteTarget = {
  id: string;
  agentId?: string | null;
  createdAt?: string | Date | null;
};

type AssertUserMayWritePolicyArgs = {
  workspaceId: string;
  userWorkspaceId: string | null | undefined;
  workspaceMemberId: string | null | undefined;
  policy: PolicyWriteTarget;
};

// Centralizes the fork's policy write rules (agent ownership RLS + edit
// window) so the GraphQL pre-query hooks and server-side write paths that
// bypass permission checks (e.g. reconciliation batch apply) enforce the
// exact same restrictions.
@Injectable()
export class PolicyWriteAuthorizationService {
  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly agentProfileResolverService: AgentProfileResolverService,
  ) {}

  async assertUserMayWritePolicy({
    workspaceId,
    userWorkspaceId,
    workspaceMemberId,
    policy,
  }: AssertUserMayWritePolicyArgs): Promise<void> {
    const isAdmin = await this.isUserAdmin(workspaceId, userWorkspaceId);

    await this.assertPolicyAgentOwnership({
      workspaceId,
      userWorkspaceId,
      workspaceMemberId,
      policy,
      isAdmin,
    });

    // Block edits to policies older than the configured edit window for non-admin users
    if (isDefined(policy.createdAt)) {
      const editWindowMinutes = await this.getEditWindowMinutes(
        workspaceId,
        userWorkspaceId,
      );

      if (isDefined(editWindowMinutes)) {
        const createdAt = new Date(policy.createdAt);
        const ageMs = Date.now() - createdAt.getTime();
        const editWindowMs = editWindowMinutes * 60 * 1000;

        if (ageMs > editWindowMs && !isAdmin) {
          const window = formatDuration(editWindowMs);

          throw new ForbiddenError(
            `Policies older than ${window} can only be edited by administrators`,
            {
              userFriendlyMessage: msg`This policy can no longer be edited. Only administrators can modify policies after ${window}.`,
            },
          );
        }
      }
    }
  }

  private async assertPolicyAgentOwnership({
    workspaceId,
    userWorkspaceId,
    workspaceMemberId,
    policy,
    isAdmin,
  }: AssertUserMayWritePolicyArgs & { isAdmin: boolean }): Promise<void> {
    if (
      isAdmin ||
      !isDefined(policy.agentId) ||
      !isDefined(workspaceMemberId)
    ) {
      return;
    }

    const shouldEnforceAgentOwnership = await this.shouldEnforceAgentOwnership(
      workspaceId,
      userWorkspaceId,
    );

    if (!shouldEnforceAgentOwnership) {
      return;
    }

    const agentProfileId =
      await this.agentProfileResolverService.resolveAgentProfileId(
        workspaceId,
        workspaceMemberId,
        buildSystemAuthContext(workspaceId),
      );

    if (agentProfileId === policy.agentId) {
      return;
    }

    throw new ForbiddenError(
      `Editing this record violates row-level security`,
      {
        userFriendlyMessage: msg`Editing this record violates row-level security.`,
      },
    );
  }

  private async shouldEnforceAgentOwnership(
    workspaceId: string,
    userWorkspaceId: string | null | undefined,
  ): Promise<boolean> {
    if (!isDefined(userWorkspaceId)) {
      return false;
    }

    const {
      userWorkspaceRoleMap,
      rolesPermissions,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'userWorkspaceRoleMap',
      'rolesPermissions',
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
    ]);

    const roleId = userWorkspaceRoleMap[userWorkspaceId];

    if (!isDefined(roleId)) {
      return false;
    }

    const policyFlatObjectMetadata = Object.values(
      flatObjectMetadataMaps.byUniversalIdentifier,
    ).find((meta) => meta?.nameSingular === 'policy');

    if (!isDefined(policyFlatObjectMetadata)) {
      return false;
    }

    const objectPermissions =
      rolesPermissions[roleId]?.[policyFlatObjectMetadata.id];

    return (
      objectPermissions?.rowLevelPermissionPredicates?.some((predicate) => {
        if (predicate.scope !== RowLevelPermissionPredicateScope.WRITE) {
          return false;
        }

        const fieldUniversalIdentifier =
          flatFieldMetadataMaps.universalIdentifierById[
            predicate.fieldMetadataId
          ];
        const fieldMetadata = isDefined(fieldUniversalIdentifier)
          ? flatFieldMetadataMaps.byUniversalIdentifier[
              fieldUniversalIdentifier
            ]
          : undefined;

        return (
          fieldMetadata?.name === 'agent' &&
          isDefined(predicate.workspaceMemberFieldMetadataId)
        );
      }) ?? false
    );
  }

  private async getEditWindowMinutes(
    workspaceId: string,
    userWorkspaceId: string | null | undefined,
  ): Promise<number | null> {
    if (!isDefined(userWorkspaceId)) {
      return null;
    }

    const { userWorkspaceRoleMap, rolesPermissions, flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'userWorkspaceRoleMap',
        'rolesPermissions',
        'flatObjectMetadataMaps',
      ]);

    const roleId = userWorkspaceRoleMap[userWorkspaceId];

    if (!isDefined(roleId)) {
      return null;
    }

    const policyFlatObjectMetadata = Object.values(
      flatObjectMetadataMaps.byUniversalIdentifier,
    ).find((meta) => meta?.nameSingular === 'policy');

    if (!isDefined(policyFlatObjectMetadata)) {
      return null;
    }

    const objectPermissions =
      rolesPermissions[roleId]?.[policyFlatObjectMetadata.id];

    return objectPermissions?.editWindowMinutes ?? null;
  }

  private async isUserAdmin(
    workspaceId: string,
    userWorkspaceId: string | null | undefined,
  ): Promise<boolean> {
    if (!isDefined(userWorkspaceId)) {
      return false;
    }

    const { userWorkspaceRoleMap, flatRoleMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'userWorkspaceRoleMap',
        'flatRoleMaps',
      ]);

    const roleId = userWorkspaceRoleMap[userWorkspaceId];

    if (!isDefined(roleId)) {
      return false;
    }

    const universalIdentifier = flatRoleMaps.universalIdentifierById[roleId];

    return universalIdentifier === STANDARD_ROLE.admin.universalIdentifier;
  }
}
