import { defineObject, FieldType } from 'twenty-sdk/define';

export const CALL_OBJECT_UNIVERSAL_IDENTIFIER =
  '8f615220-a95a-46f7-a371-746feefa80d5';

export const NAME_FIELD_UNIVERSAL_IDENTIFIER =
  '16e1f248-2300-43c1-8616-dfe7f7d0244f';
export const DIRECTION_FIELD_UNIVERSAL_IDENTIFIER =
  '6ee7c873-8df4-4c38-aee0-383430094ce1';
export const STATUS_FIELD_UNIVERSAL_IDENTIFIER =
  '022275af-db16-4f7d-bb91-52a956e6eb0b';
export const FROM_NUMBER_FIELD_UNIVERSAL_IDENTIFIER =
  'ca543934-8cc9-40d7-972e-936fd32717ef';
export const TO_NUMBER_FIELD_UNIVERSAL_IDENTIFIER =
  '6f177aab-0e0e-4a63-afc6-5480ff1964fd';
export const STARTED_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '11c40b6a-ba6a-4766-a2da-b5f3f76cf8a4';
export const ANSWERED_AT_FIELD_UNIVERSAL_IDENTIFIER =
  'eb511f0d-7ad3-4751-8105-e16c8b6d2abf';
export const ENDED_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '7a76cdd7-3b10-4b10-acf2-2294b99f7bc1';
export const DURATION_SEC_FIELD_UNIVERSAL_IDENTIFIER =
  'c69b39fb-f27a-4b66-9cfb-cf1cecf9b463';
export const RECORDING_URL_FIELD_UNIVERSAL_IDENTIFIER =
  '2e0fe747-9e62-4819-834f-80f1b547e409';
export const TRANSCRIPT_FIELD_UNIVERSAL_IDENTIFIER =
  '81bda239-1526-47d6-8f94-206dc3d4ab6a';
export const SUMMARY_FIELD_UNIVERSAL_IDENTIFIER =
  '05d9e70e-00b5-4c14-9187-7f17315ac029';
export const PROVIDER_FIELD_UNIVERSAL_IDENTIFIER =
  'cabf7b69-3e39-4a42-9256-37fbb027fa2d';
export const PROVIDER_CALL_SID_FIELD_UNIVERSAL_IDENTIFIER =
  '7c2c5497-335f-42af-a484-b924bbb0f219';
export const COST_FIELD_UNIVERSAL_IDENTIFIER =
  '97fdcd95-0241-46b5-924e-9c2415e5da7f';
export const CREATED_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '7050f060-07df-43c8-880e-e660453cdeae';

// Naming note: the workspace already has a `call` object owned by the
// Convoso ingestion path. While Convoso is being retired and replaced by
// this Telephony app, we ship this object as `telephonyCall` to avoid
// collision. Once Convoso is gone, the migration plan is:
//   1. one-time copy of legacy `call` rows into `telephonyCall`
//   2. soft-delete or rename the Convoso `call` object
//   3. rename `telephonyCall` → `call` so the natural name lands on the
//      new system
export default defineObject({
  universalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'telephonyCall',
  namePlural: 'telephonyCalls',
  labelSingular: 'Telephony call',
  labelPlural: 'Telephony calls',
  description: 'A voice call placed or received through a telephony provider',
  icon: 'IconPhone',
  labelIdentifierFieldMetadataUniversalIdentifier:
    NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description: 'Display label for the call (auto-generated)',
      icon: 'IconMessage',
    },
    {
      universalIdentifier: DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'direction',
      label: 'Direction',
      description: 'Whether the call was outbound or inbound',
      icon: 'IconArrowUpRight',
      defaultValue: "'OUTBOUND'",
      options: [
        {
          id: '12d45791-98ce-4924-a23c-f5039b68ee6b',
          value: 'OUTBOUND',
          label: 'Outbound',
          position: 0,
          color: 'blue',
        },
        {
          id: '0c989e18-3240-4dea-bdb3-ffcfb45be3d4',
          value: 'INBOUND',
          label: 'Inbound',
          position: 1,
          color: 'green',
        },
      ],
    },
    {
      universalIdentifier: STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      description: 'Provider-reported terminal status of the call',
      icon: 'IconStatusChange',
      defaultValue: "'QUEUED'",
      options: [
        {
          id: 'f0872b93-3841-44ff-a16b-3bb02de5f7b7',
          value: 'QUEUED',
          label: 'Queued',
          position: 0,
          color: 'gray',
        },
        {
          id: '71ad7859-0d89-4885-b894-0c49e5c8e0e1',
          value: 'RINGING',
          label: 'Ringing',
          position: 1,
          color: 'yellow',
        },
        {
          id: 'da11bab0-8f10-4c5e-a04e-c997a716a847',
          value: 'IN_PROGRESS',
          label: 'In progress',
          position: 2,
          color: 'blue',
        },
        {
          id: 'a3e7b4a8-e37d-45db-b2ee-657411f5f208',
          value: 'COMPLETED',
          label: 'Completed',
          position: 3,
          color: 'green',
        },
        {
          id: '496be83b-5574-4459-8e09-38a2f10bafd7',
          value: 'NO_ANSWER',
          label: 'No answer',
          position: 4,
          color: 'orange',
        },
        {
          id: 'a4ec47c3-4bf5-4f9f-905b-3c31ef249675',
          value: 'BUSY',
          label: 'Busy',
          position: 5,
          color: 'orange',
        },
        {
          id: '5ae564ef-c788-48cd-be81-498e0f74808f',
          value: 'FAILED',
          label: 'Failed',
          position: 6,
          color: 'red',
        },
      ],
    },
    {
      universalIdentifier: FROM_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'fromNumber',
      label: 'From',
      description: 'E.164 number of the originating party',
      icon: 'IconPhone',
    },
    {
      universalIdentifier: TO_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'toNumber',
      label: 'To',
      description: 'E.164 number of the destination party',
      icon: 'IconPhone',
    },
    {
      universalIdentifier: STARTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'startedAt',
      label: 'Started at',
      description: 'When the provider initiated the call leg',
      icon: 'IconCalendar',
    },
    {
      universalIdentifier: ANSWERED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'answeredAt',
      label: 'Answered at',
      description: 'When the called party picked up (null for missed calls)',
      icon: 'IconCalendar',
    },
    {
      universalIdentifier: ENDED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'endedAt',
      label: 'Ended at',
      description: 'When the call leg terminated',
      icon: 'IconCalendar',
    },
    {
      universalIdentifier: DURATION_SEC_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'durationSec',
      label: 'Duration (seconds)',
      description: 'Billable duration in whole seconds, as reported by the provider',
      icon: 'IconClock',
    },
    {
      universalIdentifier: RECORDING_URL_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'recordingUrl',
      label: 'Recording URL',
      description: 'Provider-hosted URL of the call recording, if recording was enabled',
      icon: 'IconFile',
    },
    {
      universalIdentifier: TRANSCRIPT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RICH_TEXT,
      name: 'transcript',
      label: 'Transcript',
      description: 'Speaker-attributed transcript of the recording',
      icon: 'IconMessage',
    },
    {
      universalIdentifier: SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RICH_TEXT,
      name: 'summary',
      label: 'Summary',
      description: 'AI-generated summary of the call',
      icon: 'IconSparkles',
    },
    {
      universalIdentifier: PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'provider',
      label: 'Provider',
      description: 'Telephony provider that handled this call',
      icon: 'IconPlug',
      defaultValue: "'TWILIO'",
      options: [
        {
          id: 'fbcad4a6-02ad-40d7-9c82-0755672da94c',
          value: 'TWILIO',
          label: 'Twilio',
          position: 0,
          color: 'red',
        },
        {
          id: '03adc078-6376-4933-a8af-fc78a55e7028',
          value: 'VONAGE',
          label: 'Vonage',
          position: 1,
          color: 'purple',
        },
        {
          id: '636af429-cd5a-402a-ac05-ec207a747e94',
          value: 'RINGCENTRAL',
          label: 'RingCentral',
          position: 2,
          color: 'orange',
        },
        {
          id: '6f26a9b9-6460-4b18-a22d-46c6df3d40f1',
          value: 'AIRCALL',
          label: 'Aircall',
          position: 3,
          color: 'green',
        },
      ],
    },
    {
      universalIdentifier: PROVIDER_CALL_SID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'providerCallSid',
      label: 'Provider call ID',
      description: 'Identifier for this call inside the provider (used for reconciliation)',
      icon: 'IconNumber',
    },
    {
      universalIdentifier: COST_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.CURRENCY,
      name: 'cost',
      label: 'Cost',
      description: 'Provider-reported call cost',
      icon: 'IconCurrencyDollar',
    },
    {
      universalIdentifier: CREATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'createdAt',
      label: 'Created at',
      description: 'When the Call record was first written',
      icon: 'IconCalendar',
    },
  ],
});
