import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  BROKERAGE_MANAGER_ROLE_UNIVERSAL_IDENTIFIER,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const writablePermission = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: BROKERAGE_MANAGER_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Manager',
  description: 'Brokerage operations manager role without workspace admin.',
  icon: 'IconUserShield',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: true,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    writablePermission(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
    ),
    writablePermission(AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(CALL_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(CARRIER_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(POLICY_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER),
  ],
  fieldPermissions: [],
});
