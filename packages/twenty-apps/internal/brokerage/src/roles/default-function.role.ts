import {
  PermissionFlag,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineRole,
} from 'twenty-sdk/define';

import { BROKERAGE_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

const writablePermission = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: BROKERAGE_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Brokerage default function role',
  description: 'Default function role for the Brokerage application.',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    writablePermission(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
    ),
  ],
  fieldPermissions: [],
  permissionFlags: [PermissionFlag.DATA_MODEL, PermissionFlag.VIEWS],
});
