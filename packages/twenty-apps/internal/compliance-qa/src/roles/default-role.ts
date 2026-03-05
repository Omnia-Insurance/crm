import { defineRole, PermissionFlag } from 'twenty-sdk';

export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  'c7a1b3e5-4f28-49d6-8e3c-1a5b7d9f2e04';

export default defineRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Compliance QA default function role',
  description: 'Default role for the compliance QA application',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  permissionFlags: [PermissionFlag.UPLOAD_FILE, PermissionFlag.AI],
});
