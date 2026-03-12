import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  SOURCE_FILE_OBJECT_ID,
  NORMALIZED_BOOK_ROW_OBJECT_ID,
  NORMALIZED_BOOK_ROWS_ON_SOURCE_FILE_ID,
  SOURCE_FILE_ON_NORMALIZED_BOOK_ROW_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: NORMALIZED_BOOK_ROWS_ON_SOURCE_FILE_ID,
  objectUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'normalizedBookRows',
  label: 'Normalized Book Rows',
  relationTargetObjectMetadataUniversalIdentifier:
    NORMALIZED_BOOK_ROW_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    SOURCE_FILE_ON_NORMALIZED_BOOK_ROW_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
  icon: 'IconTable',
});
