import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-number';
import { PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-assignment';
import { PHONE_ASSIGNMENT_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/phone-assignment-on-phone-number.field';

export const PHONE_NUMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER =
  '105be4f4-ca23-4ccb-8345-ddb81329d192';

export default defineField({
  universalIdentifier:
    PHONE_NUMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'phoneNumber',
  label: 'Phone number',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier:
    PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PHONE_ASSIGNMENT_ON_PHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'phoneNumberId',
  },
});
