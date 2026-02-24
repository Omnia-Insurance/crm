import type { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

export async function lookupCarrierProductCommission(
  carrierId: string | null,
  productId: string | null,
  workspaceId: string,
  globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
): Promise<{ amountMicros: number; currencyCode: string } | null> {
  if (!carrierId || !productId) {
    return null;
  }

  let carrierProductRepo;

  try {
    carrierProductRepo = await globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'carrierProduct',
      { shouldBypassPermissionChecks: true },
    );
  } catch {
    return null;
  }

  const carrierProduct = await carrierProductRepo.findOne({
    where: {
      carrierId,
      productId,
    },
  });

  if (!carrierProduct) {
    return null;
  }

  const record = carrierProduct as Record<string, unknown>;
  const amountMicros = record.commissionAmountMicros as number | null;
  const currencyCode = record.commissionCurrencyCode as string | null;

  if (!amountMicros || amountMicros <= 0) {
    return null;
  }

  return {
    amountMicros,
    currencyCode: currencyCode || 'USD',
  };
}
