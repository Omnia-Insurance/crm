import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  BROKERAGE_CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  TELEPHONY_CALL_EVENT_OBJECT_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  TELEPHONY_CAMPAIGN_OBJECT_ID,
  TELEPHONY_DISPOSITION_OBJECT_ID,
  TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
  TELEPHONY_MANAGER_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const writablePermission = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: TELEPHONY_MANAGER_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Telephony Manager',
  description:
    'Campaign manager role for list upload, routing configuration, dispositions, inbound queues, and live monitoring.',
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
    writablePermission(BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(BROKERAGE_CALL_OBJECT_UNIVERSAL_IDENTIFIER),
    writablePermission(TELEPHONY_CAMPAIGN_OBJECT_ID),
    writablePermission(TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID),
    writablePermission(TELEPHONY_DISPOSITION_OBJECT_ID),
    writablePermission(TELEPHONY_CALL_SESSION_OBJECT_ID),
    writablePermission(TELEPHONY_CALL_EVENT_OBJECT_ID),
    writablePermission(TELEPHONY_AGENT_PRESENCE_OBJECT_ID),
    writablePermission(TELEPHONY_INBOUND_QUEUE_OBJECT_ID),
  ],
  fieldPermissions: [],
});
