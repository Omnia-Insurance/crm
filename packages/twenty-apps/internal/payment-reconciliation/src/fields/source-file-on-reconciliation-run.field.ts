import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  RECONCILIATION_RUN_OBJECT_ID,
  SOURCE_FILE_OBJECT_ID,
  SOURCE_FILE_ON_RECONCILIATION_RUN_ID,
  RECONCILIATION_RUNS_ON_SOURCE_FILE_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SOURCE_FILE_ON_RECONCILIATION_RUN_ID,
  objectUniversalIdentifier: RECONCILIATION_RUN_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'sourceFile',
  label: 'Source File',
  relationTargetObjectMetadataUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    RECONCILIATION_RUNS_ON_SOURCE_FILE_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'sourceFileId',
  },
  icon: 'IconFileUpload',
});
