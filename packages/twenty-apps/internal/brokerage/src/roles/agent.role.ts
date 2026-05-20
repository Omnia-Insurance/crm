import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const readOnlyPermission = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

const writablePermission = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Agent',
  description:
    'Brokerage producer role. Policy-write ownership and edit-window enforcement require post-install setup.',
  icon: 'IconUser',
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
    writablePermission(POLICY_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(CALL_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(CARRIER_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER),
  ],
  fieldPermissions: [],
});
