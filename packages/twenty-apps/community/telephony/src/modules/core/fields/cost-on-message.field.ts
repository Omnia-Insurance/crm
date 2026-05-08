import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

// Per-message cost reported by the provider in the delivery callback.

export const COST_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER =
  'f300c518-79d9-43cc-b63b-afd9fbb9feac';

export default defineField({
  universalIdentifier: COST_ON_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.message.universalIdentifier,
  type: FieldType.CURRENCY,
  name: 'cost',
  label: 'Cost',
  description: 'Provider-reported cost for this message',
  icon: 'IconCurrencyDollar',
});
