import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  AGENT_TELEPHONY_CALL_SESSIONS_FIELD_ID,
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  TCS_AGENT_FIELD_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier: BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  universalIdentifier: AGENT_TELEPHONY_CALL_SESSIONS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyCallSessions',
  label: 'Telephony Call Sessions',
  icon: 'IconPhoneCalling',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_CALL_SESSION_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: TCS_AGENT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
