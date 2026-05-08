import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CALL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/call';
import { CALL_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/call-on-person.field';

export const PERSON_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER =
  'ea23f06f-82cc-44c0-9f6b-6ffec8243963';

export default defineField({
  universalIdentifier: PERSON_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'person',
  label: 'Person',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    CALL_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'personId',
  },
});
