import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  AGENT_TELEPHONY_PRESENCES_FIELD_ID,
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  TAP_AGENT_FIELD_ID,
  TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier: BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  universalIdentifier: AGENT_TELEPHONY_PRESENCES_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyAgentPresences',
  label: 'Telephony Agent Presence',
  icon: 'IconUserCheck',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: TAP_AGENT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
