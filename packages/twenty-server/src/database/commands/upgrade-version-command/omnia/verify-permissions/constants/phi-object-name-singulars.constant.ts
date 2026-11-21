import { RECONCILIATION_OBJECT_NAME_SINGULARS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/reconciliation-object-name-singulars.constant';

export const PHI_OBJECT_NAME_SINGULARS: string[] = [
  'person',
  'policy',
  'call',
  ...RECONCILIATION_OBJECT_NAME_SINGULARS,
];
