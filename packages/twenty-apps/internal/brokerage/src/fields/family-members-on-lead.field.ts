import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  FAMILY_MEMBER_LEAD_FIELD_ID,
  FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_FAMILY_MEMBERS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_FAMILY_MEMBERS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'familyMembers',
  label: 'Family Members',
  icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier:
    FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: FAMILY_MEMBER_LEAD_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});

