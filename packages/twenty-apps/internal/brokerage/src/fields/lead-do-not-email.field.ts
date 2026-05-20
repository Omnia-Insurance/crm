import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_DO_NOT_EMAIL_FIELD_ID } from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_DO_NOT_EMAIL_FIELD_ID,
  type: FieldType.BOOLEAN,
  name: 'doNotEmail',
  label: 'Do not email',
  icon: 'IconMailOff',
  defaultValue: false,
});

