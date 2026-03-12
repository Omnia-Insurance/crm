import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  CARRIER_CONFIG_OBJECT_ID,
  SOURCE_FILE_OBJECT_ID,
  SOURCE_FILES_ON_CARRIER_CONFIG_ID,
  CARRIER_CONFIG_ON_SOURCE_FILE_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SOURCE_FILES_ON_CARRIER_CONFIG_ID,
  objectUniversalIdentifier: CARRIER_CONFIG_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'sourceFiles',
  label: 'Source Files',
  relationTargetObjectMetadataUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    CARRIER_CONFIG_ON_SOURCE_FILE_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
  icon: 'IconFileUpload',
});
