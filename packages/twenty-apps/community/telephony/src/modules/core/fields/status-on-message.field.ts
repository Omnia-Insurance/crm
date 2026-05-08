import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

// Adds an operational delivery `status` to the standard `message` object.
//
// Used by the telephony app to track SMS lifecycle (QUEUED → SENT → DELIVERED
// or FAILED, plus RECEIVED for inbound). The same field generalizes naturally
// to email — bounced / queued emails could populate it too — so the values
// are not gated to SMS semantics. Existing email rows leave it null.

export const STATUS_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER =
  'fd2379a0-eaad-4dfd-a1c3-06a5893d8b2d';

export default defineField({
  universalIdentifier: STATUS_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.message.universalIdentifier,
  type: FieldType.SELECT,
  name: 'status',
  label: 'Status',
  description: 'Operational delivery status reported by the provider',
  icon: 'IconStatusChange',
  options: [
    {
      id: '4de19e55-bcac-4766-a84d-f80f0a9deca0',
      value: 'QUEUED',
      label: 'Queued',
      position: 0,
      color: 'gray',
    },
    {
      id: 'de65c8ba-4d23-45c1-ba35-f5a2c7729a6a',
      value: 'SENT',
      label: 'Sent',
      position: 1,
      color: 'blue',
    },
    {
      id: '62f6c5bb-48d4-4884-8a58-c492cfe0e503',
      value: 'DELIVERED',
      label: 'Delivered',
      position: 2,
      color: 'green',
    },
    {
      id: 'b8bda91e-4403-45d0-8612-fd34db46a890',
      value: 'FAILED',
      label: 'Failed',
      position: 3,
      color: 'red',
    },
    {
      id: 'b4347e15-cdfe-4dc3-8d65-d1b99a50265e',
      value: 'RECEIVED',
      label: 'Received',
      position: 4,
      color: 'turquoise',
    },
  ],
});
