import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CALL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/call';
import { PERSON_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/person-on-call.field';

export const CALL_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER =
  'afdb6893-be97-446f-99cb-28ff5beadd68';

export default defineField({
  universalIdentifier: CALL_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'telephonyCalls',
  label: 'Telephony calls',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier:
    CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PERSON_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
