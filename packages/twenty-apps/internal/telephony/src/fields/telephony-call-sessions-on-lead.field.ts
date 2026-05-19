import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LEAD_TELEPHONY_CALL_SESSIONS_FIELD_ID,
  TCS_LEAD_FIELD_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_TELEPHONY_CALL_SESSIONS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyCallSessions',
  label: 'Telephony Call Sessions',
  icon: 'IconPhoneCalling',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_CALL_SESSION_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: TCS_LEAD_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
