import { Injectable } from '@nestjs/common';

import { isString } from '@sniptt/guards';
import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { isRecordFilterEmpty } from 'src/engine/api/common/common-query-runners/utils/is-record-filter-empty.util';
import { GraphqlQueryParser } from 'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query.parser';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { findFlatEntityByIdInFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps-or-throw.util';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type PolicyUpdateTargetRecord } from 'src/modules/policy/query-hooks/types/policy-update-target-record.type';
import { findPolicyUpdateTargets } from 'src/modules/policy/query-hooks/utils/find-policy-update-targets.util';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';
import { buildPolicyDisplayName } from 'src/modules/policy/utils/build-policy-display-name.util';

type PolicyUpdateManyArgs = UpdateManyResolverArgs<
  Partial<ObjectRecord>,
  Partial<ObjectRecordFilter>
>;

// A bare id list is looked up by id; any other filter is applied the way the runner applies it
const findFilteredPolicyIds = (
  filter: Partial<ObjectRecordFilter>,
): string[] | undefined => {
  const { id: idFilter, ...otherFilters } = filter;

  if (Object.keys(otherFilters).length > 0 || !isPlainObject(idFilter)) {
    return undefined;
  }

  const { in: policyIds, ...otherIdFilters } = idFilter;

  return Object.keys(otherIdFilters).length === 0 &&
    Array.isArray(policyIds) &&
    policyIds.every(isString)
    ? policyIds
    : undefined;
};

@Injectable()
@WorkspaceQueryHook(`policy.updateMany`)
export class PolicyUpdateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly policyWriteAuthorizationService: PolicyWriteAuthorizationService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: PolicyUpdateManyArgs,
  ): Promise<PolicyUpdateManyArgs> {
    const isRenaming =
      isDefined(payload.data.carrierId) || isDefined(payload.data.productId);

    // The runner refuses a missing or empty filter before it writes anything
    if (
      (!isUserAuthContext(authContext) && !isRenaming) ||
      !isDefined(payload.filter) ||
      isRecordFilterEmpty(payload.filter)
    ) {
      return payload;
    }

    const workspaceId = authContext.workspace.id;

    const policies = await findPolicyUpdateTargets({
      workspaceId,
      policyIds:
        findFilteredPolicyIds(payload.filter) ??
        (await this.findPolicyIdsMatchingFilter({
          authContext,
          filter: payload.filter,
        })),
      workspaceOrmManager: this.workspaceOrmManager,
    });

    if (policies.length === 0) {
      return payload;
    }

    await this.policyWriteAuthorizationService.assertUserMayUpdatePolicies({
      authContext,
      policies,
    });

    if (!isRenaming) {
      return payload;
    }

    const displayName = await this.buildSharedDisplayName({
      workspaceId,
      data: payload.data,
      policies,
    });

    if (isDefined(displayName)) {
      payload.data.name = displayName;
    }

    return payload;
  }

  private async findPolicyIdsMatchingFilter({
    authContext,
    filter,
  }: {
    authContext: WorkspaceAuthContext;
    filter: Partial<ObjectRecordFilter>;
  }): Promise<string[]> {
    const policies = await this.workspaceOrmManager.executeInWorkspaceContext(
      () => {
        const {
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
          objectIdByNameSingular,
        } = getWorkspaceContext();
        const queryParser = new GraphqlQueryParser(
          findFlatEntityByIdInFlatEntityMapsOrThrow({
            flatEntityMaps: flatObjectMetadataMaps,
            flatEntityId: objectIdByNameSingular.policy,
          }),
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        );
        // Permission-checked, so a filter never reaches policies the caller cannot read
        const queryBuilder = this.workspaceOrmManager
          .getRepository('policy')
          .createQueryBuilder('policy');

        queryParser.applyFilterToBuilder(queryBuilder, 'policy', filter);

        // A larger match fails either here or at the runner's update limit, so one extra row is enough
        return queryBuilder
          .withDeleted()
          .select(['id'])
          .limit(QUERY_MAX_RECORDS + 1)
          .getMany<Pick<ObjectRecord, 'id'>>();
      },
      authContext,
    );

    return policies.map(({ id }) => id);
  }

  // One name is written to every row, so it is derived only when it fits all of them
  private async buildSharedDisplayName({
    workspaceId,
    data,
    policies,
  }: {
    workspaceId: string;
    data: Partial<ObjectRecord>;
    policies: PolicyUpdateTargetRecord[];
  }): Promise<string | null> {
    const carrierIds: unknown[] =
      data.carrierId === undefined
        ? [...new Set(policies.map(({ carrierId }) => carrierId))]
        : [data.carrierId];
    const productIds: unknown[] =
      data.productId === undefined
        ? [...new Set(policies.map(({ productId }) => productId))]
        : [data.productId];

    if (carrierIds.length !== 1 || productIds.length !== 1) {
      return null;
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        buildPolicyDisplayName(
          { carrierId: carrierIds[0], productId: productIds[0] },
          this.workspaceOrmManager,
        ),
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );
  }
}
