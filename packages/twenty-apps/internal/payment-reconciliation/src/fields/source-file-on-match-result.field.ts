import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  MATCH_RESULT_OBJECT_ID,
  SOURCE_FILE_OBJECT_ID,
  SOURCE_FILE_ON_MATCH_RESULT_ID,
  MATCH_RESULTS_ON_SOURCE_FILE_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SOURCE_FILE_ON_MATCH_RESULT_ID,
  objectUniversalIdentifier: MATCH_RESULT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'sourceFile',
  label: 'Source File',
  relationTargetObjectMetadataUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    MATCH_RESULTS_ON_SOURCE_FILE_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'sourceFileId',
  },
  icon: 'IconFileUpload',
});
