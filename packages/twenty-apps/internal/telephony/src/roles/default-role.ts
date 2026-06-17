import { PermissionFlag, defineRole } from 'twenty-sdk/define';

import { TELEPHONY_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineRole({
  universalIdentifier: TELEPHONY_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Telephony default function role',
  description: 'Default function role for the Telephony application.',
  icon: 'IconPhone',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [],
  fieldPermissions: [],
  permissionFlags: [PermissionFlag.VIEWS, PermissionFlag.LAYOUTS],
});
