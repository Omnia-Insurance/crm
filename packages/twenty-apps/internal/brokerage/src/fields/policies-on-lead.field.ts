import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LEAD_POLICIES_FIELD_ID,
  POLICY_LEAD_FIELD_ID,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_POLICIES_FIELD_ID,
  type: FieldType.RELATION,
  name: 'policies',
  label: 'Policies',
  icon: 'IconFileText',
  relationTargetObjectMetadataUniversalIdentifier:
    POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: POLICY_LEAD_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});

