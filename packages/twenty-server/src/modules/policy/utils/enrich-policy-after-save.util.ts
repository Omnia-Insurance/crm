import { isDefined } from 'twenty-shared/utils';

import type { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

// Enriches policy records after save: derives name from carrier + product,
// and stamps LTV from CarrierProduct commission.
// Uses bypassed permissions so it works regardless of field-level role settings.
export async function enrichPolicyAfterSave(
  records: Record<string, unknown>[],
  workspaceId: string,
  globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
): Promise<void> {
  const policyRepo = await globalWorkspaceOrmManager.getRepository(
    workspaceId,
    'policy',
    { shouldBypassPermissionChecks: true },
  );

  for (const record of records) {
    const carrierId = record.carrierId as string | null | undefined;
    const productId = record.productId as string | null | undefined;
    const id = record.id as string;

    const updates: Record<string, unknown> = {};

    // Derive display name from carrier + product
    if (isDefined(carrierId) || isDefined(productId)) {
      const displayName = await buildPolicyDisplayName(
        carrierId ?? null,
        productId ?? null,
        workspaceId,
        globalWorkspaceOrmManager,
      );

      if (displayName) {
        updates.name = displayName;
      }
    }

    // Stamp LTV from CarrierProduct commission
    if (isDefined(carrierId) && isDefined(productId)) {
      const ltvCommission = await lookupCarrierProductCommission(
        carrierId,
        productId,
        workspaceId,
        globalWorkspaceOrmManager,
      );

      if (ltvCommission) {
        updates.ltv = {
          amountMicros: ltvCommission.amountMicros,
          currencyCode: ltvCommission.currencyCode,
        };
      }
    }

    if (Object.keys(updates).length > 0) {
      await policyRepo.update({ id }, updates as Record<string, unknown>);
    }
  }
}

async function buildPolicyDisplayName(
  carrierId: string | null,
  productId: string | null,
  workspaceId: string,
  globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
): Promise<string | null> {
  let carrierName = '';
  let productName = '';

  if (isDefined(carrierId)) {
    const carrierRepo = await globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'carrier',
      { shouldBypassPermissionChecks: true },
    );

    const carrier = (await carrierRepo.findOne({
      where: { id: carrierId },
    })) as Record<string, unknown> | null;

    carrierName = ((carrier?.name as string) ?? '').trim();
  }

  if (isDefined(productId)) {
    const productRepo = await globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'product',
      { shouldBypassPermissionChecks: true },
    );

    const product = (await productRepo.findOne({
      where: { id: productId },
    })) as Record<string, unknown> | null;

    productName = ((product?.name as string) ?? '').trim();
  }

  if (carrierName && productName) {
    return `${carrierName} - ${productName}`;
  }

  if (carrierName) {
    return `${carrierName} - Unknown`;
  }

  if (productName) {
    return `Unknown - ${productName}`;
  }

  return null;
}
