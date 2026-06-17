import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { TELEPHONY_CALL_EVENT_TYPE_OPTIONS } from 'src/constants/field-options';
import {
  AGENT_TELEPHONY_CALL_EVENTS_FIELD_ID,
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  TCE_AGENT_FIELD_ID,
  TCE_BLOCKED_REASON_FIELD_ID,
  TCE_CALL_SESSION_FIELD_ID,
  TCE_CAMPAIGN_LEAD_FIELD_ID,
  TCE_EVENT_TIME_FIELD_ID,
  TCE_EVENT_TYPE_FIELD_ID,
  TCE_NAME_FIELD_ID,
  TCE_PAYLOAD_FIELD_ID,
  TCE_PROVIDER_CALL_ID_FIELD_ID,
  TCE_PROVIDER_EVENT_ID_FIELD_ID,
  TCE_PROVIDER_FIELD_ID,
  TCL_CALL_EVENTS_FIELD_ID,
  TCS_EVENTS_FIELD_ID,
  TELEPHONY_CALL_EVENT_OBJECT_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: TELEPHONY_CALL_EVENT_OBJECT_ID,
  nameSingular: 'telephonyCallEvent',
  namePlural: 'telephonyCallEvents',
  labelSingular: 'Call Event',
  labelPlural: 'Call Events',
  description:
    'Immutable provider and routing audit event for dialing, recording, blocking, and disposition activity.',
  icon: 'IconTimelineEvent',
  labelIdentifierFieldMetadataUniversalIdentifier: TCE_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: TCE_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: TCE_EVENT_TYPE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'eventType',
      label: 'Event Type',
      icon: 'IconStatusChange',
      options: TELEPHONY_CALL_EVENT_TYPE_OPTIONS,
    },
    {
      universalIdentifier: TCE_EVENT_TIME_FIELD_ID,
      type: FieldType.DATE_TIME,
      name: 'eventTime',
      label: 'Event Time',
      icon: 'IconCalendar',
    },
    {
      universalIdentifier: TCE_PROVIDER_FIELD_ID,
      type: FieldType.TEXT,
      name: 'provider',
      label: 'Provider',
      icon: 'IconPlugConnected',
    },
    {
      universalIdentifier: TCE_PROVIDER_EVENT_ID_FIELD_ID,
      type: FieldType.TEXT,
      name: 'providerEventId',
      label: 'Provider Event ID',
      icon: 'IconId',
    },
    {
      universalIdentifier: TCE_PROVIDER_CALL_ID_FIELD_ID,
      type: FieldType.TEXT,
      name: 'providerCallId',
      label: 'Provider Call ID',
      icon: 'IconPhone',
    },
    {
      universalIdentifier: TCE_PAYLOAD_FIELD_ID,
      type: FieldType.RAW_JSON,
      name: 'payload',
      label: 'Payload',
      icon: 'IconJson',
    },
    {
      universalIdentifier: TCE_BLOCKED_REASON_FIELD_ID,
      type: FieldType.TEXT,
      name: 'blockedReason',
      label: 'Blocked Reason',
      icon: 'IconShieldX',
    },
    {
      universalIdentifier: TCE_CALL_SESSION_FIELD_ID,
      type: FieldType.RELATION,
      name: 'callSession',
      label: 'Call Session',
      icon: 'IconPhoneCalling',
      relationTargetObjectMetadataUniversalIdentifier:
        TELEPHONY_CALL_SESSION_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier: TCS_EVENTS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'callSessionId',
      },
    },
    {
      universalIdentifier: TCE_CAMPAIGN_LEAD_FIELD_ID,
      type: FieldType.RELATION,
      name: 'campaignLead',
      label: 'Campaign Lead',
      icon: 'IconTargetArrow',
      relationTargetObjectMetadataUniversalIdentifier:
        TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier: TCL_CALL_EVENTS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'campaignLeadId',
      },
    },
    {
      universalIdentifier: TCE_AGENT_FIELD_ID,
      type: FieldType.RELATION,
      name: 'agent',
      label: 'Agent',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        AGENT_TELEPHONY_CALL_EVENTS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'agentId',
      },
    },
  ],
});
