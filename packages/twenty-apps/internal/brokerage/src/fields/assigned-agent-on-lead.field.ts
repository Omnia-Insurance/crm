import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  AGENT_LEADS_FIELD_ID,
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_ASSIGNED_AGENT_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_ASSIGNED_AGENT_FIELD_ID,
  type: FieldType.RELATION,
  name: 'assignedAgent',
  label: 'Assigned Agent',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: AGENT_LEADS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'assignedAgentId',
  },
});

