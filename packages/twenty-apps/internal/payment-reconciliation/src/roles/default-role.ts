import { defineRole, PermissionFlag } from 'twenty-sdk';

import { DEFAULT_ROLE_UNIVERSAL_ID } from 'src/constants/universal-identifiers';

export default defineRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_ID,
  label: 'Payment Reconciliation default function role',
  description: 'Default role for the payment reconciliation application',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  permissionFlags: [PermissionFlag.UPLOAD_FILE],
});
