import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  SOURCE_FILE_OBJECT_ID,
  STATUS_CHANGE_LOG_OBJECT_ID,
  STATUS_CHANGE_LOGS_ON_SOURCE_FILE_ID,
  SOURCE_FILE_ON_STATUS_CHANGE_LOG_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: STATUS_CHANGE_LOGS_ON_SOURCE_FILE_ID,
  objectUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'statusChangeLogs',
  label: 'Status Change Logs',
  relationTargetObjectMetadataUniversalIdentifier: STATUS_CHANGE_LOG_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    SOURCE_FILE_ON_STATUS_CHANGE_LOG_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
  icon: 'IconHistory',
});
