import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { TELEPHONY_DISPOSITION_CATEGORY_OPTIONS } from 'src/constants/field-options';
import {
  TC_DISPOSITIONS_FIELD_ID,
  TCL_LAST_DISPOSITION_FIELD_ID,
  TCS_DISPOSITION_FIELD_ID,
  TD_ACTIVE_FIELD_ID,
  TD_CALL_SESSIONS_FIELD_ID,
  TD_CAMPAIGN_FIELD_ID,
  TD_CAMPAIGN_LEADS_FIELD_ID,
  TD_CATEGORY_FIELD_ID,
  TD_CODE_FIELD_ID,
  TD_IS_TERMINAL_FIELD_ID,
  TD_MAPS_LEAD_STATUS_TO_FIELD_ID,
  TD_NAME_FIELD_ID,
  TD_REQUIRES_CALLBACK_FIELD_ID,
  TD_RETRY_DELAY_MINUTES_FIELD_ID,
  TD_SORT_ORDER_FIELD_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  TELEPHONY_CAMPAIGN_OBJECT_ID,
  TELEPHONY_DISPOSITION_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: TELEPHONY_DISPOSITION_OBJECT_ID,
  nameSingular: 'telephonyDisposition',
  namePlural: 'telephonyDispositions',
  labelSingular: 'Disposition',
  labelPlural: 'Dispositions',
  description:
    'Campaign-configurable outcome controlling lead status and retry scheduling.',
  icon: 'IconChecklist',
  labelIdentifierFieldMetadataUniversalIdentifier: TD_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: TD_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: TD_CODE_FIELD_ID,
      type: FieldType.TEXT,
      name: 'code',
      label: 'Code',
      icon: 'IconCode',
    },
    {
      universalIdentifier: TD_CATEGORY_FIELD_ID,
      type: FieldType.SELECT,
      name: 'category',
      label: 'Category',
      icon: 'IconCategory',
      options: TELEPHONY_DISPOSITION_CATEGORY_OPTIONS,
    },
    {
      universalIdentifier: TD_RETRY_DELAY_MINUTES_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'retryDelayMinutes',
      label: 'Retry Delay Minutes',
      icon: 'IconClock',
    },
    {
      universalIdentifier: TD_REQUIRES_CALLBACK_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'requiresCallbackAt',
      label: 'Requires Callback At',
      icon: 'IconCalendarEvent',
      defaultValue: false,
    },
    {
      universalIdentifier: TD_IS_TERMINAL_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'isTerminal',
      label: 'Terminal',
      icon: 'IconFlagCheck',
      defaultValue: false,
    },
    {
      universalIdentifier: TD_MAPS_LEAD_STATUS_TO_FIELD_ID,
      type: FieldType.TEXT,
      name: 'mapsLeadStatusTo',
      label: 'Lead Status Mapping',
      description:
        'Brokerage Lead status value to write when this disposition is submitted.',
      icon: 'IconArrowRight',
    },
    {
      universalIdentifier: TD_SORT_ORDER_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'sortOrder',
      label: 'Sort Order',
      icon: 'IconSortAscending',
      defaultValue: 100,
    },
    {
      universalIdentifier: TD_ACTIVE_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'active',
      label: 'Active',
      icon: 'IconCircleCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: TD_CAMPAIGN_FIELD_ID,
      type: FieldType.RELATION,
      name: 'campaign',
      label: 'Campaign',
      icon: 'IconSpeakerphone',
      relationTargetObjectMetadataUniversalIdentifier:
        TELEPHONY_CAMPAIGN_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier: TC_DISPOSITIONS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'campaignId',
      },
    },
    {
      universalIdentifier: TD_CAMPAIGN_LEADS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'campaignLeads',
      label: 'Campaign Leads',
      icon: 'IconTargetArrow',
      relationTargetObjectMetadataUniversalIdentifier:
        TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier:
        TCL_LAST_DISPOSITION_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: TD_CALL_SESSIONS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'callSessions',
      label: 'Call Sessions',
      icon: 'IconPhoneCalling',
      relationTargetObjectMetadataUniversalIdentifier:
        TELEPHONY_CALL_SESSION_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier: TCS_DISPOSITION_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});
