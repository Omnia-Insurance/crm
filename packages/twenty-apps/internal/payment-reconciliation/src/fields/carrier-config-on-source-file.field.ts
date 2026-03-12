import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  SOURCE_FILE_OBJECT_ID,
  CARRIER_CONFIG_OBJECT_ID,
  CARRIER_CONFIG_ON_SOURCE_FILE_ID,
  SOURCE_FILES_ON_CARRIER_CONFIG_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CARRIER_CONFIG_ON_SOURCE_FILE_ID,
  objectUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'carrierConfig',
  label: 'Carrier Config',
  relationTargetObjectMetadataUniversalIdentifier: CARRIER_CONFIG_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    SOURCE_FILES_ON_CARRIER_CONFIG_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'carrierConfigId',
  },
  icon: 'IconSettings',
});
