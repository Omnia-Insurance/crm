import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { CALL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/call';
import { PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-number';
import { PHONE_NUMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/phone-number-on-call.field';

export const CALL_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER =
  'ac952061-e42d-4499-b6af-5b837551ffc6';

export default defineField({
  universalIdentifier: CALL_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'telephonyCalls',
  label: 'Telephony calls',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier:
    CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PHONE_NUMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
