import { isNonEmptyString } from '@sniptt/guards';
import { type ObjectRecord } from 'twenty-shared/types';
import { In } from 'typeorm';

import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

type NamedRecord = {
  id: string;
  name: string | null;
};

const collectIds = (ids: unknown[]): string[] => [
  ...new Set(ids.filter(isNonEmptyString)),
];

const findTrimmedNameById = async (
  objectNameSingular: 'carrier' | 'product',
  ids: string[],
  workspaceOrmManager: WorkspaceOrmManager,
): Promise<Map<string, string>> => {
  if (ids.length === 0) {
    return new Map();
  }

  // System read: a derived policy name must not depend on what the caller may read
  const records = await workspaceOrmManager
    .getRepositoryWithoutPermissionChecks<NamedRecord>(objectNameSingular)
    .find({ where: { id: In(ids) }, select: ['id', 'name'] });

  return new Map(records.map(({ id, name }) => [id, (name ?? '').trim()]));
};

// "{Carrier} - {Product}", the format ingestion writes; callers run inside a workspace context
export const buildPolicyDisplayNames = async (
  policies: Partial<ObjectRecord>[],
  workspaceOrmManager: WorkspaceOrmManager,
): Promise<(string | null)[]> => {
  const [carrierNameById, productNameById] = await Promise.all([
    findTrimmedNameById(
      'carrier',
      collectIds(policies.map(({ carrierId }) => carrierId)),
      workspaceOrmManager,
    ),
    findTrimmedNameById(
      'product',
      collectIds(policies.map(({ productId }) => productId)),
      workspaceOrmManager,
    ),
  ]);

  return policies.map(({ carrierId, productId }) => {
    const carrierName = isNonEmptyString(carrierId)
      ? (carrierNameById.get(carrierId) ?? '')
      : '';
    const productName = isNonEmptyString(productId)
      ? (productNameById.get(productId) ?? '')
      : '';

    if (carrierName === '' && productName === '') {
      return null;
    }

    return `${carrierName || 'Unknown'} - ${productName || 'Unknown'}`;
  });
};

export const buildPolicyDisplayName = async (
  policy: Partial<ObjectRecord>,
  workspaceOrmManager: WorkspaceOrmManager,
): Promise<string | null> => {
  const [displayName] = await buildPolicyDisplayNames(
    [policy],
    workspaceOrmManager,
  );

  return displayName;
};
