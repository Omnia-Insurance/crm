import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { CALL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/call';
import { PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-number';
import { CALL_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/call-on-phone-number.field';

export const PHONE_NUMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER =
  'e6846092-af8c-43c7-bfd6-9351ef90b682';

// Which workspace-owned number was used for this call (caller ID for outbound,
// dialed number for inbound). Lets us roll up calls per number for usage,
// cost, and per-DID reporting.
export default defineField({
  universalIdentifier: PHONE_NUMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'phoneNumber',
  label: 'Workspace number',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier:
    PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CALL_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'phoneNumberId',
  },
});
