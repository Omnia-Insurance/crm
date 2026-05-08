import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/core/objects/phone-assignment';
import { WORKSPACE_MEMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/modules/core/fields/workspace-member-on-phone-assignment.field';

export const PHONE_ASSIGNMENT_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER =
  '876121ab-290e-4f11-aefd-7c79311136fe';

export default defineField({
  universalIdentifier:
    PHONE_ASSIGNMENT_ON_WORKSPACE_MEMBER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'phoneAssignments',
  label: 'Phone assignments',
  icon: 'IconUserPlus',
  relationTargetObjectMetadataUniversalIdentifier:
    PHONE_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    WORKSPACE_MEMBER_ON_PHONE_ASSIGNMENT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
