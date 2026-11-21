export type PolicyUpdateDenial = {
  policyId: string;
  reason: 'row-level-security' | 'edit-window';
};
