import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  NORMALIZED_BOOK_ROW_OBJECT_ID,
  SOURCE_FILE_OBJECT_ID,
  SOURCE_FILE_ON_NORMALIZED_BOOK_ROW_ID,
  NORMALIZED_BOOK_ROWS_ON_SOURCE_FILE_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SOURCE_FILE_ON_NORMALIZED_BOOK_ROW_ID,
  objectUniversalIdentifier: NORMALIZED_BOOK_ROW_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'sourceFile',
  label: 'Source File',
  relationTargetObjectMetadataUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    NORMALIZED_BOOK_ROWS_ON_SOURCE_FILE_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'sourceFileId',
  },
  icon: 'IconFileUpload',
});
