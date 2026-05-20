import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LEAD_SOURCE_FIELD_ID,
  LEAD_SOURCE_LEADS_FIELD_ID,
  LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_SOURCE_FIELD_ID,
  type: FieldType.RELATION,
  name: 'leadSource',
  label: 'Lead Source',
  icon: 'IconRoute',
  relationTargetObjectMetadataUniversalIdentifier:
    LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: LEAD_SOURCE_LEADS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'leadSourceId',
  },
});

