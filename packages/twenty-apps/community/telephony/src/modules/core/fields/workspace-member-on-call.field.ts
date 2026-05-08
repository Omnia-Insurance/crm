import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CALL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/call';
import { CALL_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/call-on-workspace-member.field';

export const WORKSPACE_MEMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER =
  'f8d6565a-6fb5-40bd-8662-68bc1238b860';

// The agent who handled this call. Stays attached even if the agent is later
// removed from the workspace, so historical attribution survives.
export default defineField({
  universalIdentifier: WORKSPACE_MEMBER_ON_CALL_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'workspaceMember',
  label: 'Agent',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    CALL_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'workspaceMemberId',
  },
});
