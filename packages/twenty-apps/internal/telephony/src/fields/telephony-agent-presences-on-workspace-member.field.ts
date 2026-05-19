import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  TAP_WORKSPACE_MEMBER_FIELD_ID,
  TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  WORKSPACE_MEMBER_TELEPHONY_PRESENCES_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  universalIdentifier: WORKSPACE_MEMBER_TELEPHONY_PRESENCES_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyAgentPresences',
  label: 'Telephony Agent Presence',
  icon: 'IconUserCheck',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: TAP_WORKSPACE_MEMBER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
