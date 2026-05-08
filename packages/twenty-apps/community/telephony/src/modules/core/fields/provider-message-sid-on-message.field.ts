import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

// Provider-side identifier for the message (e.g. Twilio's `SM…` Message SID).
// Used to reconcile delivery callbacks back to the originating row and to
// dedupe webhook retries.

export const PROVIDER_MESSAGE_SID_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER =
  '2c7331da-bedd-4757-948a-cf5d70a7c196';

export default defineField({
  universalIdentifier:
    PROVIDER_MESSAGE_SID_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.message.universalIdentifier,
  type: FieldType.TEXT,
  name: 'providerMessageSid',
  label: 'Provider message ID',
  description:
    'Identifier of this message inside the provider (Twilio: SM…). Used for reconciling delivery callbacks.',
  icon: 'IconNumber',
});
