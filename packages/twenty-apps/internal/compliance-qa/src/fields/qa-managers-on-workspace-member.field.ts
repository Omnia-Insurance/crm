import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_MANAGER_WORKSPACE_MEMBER_FIELD_ID,
  QA_MANAGERS_ON_WORKSPACE_MEMBER_FIELD_ID,
} from 'src/constants/universal-identifiers';

export { QA_MANAGERS_ON_WORKSPACE_MEMBER_FIELD_ID };

export default defineField({
  universalIdentifier: QA_MANAGERS_ON_WORKSPACE_MEMBER_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'complianceQaManagers',
  label: 'Compliance QA Managers',
  description:
    'Compliance QA manager records that point to this workspace member.',
  relationTargetObjectMetadataUniversalIdentifier:
    QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    QA_MANAGER_WORKSPACE_MEMBER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
