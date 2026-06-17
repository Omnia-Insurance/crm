import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { TELEPHONY_AGENT_STATUS_OPTIONS } from 'src/constants/field-options';
import {
  AGENT_TELEPHONY_PRESENCES_FIELD_ID,
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  TAP_AGENT_FIELD_ID,
  TAP_BROWSER_TAB_ID_FIELD_ID,
  TAP_CURRENT_CALL_SESSION_FIELD_ID,
  TAP_LAST_HEARTBEAT_AT_FIELD_ID,
  TAP_NAME_FIELD_ID,
  TAP_SESSION_ID_FIELD_ID,
  TAP_STATUS_CHANGED_AT_FIELD_ID,
  TAP_STATUS_FIELD_ID,
  TAP_WORKSPACE_MEMBER_FIELD_ID,
  TCS_AGENT_PRESENCES_FIELD_ID,
  TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
  WORKSPACE_MEMBER_TELEPHONY_PRESENCES_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  nameSingular: 'telephonyAgentPresence',
  namePlural: 'telephonyAgentPresences',
  labelSingular: 'Agent Presence',
  labelPlural: 'Agent Presence',
  description:
    'Durable agent status plus browser-session heartbeat used by Telephony routing.',
  icon: 'IconUserCheck',
  labelIdentifierFieldMetadataUniversalIdentifier: TAP_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: TAP_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: TAP_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: "'OFFLINE'",
      options: TELEPHONY_AGENT_STATUS_OPTIONS,
    },
    {
      universalIdentifier: TAP_SESSION_ID_FIELD_ID,
      type: FieldType.TEXT,
      name: 'sessionId',
      label: 'Session ID',
      icon: 'IconId',
    },
    {
      universalIdentifier: TAP_BROWSER_TAB_ID_FIELD_ID,
      type: FieldType.TEXT,
      name: 'browserTabId',
      label: 'Browser Tab ID',
      icon: 'IconBrowser',
    },
    {
      universalIdentifier: TAP_LAST_HEARTBEAT_AT_FIELD_ID,
      type: FieldType.DATE_TIME,
      name: 'lastHeartbeatAt',
      label: 'Last Heartbeat At',
      icon: 'IconHeartbeat',
    },
    {
      universalIdentifier: TAP_STATUS_CHANGED_AT_FIELD_ID,
      type: FieldType.DATE_TIME,
      name: 'statusChangedAt',
      label: 'Status Changed At',
      icon: 'IconCalendar',
    },
    {
      universalIdentifier: TAP_AGENT_FIELD_ID,
      type: FieldType.RELATION,
      name: 'agent',
      label: 'Agent',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        AGENT_TELEPHONY_PRESENCES_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'agentId',
      },
    },
    {
      universalIdentifier: TAP_WORKSPACE_MEMBER_FIELD_ID,
      type: FieldType.RELATION,
      name: 'workspaceMember',
      label: 'Workspace Member',
      icon: 'IconUserCircle',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
          .universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        WORKSPACE_MEMBER_TELEPHONY_PRESENCES_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'workspaceMemberId',
      },
    },
    {
      universalIdentifier: TAP_CURRENT_CALL_SESSION_FIELD_ID,
      type: FieldType.RELATION,
      name: 'currentCallSession',
      label: 'Current Call Session',
      icon: 'IconPhoneCalling',
      relationTargetObjectMetadataUniversalIdentifier:
        TELEPHONY_CALL_SESSION_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier:
        TCS_AGENT_PRESENCES_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'currentCallSessionId',
      },
    },
  ],
});
