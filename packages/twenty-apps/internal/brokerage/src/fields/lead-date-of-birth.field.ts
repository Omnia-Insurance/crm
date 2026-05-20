import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_DATE_OF_BIRTH_FIELD_ID } from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_DATE_OF_BIRTH_FIELD_ID,
  type: FieldType.DATE,
  name: 'dateOfBirth',
  label: 'Date of Birth',
  icon: 'IconCake',
});

