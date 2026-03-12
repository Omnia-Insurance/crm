import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  MATCH_RESULT_OBJECT_ID,
  CRM_POLICY_MIRROR_OBJECT_ID,
  CRM_POLICY_MIRROR_ON_MATCH_RESULT_ID,
  MATCH_RESULTS_ON_CRM_POLICY_MIRROR_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CRM_POLICY_MIRROR_ON_MATCH_RESULT_ID,
  objectUniversalIdentifier: MATCH_RESULT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'crmPolicyMirror',
  label: 'CRM Policy Mirror',
  relationTargetObjectMetadataUniversalIdentifier:
    CRM_POLICY_MIRROR_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    MATCH_RESULTS_ON_CRM_POLICY_MIRROR_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'crmPolicyMirrorId',
  },
  icon: 'IconCopy',
});
