import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_STATUS_OPTIONS } from 'src/constants/field-options';
import { LEAD_STATUS_FIELD_ID } from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_STATUS_FIELD_ID,
  type: FieldType.SELECT,
  name: 'leadStatus',
  label: 'Status',
  icon: 'IconStatusChange',
  options: LEAD_STATUS_OPTIONS,
  defaultValue: "'ASSIGNED'",
});
