import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  BROKERAGE_CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  TELEPHONY_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  TELEPHONY_CALL_EVENT_OBJECT_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  TELEPHONY_CAMPAIGN_OBJECT_ID,
  TELEPHONY_DISPOSITION_OBJECT_ID,
  TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
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
  universalIdentifier: TELEPHONY_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Telephony Agent',
  description:
    'Agent softphone role for ready-state control, lead preview, call sessions, and disposition submission.',
  icon: 'IconHeadset',
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
    readOnlyPermission(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
    ),
    readOnlyPermission(BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(BROKERAGE_CALL_OBJECT_UNIVERSAL_IDENTIFIER),
    readOnlyPermission(TELEPHONY_CAMPAIGN_OBJECT_ID),
    writablePermission(TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID),
    readOnlyPermission(TELEPHONY_DISPOSITION_OBJECT_ID),
    writablePermission(TELEPHONY_CALL_SESSION_OBJECT_ID),
    writablePermission(TELEPHONY_CALL_EVENT_OBJECT_ID),
    writablePermission(TELEPHONY_AGENT_PRESENCE_OBJECT_ID),
    readOnlyPermission(TELEPHONY_INBOUND_QUEUE_OBJECT_ID),
  ],
  fieldPermissions: [],
});
