import { defineObject, FieldType } from 'twenty-sdk/define';

// Links a phoneNumber to a workspaceMember. Append-only with soft-delete:
// reassigning a number is `softDelete(oldRow) + create(newRow)`, so historic
// calls/SMS keep their workspaceMember attribution via their own foreign keys
// and the live owner of any number is `phoneAssignment where deletedAt is null`.
//
// The CSO is the operator who creates and reassigns these rows. Agents see
// their assignments read-only in their personal settings, but can edit
// `forwardToPersonalNumber` and `webrtcEnabled` on their own row.

export const PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER =
  '90d646cb-050e-4f6a-ba2d-a5a0ad7406df';

export const PHONE_ASSIGNMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  '0c0242c2-645d-46ed-a7f3-6de7ea6c0177';
export const PHONE_ASSIGNMENT_IS_DEFAULT_FIELD_UNIVERSAL_IDENTIFIER =
  '1c019889-e9f5-4975-a942-dd7c32bfe6e3';
export const PHONE_ASSIGNMENT_FORWARD_TO_FIELD_UNIVERSAL_IDENTIFIER =
  '242324d4-e9a8-4387-80e1-09fc565ea444';
export const PHONE_ASSIGNMENT_WEBRTC_ENABLED_FIELD_UNIVERSAL_IDENTIFIER =
  '172fcd2c-891f-4252-b90b-ca310d7411e0';
export const PHONE_ASSIGNMENT_OUTBOUND_CALLER_ID_FIELD_UNIVERSAL_IDENTIFIER =
  'ec4f9f78-cc1a-4a2d-bcf1-efd6a35ea5de';

export default defineObject({
  universalIdentifier: PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'phoneAssignment',
  namePlural: 'phoneAssignments',
  labelSingular: 'Phone assignment',
  labelPlural: 'Phone assignments',
  description:
    'Active or historical assignment of a phone number to a workspace member',
  icon: 'IconUserPlus',
  labelIdentifierFieldMetadataUniversalIdentifier:
    PHONE_ASSIGNMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: PHONE_ASSIGNMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description:
        'Auto-generated label combining the number and assigned member',
      icon: 'IconMessage',
    },
    {
      universalIdentifier:
        PHONE_ASSIGNMENT_IS_DEFAULT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'isDefault',
      label: 'Default',
      description:
        'When the member has more than one assigned number, the default one is used as the outbound caller ID',
      icon: 'IconStar',
      defaultValue: false,
    },
    {
      universalIdentifier:
        PHONE_ASSIGNMENT_OUTBOUND_CALLER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'outboundCallerId',
      label: 'Use as caller ID',
      description:
        'Whether outbound calls placed by this member can use this number as the caller ID',
      icon: 'IconPhone',
      defaultValue: true,
    },
    {
      universalIdentifier:
        PHONE_ASSIGNMENT_WEBRTC_ENABLED_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'webrtcEnabled',
      label: 'Ring browser softphone',
      description:
        'When true, inbound calls to this number ring the member\'s browser softphone before falling through to the forwarding number',
      icon: 'IconWorld',
      defaultValue: true,
    },
    {
      universalIdentifier:
        PHONE_ASSIGNMENT_FORWARD_TO_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'forwardToPersonalNumber',
      label: 'Forward to',
      description:
        'E.164 number (typically the agent\'s personal cell) to ring when the browser softphone is offline. Leave blank for voicemail-only fallback.',
      icon: 'IconArrowRight',
    },
  ],
});
