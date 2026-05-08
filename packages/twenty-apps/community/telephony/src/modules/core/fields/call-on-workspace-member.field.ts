import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CALL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/call';
import { WORKSPACE_MEMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/workspace-member-on-call.field';

export const CALL_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER =
  'c6d69f7a-f25b-4193-bd41-1cb6a96d5924';

export default defineField({
  universalIdentifier: CALL_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'telephonyCalls',
  label: 'Telephony calls',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier:
    CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    WORKSPACE_MEMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
