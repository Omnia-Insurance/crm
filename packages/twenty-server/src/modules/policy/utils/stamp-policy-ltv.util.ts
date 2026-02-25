import { isDefined } from 'twenty-shared/utils';

import type { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

// Stamps LTV on policy records that have carrier + product set.
// Uses bypassed permissions so it works regardless of field-level role settings.
export async function stampPolicyLtv(
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
      // Use flat column names since repository.update() doesn't go through
      // formatData and won't expand composite field objects
      await policyRepo.update(
        { id },
        {
          ltvAmountMicros: ltvCommission.amountMicros,
          ltvCurrencyCode: ltvCommission.currencyCode,
        } as Record<string, unknown>,
      );
    }
  }
}
