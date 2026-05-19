import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { TELEPHONY_INBOUND_QUEUE_STATUS_OPTIONS } from 'src/constants/field-options';
import {
  TC_INBOUND_QUEUES_FIELD_ID,
  TELEPHONY_CAMPAIGN_OBJECT_ID,
  TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
  TIQ_CAMPAIGN_FIELD_ID,
  TIQ_FRIENDLY_NAME_FIELD_ID,
  TIQ_MISSED_CALL_DISPOSITION_FIELD_ID,
  TIQ_NAME_FIELD_ID,
  TIQ_OVERFLOW_ACTION_FIELD_ID,
  TIQ_PRIORITY_FIELD_ID,
  TIQ_PROVIDER_CONFIG_FIELD_ID,
  TIQ_PROVIDER_NUMBER_FIELD_ID,
  TIQ_STATUS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
  nameSingular: 'telephonyInboundQueue',
  namePlural: 'telephonyInboundQueues',
  labelSingular: 'Inbound Queue',
  labelPlural: 'Inbound Queues',
  description:
    'Provider number mapping to a Telephony Campaign and routing pool.',
  icon: 'IconPhoneIncoming',
  labelIdentifierFieldMetadataUniversalIdentifier: TIQ_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: TIQ_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: TIQ_PROVIDER_NUMBER_FIELD_ID,
      type: FieldType.TEXT,
      name: 'providerNumber',
      label: 'Provider Number',
      description: 'Inbound number in E.164 format.',
      icon: 'IconPhone',
    },
    {
      universalIdentifier: TIQ_FRIENDLY_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'friendlyName',
      label: 'Friendly Name',
      icon: 'IconTag',
    },
    {
      universalIdentifier: TIQ_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: "'ACTIVE'",
      options: TELEPHONY_INBOUND_QUEUE_STATUS_OPTIONS,
    },
    {
      universalIdentifier: TIQ_PRIORITY_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'priority',
      label: 'Priority',
      icon: 'IconSortAscending',
      defaultValue: 100,
    },
    {
      universalIdentifier: TIQ_OVERFLOW_ACTION_FIELD_ID,
      type: FieldType.TEXT,
      name: 'overflowAction',
      label: 'Overflow Action',
      description:
        'Fallback action when no READY browser agent accepts the inbound offer.',
      icon: 'IconArrowFork',
    },
    {
      universalIdentifier: TIQ_MISSED_CALL_DISPOSITION_FIELD_ID,
      type: FieldType.TEXT,
      name: 'missedCallDisposition',
      label: 'Missed Call Disposition',
      icon: 'IconPhoneOff',
    },
    {
      universalIdentifier: TIQ_PROVIDER_CONFIG_FIELD_ID,
      type: FieldType.RAW_JSON,
      name: 'providerConfig',
      label: 'Provider Config',
      description:
        'Non-secret provider routing metadata such as TwiML app or number mapping hints.',
      icon: 'IconJson',
    },
    {
      universalIdentifier: TIQ_CAMPAIGN_FIELD_ID,
      type: FieldType.RELATION,
      name: 'campaign',
      label: 'Campaign',
      icon: 'IconSpeakerphone',
      relationTargetObjectMetadataUniversalIdentifier:
        TELEPHONY_CAMPAIGN_OBJECT_ID,
      relationTargetFieldMetadataUniversalIdentifier:
        TC_INBOUND_QUEUES_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'campaignId',
      },
    },
  ],
});
