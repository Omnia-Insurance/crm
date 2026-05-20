import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_GENDER_OPTIONS } from 'src/constants/field-options';
import { LEAD_GENDER_FIELD_ID } from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_GENDER_FIELD_ID,
  type: FieldType.SELECT,
  name: 'gender',
  label: 'Gender',
  icon: 'IconGenderBigender',
  options: LEAD_GENDER_OPTIONS,
});

