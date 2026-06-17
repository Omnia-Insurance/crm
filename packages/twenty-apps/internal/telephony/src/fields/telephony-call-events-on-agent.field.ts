import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  AGENT_TELEPHONY_CALL_EVENTS_FIELD_ID,
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  TCE_AGENT_FIELD_ID,
  TELEPHONY_CALL_EVENT_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier: BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  universalIdentifier: AGENT_TELEPHONY_CALL_EVENTS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyCallEvents',
  label: 'Telephony Call Events',
  icon: 'IconTimelineEvent',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_CALL_EVENT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: TCE_AGENT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
