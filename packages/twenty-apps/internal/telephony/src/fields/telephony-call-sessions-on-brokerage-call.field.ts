import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  BROKERAGE_CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  BROKERAGE_CALL_TELEPHONY_SESSIONS_FIELD_ID,
  TCS_BROKERAGE_CALL_FIELD_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier: BROKERAGE_CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  universalIdentifier: BROKERAGE_CALL_TELEPHONY_SESSIONS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyCallSessions',
  label: 'Telephony Call Sessions',
  icon: 'IconPhoneCalling',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_CALL_SESSION_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    TCS_BROKERAGE_CALL_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
