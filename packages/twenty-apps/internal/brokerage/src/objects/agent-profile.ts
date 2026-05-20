import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { AGENT_STATUS_OPTIONS } from 'src/constants/field-options';
import {
  AGENT_CALLS_FIELD_ID,
  AGENT_EMAIL_FIELD_ID,
  AGENT_LEADS_FIELD_ID,
  AGENT_NAME_FIELD_ID,
  AGENT_NPN_FIELD_ID,
  AGENT_POLICIES_FIELD_ID,
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  AGENT_STATUS_FIELD_ID,
  AGENT_WORKSPACE_MEMBER_FIELD_ID,
  CALL_AGENT_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_ASSIGNED_AGENT_FIELD_ID,
  POLICY_AGENT_FIELD_ID,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  WORKSPACE_MEMBER_AGENT_PROFILE_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'agentProfile',
  namePlural: 'agentProfiles',
  labelSingular: 'Agent',
  labelPlural: 'Agents',
  description: 'Insurance agent profile.',
  icon: 'IconUser',
  labelIdentifierFieldMetadataUniversalIdentifier: AGENT_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: AGENT_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: AGENT_EMAIL_FIELD_ID,
      type: FieldType.EMAILS,
      name: 'email',
      label: 'Email',
      icon: 'IconMail',
    },
    {
      universalIdentifier: AGENT_NPN_FIELD_ID,
      type: FieldType.TEXT,
      name: 'npn',
      label: 'NPN',
      icon: 'IconId',
    },
    {
      universalIdentifier: AGENT_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: "'ACTIVE'",
      options: AGENT_STATUS_OPTIONS,
    },
    {
      universalIdentifier: AGENT_WORKSPACE_MEMBER_FIELD_ID,
      type: FieldType.RELATION,
      name: 'workspaceMember',
      label: 'Workspace Member',
      icon: 'IconUserCircle',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
          .universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        WORKSPACE_MEMBER_AGENT_PROFILE_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'workspaceMemberId',
      },
    },
    {
      universalIdentifier: AGENT_LEADS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'leads',
      label: 'Leads',
      icon: 'IconTargetArrow',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        LEAD_ASSIGNED_AGENT_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: AGENT_POLICIES_FIELD_ID,
      type: FieldType.RELATION,
      name: 'policies',
      label: 'Policies',
      icon: 'IconFileText',
      relationTargetObjectMetadataUniversalIdentifier:
        POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: POLICY_AGENT_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: AGENT_CALLS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'calls',
      label: 'Calls',
      icon: 'IconPhoneCall',
      relationTargetObjectMetadataUniversalIdentifier:
        CALL_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: CALL_AGENT_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});

