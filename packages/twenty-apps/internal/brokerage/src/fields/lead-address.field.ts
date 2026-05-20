import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_ADDRESS_FIELD_ID } from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_ADDRESS_FIELD_ID,
  type: FieldType.ADDRESS,
  name: 'addressCustom',
  label: 'Address',
  icon: 'IconMapPin',
});

