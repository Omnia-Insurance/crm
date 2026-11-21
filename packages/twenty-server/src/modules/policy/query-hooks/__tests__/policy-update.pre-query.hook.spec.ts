import { Test, type TestingModule } from '@nestjs/testing';

import {
  type ApiKeyWorkspaceAuthContext,
  type UserWorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { PolicyUpdateManyPreQueryHook } from 'src/modules/policy/query-hooks/policy-update-many.pre-query.hook';
import { PolicyUpdateOnePreQueryHook } from 'src/modules/policy/query-hooks/policy-update-one.pre-query.hook';
import { PolicyWriteAuthorizationService } from 'src/modules/policy/services/policy-write-authorization.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const GOLD_POLICY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SILVER_POLICY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_GOLD_POLICY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AMBETTER_CARRIER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OSCAR_CARRIER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const GOLD_PRODUCT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SILVER_PRODUCT_ID = '12121212-1212-4121-8121-121212121212';
const CREATED_AT = '2026-11-18T12:00:00.000Z';

const STORED_POLICIES = [
  {
    id: GOLD_POLICY_ID,
    createdAt: new Date(CREATED_AT),
    carrierId: AMBETTER_CARRIER_ID,
    productId: GOLD_PRODUCT_ID,
  },
  {
    id: OTHER_GOLD_POLICY_ID,
    createdAt: new Date(CREATED_AT),
    carrierId: AMBETTER_CARRIER_ID,
    productId: GOLD_PRODUCT_ID,
  },
  {
    id: SILVER_POLICY_ID,
    createdAt: new Date(CREATED_AT),
    carrierId: AMBETTER_CARRIER_ID,
    productId: SILVER_PRODUCT_ID,
  },
];

const NAMED_RECORDS_BY_OBJECT: Record<string, { id: string; name: string }[]> =
  {
    carrier: [
      { id: AMBETTER_CARRIER_ID, name: 'Ambetter' },
      { id: OSCAR_CARRIER_ID, name: 'Oscar' },
    ],
    product: [
      { id: GOLD_PRODUCT_ID, name: 'Gold' },
      { id: SILVER_PRODUCT_ID, name: 'Silver' },
    ],
  };

const USER_AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
} as UserWorkspaceAuthContext;

const API_KEY_AUTH_CONTEXT = {
  type: 'apiKey',
  workspace: { id: WORKSPACE_ID },
  apiKey: { id: 'api-key-id' },
} as ApiKeyWorkspaceAuthContext;

const findByIds = <TRecord extends { id: string }>(
  records: TRecord[],
  { where }: { where: { id: { value: string[] } } },
) => records.filter(({ id }) => where.id.value.includes(id));

describe('Policy update pre-query hooks: display name', () => {
  let updateOneHook: PolicyUpdateOnePreQueryHook;
  let updateManyHook: PolicyUpdateManyPreQueryHook;
  let assertUserMayUpdatePolicies: jest.Mock;

  beforeEach(async () => {
    assertUserMayUpdatePolicies = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyUpdateOnePreQueryHook,
        PolicyUpdateManyPreQueryHook,
        {
          provide: PolicyWriteAuthorizationService,
          useValue: { assertUserMayUpdatePolicies },
        },
        {
          provide: WorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
              callback(),
            ),
            getRepositoryWithoutPermissionChecks: jest.fn(
              (objectNameSingular: string) => ({
                find: async (options: {
                  where: { id: { value: string[] } };
                }) =>
                  objectNameSingular === 'policy'
                    ? findByIds(STORED_POLICIES, options)
                    : findByIds(
                        NAMED_RECORDS_BY_OBJECT[objectNameSingular] ?? [],
                        options,
                      ),
              }),
            ),
          },
        },
      ],
    }).compile();

    updateOneHook = module.get(PolicyUpdateOnePreQueryHook);
    updateManyHook = module.get(PolicyUpdateManyPreQueryHook);
  });

  describe('updateOne', () => {
    it('names the policy from the new carrier and its stored product', async () => {
      const result = await updateOneHook.execute(USER_AUTH_CONTEXT, 'policy', {
        id: SILVER_POLICY_ID,
        data: { carrierId: OSCAR_CARRIER_ID, productId: undefined },
      });

      expect(result.data).toEqual({
        carrierId: OSCAR_CARRIER_ID,
        productId: undefined,
        name: 'Oscar - Silver',
      });
      expect(assertUserMayUpdatePolicies).toHaveBeenCalledWith({
        authContext: USER_AUTH_CONTEXT,
        policies: [
          {
            id: SILVER_POLICY_ID,
            createdAt: CREATED_AT,
            carrierId: AMBETTER_CARRIER_ID,
            productId: SILVER_PRODUCT_ID,
          },
        ],
      });
    });

    it('takes a product cleared in the same update over the stored one', async () => {
      const result = await updateOneHook.execute(USER_AUTH_CONTEXT, 'policy', {
        id: SILVER_POLICY_ID,
        data: { carrierId: OSCAR_CARRIER_ID, productId: null },
      });

      expect(result.data.name).toBe('Oscar - Unknown');
    });

    it('names the policy for an API key context too', async () => {
      const result = await updateOneHook.execute(
        API_KEY_AUTH_CONTEXT,
        'policy',
        { id: GOLD_POLICY_ID, data: { productId: SILVER_PRODUCT_ID } },
      );

      expect(result.data.name).toBe('Ambetter - Silver');
    });

    it('leaves the name alone when neither carrier nor product changes', async () => {
      const result = await updateOneHook.execute(USER_AUTH_CONTEXT, 'policy', {
        id: GOLD_POLICY_ID,
        data: { premium: 100 },
      });

      expect(result.data).toEqual({ premium: 100 });
    });
  });

  describe('updateMany', () => {
    const updatePolicies = (
      policyIds: string[],
      data: Record<string, unknown>,
    ) =>
      updateManyHook.execute(USER_AUTH_CONTEXT, 'policy', {
        filter: { id: { in: policyIds } },
        data,
      });

    it('writes one name when every policy shares the unchanged product', async () => {
      const result = await updatePolicies(
        [GOLD_POLICY_ID, OTHER_GOLD_POLICY_ID],
        { carrierId: OSCAR_CARRIER_ID, productId: undefined },
      );

      expect(result.data.name).toBe('Oscar - Gold');
    });

    it('leaves the names alone when the policies have different products', async () => {
      const result = await updatePolicies([GOLD_POLICY_ID, SILVER_POLICY_ID], {
        carrierId: OSCAR_CARRIER_ID,
      });

      expect(result.data).toEqual({ carrierId: OSCAR_CARRIER_ID });
    });

    it('writes one name when both carrier and product change', async () => {
      const result = await updatePolicies([GOLD_POLICY_ID, SILVER_POLICY_ID], {
        carrierId: OSCAR_CARRIER_ID,
        productId: SILVER_PRODUCT_ID,
      });

      expect(result.data.name).toBe('Oscar - Silver');
    });
  });
});
