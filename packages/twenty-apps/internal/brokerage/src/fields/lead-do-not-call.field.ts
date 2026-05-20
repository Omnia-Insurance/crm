import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_DO_NOT_CALL_FIELD_ID } from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_DO_NOT_CALL_FIELD_ID,
  type: FieldType.BOOLEAN,
  name: 'doNotCall',
  label: 'Do not call',
  icon: 'IconPhoneOff',
  defaultValue: false,
});

