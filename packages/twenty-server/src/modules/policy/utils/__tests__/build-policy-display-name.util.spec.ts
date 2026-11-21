import { In } from 'typeorm';

import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  buildPolicyDisplayName,
  buildPolicyDisplayNames,
} from 'src/modules/policy/utils/build-policy-display-name.util';

const AMBETTER_CARRIER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLANK_CARRIER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GOLD_PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNKNOWN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const NAMED_RECORDS_BY_OBJECT: Record<
  string,
  { id: string; name: string | null }[]
> = {
  carrier: [
    { id: AMBETTER_CARRIER_ID, name: '  Ambetter ' },
    { id: BLANK_CARRIER_ID, name: null },
  ],
  product: [{ id: GOLD_PRODUCT_ID, name: 'Gold' }],
};

describe('buildPolicyDisplayName', () => {
  let find: jest.Mock;
  let getRepositoryWithoutPermissionChecks: jest.Mock;
  let workspaceOrmManager: WorkspaceOrmManager;

  beforeEach(() => {
    find = jest.fn();
    getRepositoryWithoutPermissionChecks = jest.fn(
      (objectNameSingular: string) => ({
        find: async (options: { where: { id: { value: string[] } } }) => {
          find(objectNameSingular, options);

          return (NAMED_RECORDS_BY_OBJECT[objectNameSingular] ?? []).filter(
            ({ id }) => options.where.id.value.includes(id),
          );
        },
      }),
    );
    workspaceOrmManager = {
      getRepositoryWithoutPermissionChecks,
    } as unknown as WorkspaceOrmManager;
  });

  it.each([
    [
      'the carrier and product names',
      { carrierId: AMBETTER_CARRIER_ID, productId: GOLD_PRODUCT_ID },
      'Ambetter - Gold',
    ],
    [
      'Unknown for a missing product',
      { carrierId: AMBETTER_CARRIER_ID },
      'Ambetter - Unknown',
    ],
    [
      'Unknown for a missing carrier',
      { productId: GOLD_PRODUCT_ID },
      'Unknown - Gold',
    ],
    [
      'Unknown for a carrier without a name',
      { carrierId: BLANK_CARRIER_ID, productId: GOLD_PRODUCT_ID },
      'Unknown - Gold',
    ],
  ])('joins %s', async (_label, policy, expectedName) => {
    await expect(
      buildPolicyDisplayName(policy, workspaceOrmManager),
    ).resolves.toBe(expectedName);
  });

  it.each([
    ['no carrier or product', {}],
    [
      'ids that match nothing',
      { carrierId: UNKNOWN_ID, productId: UNKNOWN_ID },
    ],
    ['a carrier without a name', { carrierId: BLANK_CARRIER_ID }],
  ])('returns null for %s', async (_label, policy) => {
    await expect(
      buildPolicyDisplayName(policy, workspaceOrmManager),
    ).resolves.toBeNull();
  });

  it('reads each object once for a batch, without permission checks', async () => {
    await expect(
      buildPolicyDisplayNames(
        [
          { carrierId: AMBETTER_CARRIER_ID, productId: GOLD_PRODUCT_ID },
          { carrierId: AMBETTER_CARRIER_ID, productId: null },
          { productId: GOLD_PRODUCT_ID },
          { status: 'ACTIVE' },
        ],
        workspaceOrmManager,
      ),
    ).resolves.toEqual([
      'Ambetter - Gold',
      'Ambetter - Unknown',
      'Unknown - Gold',
      null,
    ]);
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledWith('carrier', {
      where: { id: In([AMBETTER_CARRIER_ID]) },
      select: ['id', 'name'],
    });
    expect(find).toHaveBeenCalledWith('product', {
      where: { id: In([GOLD_PRODUCT_ID]) },
      select: ['id', 'name'],
    });
  });

  it('reads nothing when no policy has a carrier or product', async () => {
    await buildPolicyDisplayNames([{ status: 'ACTIVE' }], workspaceOrmManager);

    expect(getRepositoryWithoutPermissionChecks).not.toHaveBeenCalled();
  });
});
