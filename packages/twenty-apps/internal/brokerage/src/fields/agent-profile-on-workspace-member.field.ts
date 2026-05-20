import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  AGENT_WORKSPACE_MEMBER_FIELD_ID,
  WORKSPACE_MEMBER_AGENT_PROFILE_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  universalIdentifier: WORKSPACE_MEMBER_AGENT_PROFILE_FIELD_ID,
  type: FieldType.RELATION,
  name: 'agentProfile',
  label: 'Agent',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    AGENT_WORKSPACE_MEMBER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});

