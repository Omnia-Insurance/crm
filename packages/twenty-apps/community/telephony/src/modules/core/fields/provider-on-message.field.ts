import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

// Adds a `provider` enum to the standard `message` object so SMS rows can
// record which carrier handled them. Email rows fed by the Gmail / Outlook
// / IMAP sync leave this null — the email channels are managed by upstream
// code that doesn't know about this field.
//
// The enum intentionally lists only telephony providers. If upstream Twenty
// later adds first-party email-provider attribution, those values land on a
// different field rather than colliding here.

export const PROVIDER_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER =
  '645552ba-55fc-4b92-9a76-55cd30fa071e';

export default defineField({
  universalIdentifier: PROVIDER_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.message.universalIdentifier,
  type: FieldType.SELECT,
  name: 'telephonyProvider',
  label: 'Telephony provider',
  description:
    'Telephony provider that handled this message (null for email rows)',
  icon: 'IconPlug',
  options: [
    {
      id: '238f54e8-5535-488c-9cef-c46651016324',
      value: 'TWILIO',
      label: 'Twilio',
      position: 0,
      color: 'red',
    },
    {
      id: 'd5d3b87f-a1c6-4e41-baef-afa93ebe67d3',
      value: 'VONAGE',
      label: 'Vonage',
      position: 1,
      color: 'purple',
    },
    {
      id: 'f19e83d0-a4e5-47e7-a33a-dcfbe3ee0754',
      value: 'RINGCENTRAL',
      label: 'RingCentral',
      position: 2,
      color: 'orange',
    },
    {
      id: '3abc83e7-e7b3-4299-bbee-f7ee7fbc0caa',
      value: 'AIRCALL',
      label: 'Aircall',
      position: 3,
      color: 'green',
    },
  ],
});
