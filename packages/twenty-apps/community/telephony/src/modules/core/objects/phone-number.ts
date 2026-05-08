import { defineObject, FieldType } from 'twenty-sdk/define';

// A phone number provisioned by the workspace from a telephony provider.
// Owned by the agency, not the agent — assignment to a workspaceMember
// happens through the sibling phoneAssignment object so reassignment is
// just a soft-delete + new-row operation that keeps history intact.

export const PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER =
  '96fa4715-1b2b-4ba2-b2b0-9c04509b50ea';

export const PHONE_NUMBER_E164_FIELD_UNIVERSAL_IDENTIFIER =
  '931db4a8-4bb2-4c04-bf2e-6c00c7e1cb94';
export const PHONE_NUMBER_FRIENDLY_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  '73b31d44-1bd3-4911-81f2-5685545d82bd';
export const PHONE_NUMBER_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER =
  '6f51eefc-2b9e-40d1-8498-39ad1749cdce';
export const PHONE_NUMBER_PROVIDER_SID_FIELD_UNIVERSAL_IDENTIFIER =
  'd1c3e49e-de3b-4c96-8e4d-3ebfa44ab49c';
export const PHONE_NUMBER_VOICE_ENABLED_FIELD_UNIVERSAL_IDENTIFIER =
  '76cb174c-3282-4ff5-917e-b43450e6e284';
export const PHONE_NUMBER_SMS_ENABLED_FIELD_UNIVERSAL_IDENTIFIER =
  'abc611a5-eaee-486a-8c9d-2e58b3f1e5be';
export const PHONE_NUMBER_MMS_ENABLED_FIELD_UNIVERSAL_IDENTIFIER =
  '6e6125c8-bc22-4186-80ec-9d9fa0ddb60c';
export const PHONE_NUMBER_MONTHLY_PRICE_FIELD_UNIVERSAL_IDENTIFIER =
  'bc2b4864-dfe4-45a0-846c-1f802b92833c';


export default defineObject({
  universalIdentifier: PHONE_NUMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'phoneNumber',
  namePlural: 'phoneNumbers',
  labelSingular: 'Phone number',
  labelPlural: 'Phone numbers',
  description:
    'A phone number provisioned by the workspace from a telephony provider',
  icon: 'IconPhone',
  labelIdentifierFieldMetadataUniversalIdentifier:
    PHONE_NUMBER_E164_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: PHONE_NUMBER_E164_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'e164',
      label: 'Number',
      description: 'E.164-formatted phone number (e.g. +15555550123)',
      icon: 'IconPhone',
    },
    {
      universalIdentifier:
        PHONE_NUMBER_FRIENDLY_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'friendlyName',
      label: 'Friendly name',
      description:
        'Human-readable label shown alongside the number (e.g. "Atlanta inbound", "Sales DID")',
      icon: 'IconMessage',
    },
    {
      universalIdentifier: PHONE_NUMBER_PROVIDER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'provider',
      label: 'Provider',
      description: 'Telephony provider that issued and hosts this number',
      icon: 'IconPlug',
      defaultValue: "'TWILIO'",
      options: [
        {
          id: '67973d24-1348-4f97-b8e9-ecd24591b51f',
          value: 'TWILIO',
          label: 'Twilio',
          position: 0,
          color: 'red',
        },
        {
          id: '5ebafda4-6468-4a5d-bcc8-ca62ea16acfa',
          value: 'VONAGE',
          label: 'Vonage',
          position: 1,
          color: 'purple',
        },
        {
          id: 'f25ef7b4-75b9-4385-9078-28ee501d0f9e',
          value: 'RINGCENTRAL',
          label: 'RingCentral',
          position: 2,
          color: 'orange',
        },
        {
          id: '4bbb0acf-88b2-4b1e-a47e-5aea175ec1ad',
          value: 'AIRCALL',
          label: 'Aircall',
          position: 3,
          color: 'green',
        },
      ],
    },
    {
      universalIdentifier:
        PHONE_NUMBER_PROVIDER_SID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'providerNumberSid',
      label: 'Provider number ID',
      description:
        'Identifier of the IncomingPhoneNumber resource inside the provider (Twilio: PN…)',
      icon: 'IconNumber',
    },
    {
      universalIdentifier:
        PHONE_NUMBER_VOICE_ENABLED_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'voiceEnabled',
      label: 'Voice',
      description: 'Whether this number can place and receive voice calls',
      icon: 'IconPhone',
      defaultValue: true,
    },
    {
      universalIdentifier: PHONE_NUMBER_SMS_ENABLED_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'smsEnabled',
      label: 'SMS',
      description: 'Whether this number can send and receive SMS',
      icon: 'IconMessage',
      defaultValue: true,
    },
    {
      universalIdentifier: PHONE_NUMBER_MMS_ENABLED_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'mmsEnabled',
      label: 'MMS',
      description: 'Whether this number can send and receive MMS',
      icon: 'IconPhoto',
      defaultValue: false,
    },
    {
      universalIdentifier:
        PHONE_NUMBER_MONTHLY_PRICE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.CURRENCY,
      name: 'monthlyPrice',
      label: 'Monthly price',
      description: 'Provider-reported monthly rental cost for this number',
      icon: 'IconCurrencyDollar',
    },
  ],
});
