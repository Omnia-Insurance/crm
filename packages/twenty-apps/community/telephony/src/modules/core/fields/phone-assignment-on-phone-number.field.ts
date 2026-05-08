import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-number';
import { PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-assignment';
import { PHONE_NUMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/phone-number-on-phone-assignment.field';

export const PHONE_ASSIGNMENT_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER =
  'a9bbf298-3032-418b-a17c-fbbbeae631ec';

export default defineField({
  universalIdentifier:
    PHONE_ASSIGNMENT_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'phoneAssignments',
  label: 'Phone assignments',
  icon: 'IconUserPlus',
  relationTargetObjectMetadataUniversalIdentifier:
    PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PHONE_NUMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
