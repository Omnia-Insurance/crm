import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-assignment';
import { PHONE_ASSIGNMENT_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/phone-assignment-on-workspace-member.field';

export const WORKSPACE_MEMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER =
  '1606b7f1-34e2-4f40-a5f8-d7f86fdde882';

export default defineField({
  universalIdentifier:
    WORKSPACE_MEMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'workspaceMember',
  label: 'Workspace member',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    PHONE_ASSIGNMENT_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'workspaceMemberId',
  },
});
