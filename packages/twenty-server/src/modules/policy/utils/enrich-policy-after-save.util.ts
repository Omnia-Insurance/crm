import { isDefined } from 'twenty-shared/utils';

import type { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

// Stamps LTV from CarrierProduct commission after save.
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

    if (!isDefined(carrierId) || !isDefined(productId)) {
      continue;
    }

    const ltvCommission = await lookupCarrierProductCommission(
      carrierId,
      productId,
      workspaceId,
      globalWorkspaceOrmManager,
    );

    if (ltvCommission) {
      await policyRepo.update({ id }, {
        ltv: {
          amountMicros: ltvCommission.amountMicros,
          currencyCode: ltvCommission.currencyCode,
        },
      } as Record<string, unknown>);
    }
  }
}
