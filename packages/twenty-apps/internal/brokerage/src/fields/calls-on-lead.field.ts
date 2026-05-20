import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALL_LEAD_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_CALLS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_CALLS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'calls',
  label: 'Calls',
  icon: 'IconPhoneCall',
  relationTargetObjectMetadataUniversalIdentifier:
    CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: CALL_LEAD_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});

