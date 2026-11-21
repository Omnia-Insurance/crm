import { Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

type CarrierProductCommissionRecord = {
  commission?: {
    amountMicros?: number | null;
    currencyCode?: string | null;
  } | null;
};

const logger = new Logger('lookupCarrierProductCommission');

const findCarrierProductRepository = (
  workspaceOrmManager: WorkspaceOrmManager,
): WorkspaceRepository<CarrierProductCommissionRecord> | null => {
  try {
    // System lookup: LTV is stamped from the commission table whatever the caller may read
    return workspaceOrmManager.getRepositoryWithoutPermissionChecks<CarrierProductCommissionRecord>(
      'carrierProduct',
    );
  } catch (error) {
    logger.error(
      'Could not open the carrierProduct repository',
      error instanceof Error ? error.stack : undefined,
    );

    return null;
  }
};

// Callers run inside a workspace context
export const lookupCarrierProductCommission = async (
  carrierId: string | null,
  productId: string | null,
  workspaceOrmManager: WorkspaceOrmManager,
): Promise<{ amountMicros: number; currencyCode: string } | null> => {
  if (!isNonEmptyString(carrierId) || !isNonEmptyString(productId)) {
    return null;
  }

  const carrierProductRepository =
    findCarrierProductRepository(workspaceOrmManager);

  if (!isDefined(carrierProductRepository)) {
    return null;
  }

  const carrierProducts = await carrierProductRepository.find({
    where: { carrierId, productId },
  });

  const commission = carrierProducts.find(
    (carrierProduct) => (carrierProduct.commission?.amountMicros ?? 0) > 0,
  )?.commission;

  if (!commission?.amountMicros || commission.amountMicros <= 0) {
    return null;
  }

  return {
    amountMicros: commission.amountMicros,
    currencyCode: commission.currencyCode || 'USD',
  };
};
