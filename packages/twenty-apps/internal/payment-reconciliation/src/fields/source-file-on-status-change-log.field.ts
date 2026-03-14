import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  STATUS_CHANGE_LOG_OBJECT_ID,
  SOURCE_FILE_OBJECT_ID,
  SOURCE_FILE_ON_STATUS_CHANGE_LOG_ID,
  STATUS_CHANGE_LOGS_ON_SOURCE_FILE_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SOURCE_FILE_ON_STATUS_CHANGE_LOG_ID,
  objectUniversalIdentifier: STATUS_CHANGE_LOG_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'sourceFile',
  label: 'Source File',
  relationTargetObjectMetadataUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    STATUS_CHANGE_LOGS_ON_SOURCE_FILE_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'sourceFileId',
  },
  icon: 'IconFileUpload',
});
