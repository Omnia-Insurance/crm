import { In } from 'typeorm';

import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type PolicyUpdateTargetRecord } from 'src/modules/policy/query-hooks/types/policy-update-target-record.type';

type StoredPolicy = Omit<PolicyUpdateTargetRecord, 'createdAt'> & {
  createdAt: Date | string;
};

export const findPolicyUpdateTargets = async ({
  workspaceId,
  policyIds,
  workspaceOrmManager,
}: {
  workspaceId: string;
  policyIds: string[];
  workspaceOrmManager: WorkspaceOrmManager;
}): Promise<PolicyUpdateTargetRecord[]> => {
  if (policyIds.length === 0) {
    return [];
  }

  const policies = await workspaceOrmManager.executeInWorkspaceContext(
    () =>
      // System read of existence and age only: nothing read here reaches the caller
      workspaceOrmManager
        .getRepositoryWithoutPermissionChecks<StoredPolicy>('policy')
        .find({
          where: { id: In(policyIds) },
          select: ['id', 'createdAt', 'carrierId', 'productId'],
          // The update runner writes soft-deleted rows too
          withDeleted: true,
        }),
    buildSystemAuthContext(workspaceId),
    { lite: true },
  );

  return policies.map(({ id, createdAt, carrierId, productId }) => ({
    id,
    createdAt: new Date(createdAt).toISOString(),
    carrierId,
    productId,
  }));
};
