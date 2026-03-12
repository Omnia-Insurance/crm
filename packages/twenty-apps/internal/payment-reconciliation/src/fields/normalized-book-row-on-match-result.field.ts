import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  MATCH_RESULT_OBJECT_ID,
  NORMALIZED_BOOK_ROW_OBJECT_ID,
  NORMALIZED_BOOK_ROW_ON_MATCH_RESULT_ID,
  MATCH_RESULTS_ON_NORMALIZED_BOOK_ROW_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: NORMALIZED_BOOK_ROW_ON_MATCH_RESULT_ID,
  objectUniversalIdentifier: MATCH_RESULT_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'normalizedBookRow',
  label: 'Normalized Book Row',
  relationTargetObjectMetadataUniversalIdentifier:
    NORMALIZED_BOOK_ROW_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    MATCH_RESULTS_ON_NORMALIZED_BOOK_ROW_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'normalizedBookRowId',
  },
  icon: 'IconTable',
});
