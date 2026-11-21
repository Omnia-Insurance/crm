import { Logger } from '@nestjs/common';

import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

const CARRIER_ID = 'carrier-id';
const PRODUCT_ID = 'product-id';

describe('lookupCarrierProductCommission', () => {
  let find: jest.Mock;
  let getRepositoryWithoutPermissionChecks: jest.Mock;
  let workspaceOrmManager: WorkspaceOrmManager;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    find = jest.fn().mockResolvedValue([]);
    getRepositoryWithoutPermissionChecks = jest.fn().mockReturnValue({ find });
    workspaceOrmManager = {
      getRepositoryWithoutPermissionChecks,
    } as unknown as WorkspaceOrmManager;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the carrier product commission without permission checks', async () => {
    find.mockResolvedValue([
      { commission: { amountMicros: 250_000_000, currencyCode: 'USD' } },
    ]);

    await expect(
      lookupCarrierProductCommission(
        CARRIER_ID,
        PRODUCT_ID,
        workspaceOrmManager,
      ),
    ).resolves.toEqual({ amountMicros: 250_000_000, currencyCode: 'USD' });
    expect(getRepositoryWithoutPermissionChecks).toHaveBeenCalledWith(
      'carrierProduct',
    );
    expect(find).toHaveBeenCalledWith({
      where: { carrierId: CARRIER_ID, productId: PRODUCT_ID },
    });
  });

  it('picks the first carrier product with a positive commission', async () => {
    find.mockResolvedValue([
      { commission: { amountMicros: 0, currencyCode: 'USD' } },
      { commission: null },
      { commission: { amountMicros: 90_000_000, currencyCode: 'EUR' } },
      { commission: { amountMicros: 120_000_000, currencyCode: 'USD' } },
    ]);

    await expect(
      lookupCarrierProductCommission(
        CARRIER_ID,
        PRODUCT_ID,
        workspaceOrmManager,
      ),
    ).resolves.toEqual({ amountMicros: 90_000_000, currencyCode: 'EUR' });
  });

  it('defaults the currency to USD', async () => {
    find.mockResolvedValue([
      { commission: { amountMicros: 90_000_000, currencyCode: '' } },
    ]);

    await expect(
      lookupCarrierProductCommission(
        CARRIER_ID,
        PRODUCT_ID,
        workspaceOrmManager,
      ),
    ).resolves.toEqual({ amountMicros: 90_000_000, currencyCode: 'USD' });
  });

  it('returns null when no carrier product has a positive commission', async () => {
    find.mockResolvedValue([
      { commission: { amountMicros: 0, currencyCode: 'USD' } },
      { commission: { amountMicros: null, currencyCode: 'USD' } },
    ]);

    await expect(
      lookupCarrierProductCommission(
        CARRIER_ID,
        PRODUCT_ID,
        workspaceOrmManager,
      ),
    ).resolves.toBeNull();
  });

  it.each([
    [null, PRODUCT_ID],
    [CARRIER_ID, null],
    ['', PRODUCT_ID],
  ])(
    'returns null without a lookup for carrier %p and product %p',
    async (carrierId, productId) => {
      await expect(
        lookupCarrierProductCommission(
          carrierId,
          productId,
          workspaceOrmManager,
        ),
      ).resolves.toBeNull();
      expect(getRepositoryWithoutPermissionChecks).not.toHaveBeenCalled();
    },
  );

  it('returns null when the workspace has no carrier product object', async () => {
    getRepositoryWithoutPermissionChecks.mockImplementation(() => {
      throw new Error('Object metadata not found for carrierProduct');
    });

    await expect(
      lookupCarrierProductCommission(
        CARRIER_ID,
        PRODUCT_ID,
        workspaceOrmManager,
      ),
    ).resolves.toBeNull();
    expect(find).not.toHaveBeenCalled();
  });
});
