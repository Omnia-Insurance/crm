import { Logger } from '@nestjs/common';

import { In } from 'typeorm';

import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { enrichPolicyAfterSave } from 'src/modules/policy/utils/enrich-policy-after-save.util';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

jest.mock(
  'src/modules/policy/utils/lookup-carrier-product-commission.util',
  () => ({ lookupCarrierProductCommission: jest.fn() }),
);

const NEW_POLICY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRICED_POLICY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARRIERLESS_POLICY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CARRIER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PRODUCT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const COMMISSION = { amountMicros: 450_000_000, currencyCode: 'USD' };

const STORED_POLICIES = [
  {
    id: NEW_POLICY_ID,
    carrierId: CARRIER_ID,
    productId: PRODUCT_ID,
    ltv: { amountMicros: null, currencyCode: '' },
  },
  {
    id: PRICED_POLICY_ID,
    carrierId: CARRIER_ID,
    productId: PRODUCT_ID,
    ltv: COMMISSION,
  },
  {
    id: CARRIERLESS_POLICY_ID,
    carrierId: null,
    productId: PRODUCT_ID,
    ltv: null,
  },
];

describe('enrichPolicyAfterSave', () => {
  let find: jest.Mock;
  let updateMany: jest.Mock;
  let getRepositoryWithoutPermissionChecks: jest.Mock;
  let workspaceOrmManager: WorkspaceOrmManager;

  beforeEach(() => {
    find = jest.fn().mockResolvedValue(STORED_POLICIES);
    updateMany = jest.fn().mockResolvedValue({ affected: 1 });
    getRepositoryWithoutPermissionChecks = jest
      .fn()
      .mockReturnValue({ find, updateMany });
    workspaceOrmManager = {
      getRepositoryWithoutPermissionChecks,
    } as unknown as WorkspaceOrmManager;
    jest.mocked(lookupCarrierProductCommission).mockResolvedValue(COMMISSION);
  });

  const enrich = (policyIds: string[]) =>
    enrichPolicyAfterSave(
      policyIds.map((id) => ({ id })),
      workspaceOrmManager,
    );

  it('reads the stored policies back instead of trusting the selected fields', async () => {
    await enrich([NEW_POLICY_ID, PRICED_POLICY_ID, NEW_POLICY_ID]);

    expect(getRepositoryWithoutPermissionChecks).toHaveBeenCalledWith('policy');
    expect(find).toHaveBeenCalledWith({
      where: { id: In([NEW_POLICY_ID, PRICED_POLICY_ID]) },
      select: [
        'id',
        'carrierId',
        'productId',
        'ltvAmountMicros',
        'ltvCurrencyCode',
      ],
    });
  });

  it('stamps the LTV only where it differs from the commission, with one lookup per carrier and product', async () => {
    await enrich([NEW_POLICY_ID, PRICED_POLICY_ID, CARRIERLESS_POLICY_ID]);

    expect(lookupCarrierProductCommission).toHaveBeenCalledTimes(1);
    expect(lookupCarrierProductCommission).toHaveBeenCalledWith(
      CARRIER_ID,
      PRODUCT_ID,
      workspaceOrmManager,
    );
    expect(updateMany).toHaveBeenCalledWith([
      { criteria: NEW_POLICY_ID, partialEntity: { ltv: COMMISSION } },
    ]);
  });

  it('writes nothing when no commission applies', async () => {
    jest.mocked(lookupCarrierProductCommission).mockResolvedValue(null);

    await enrich([NEW_POLICY_ID, PRICED_POLICY_ID]);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('opens no repository for a payload without ids', async () => {
    await enrichPolicyAfterSave([], workspaceOrmManager);

    expect(getRepositoryWithoutPermissionChecks).not.toHaveBeenCalled();
  });

  it('logs a failure without failing the saved write', async () => {
    const loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    updateMany.mockRejectedValue(new Error('database unavailable'));

    await expect(enrich([NEW_POLICY_ID])).resolves.toBeUndefined();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Could not enrich 1 saved policies',
      expect.any(String),
    );

    loggerErrorSpy.mockRestore();
  });
});
