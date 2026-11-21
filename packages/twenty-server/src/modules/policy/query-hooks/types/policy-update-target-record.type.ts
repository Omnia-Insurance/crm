import { type PolicyUpdateTarget } from 'src/modules/policy/types/policy-update-target.type';

export type PolicyUpdateTargetRecord = PolicyUpdateTarget & {
  carrierId: string | null;
  productId: string | null;
};
