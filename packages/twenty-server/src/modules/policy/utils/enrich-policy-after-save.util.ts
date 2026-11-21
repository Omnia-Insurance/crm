import { Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

type Commission = NonNullable<
  Awaited<ReturnType<typeof lookupCarrierProductCommission>>
>;

type SavedPolicy = {
  id: string;
  carrierId: string | null;
  productId: string | null;
  ltv: { amountMicros: number | null; currencyCode: string | null } | null;
};

const logger = new Logger('enrichPolicyAfterSave');

const buildCarrierProductKey = (carrierId: string, productId: string) =>
  `${carrierId}:${productId}`;

// One lookup per distinct carrier and product pair, however many policies share it
const findCommissionByCarrierProductKey = async (
  policies: SavedPolicy[],
  workspaceOrmManager: WorkspaceOrmManager,
): Promise<Map<string, Commission | null>> => {
  const commissionByCarrierProductKey = new Map<string, Commission | null>();

  for (const { carrierId, productId } of policies) {
    if (!isNonEmptyString(carrierId) || !isNonEmptyString(productId)) {
      continue;
    }

    const carrierProductKey = buildCarrierProductKey(carrierId, productId);

    if (!commissionByCarrierProductKey.has(carrierProductKey)) {
      commissionByCarrierProductKey.set(
        carrierProductKey,
        await lookupCarrierProductCommission(
          carrierId,
          productId,
          workspaceOrmManager,
        ),
      );
    }
  }

  return commissionByCarrierProductKey;
};

const isSameCommission = (
  ltv: SavedPolicy['ltv'],
  commission: Commission,
): boolean =>
  ltv?.amountMicros === commission.amountMicros &&
  ltv?.currencyCode === commission.currencyCode;

// Stamps LTV on saved policies; callers run inside a workspace context
export const enrichPolicyAfterSave = async (
  records: Pick<ObjectRecord, 'id'>[],
  workspaceOrmManager: WorkspaceOrmManager,
): Promise<void> => {
  const policyIds = [
    ...new Set(records.map(({ id }) => id).filter(isNonEmptyString)),
  ];

  if (policyIds.length === 0) {
    return;
  }

  try {
    // System write: agents may lack write access to the system-stamped LTV
    const policyRepository =
      workspaceOrmManager.getRepositoryWithoutPermissionChecks<SavedPolicy>(
        'policy',
      );

    // Read back: the saved payload only carries the fields the caller selected
    const policies = await policyRepository.find({
      where: { id: In(policyIds) },
      select: [
        'id',
        'carrierId',
        'productId',
        'ltvAmountMicros',
        'ltvCurrencyCode',
      ],
    });

    const commissionByCarrierProductKey =
      await findCommissionByCarrierProductKey(policies, workspaceOrmManager);

    const updates = policies.flatMap(({ id, carrierId, productId, ltv }) => {
      const commission =
        isNonEmptyString(carrierId) && isNonEmptyString(productId)
          ? commissionByCarrierProductKey.get(
              buildCarrierProductKey(carrierId, productId),
            )
          : undefined;

      return isDefined(commission) && !isSameCommission(ltv, commission)
        ? [{ criteria: id, partialEntity: { ltv: commission } }]
        : [];
    });

    if (updates.length > 0) {
      await policyRepository.updateMany(updates);
    }
  } catch (error) {
    // Best effort, as after-commit hooks are: the policy write itself already succeeded
    logger.error(
      `Could not enrich ${policyIds.length} saved policies`,
      error instanceof Error ? error.stack : undefined,
    );
  }
};
