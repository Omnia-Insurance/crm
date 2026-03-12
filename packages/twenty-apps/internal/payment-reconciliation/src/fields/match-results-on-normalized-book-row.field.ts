import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  NORMALIZED_BOOK_ROW_OBJECT_ID,
  MATCH_RESULT_OBJECT_ID,
  MATCH_RESULTS_ON_NORMALIZED_BOOK_ROW_ID,
  NORMALIZED_BOOK_ROW_ON_MATCH_RESULT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: MATCH_RESULTS_ON_NORMALIZED_BOOK_ROW_ID,
  objectUniversalIdentifier: NORMALIZED_BOOK_ROW_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'matchResults',
  label: 'Match Results',
  relationTargetObjectMetadataUniversalIdentifier: MATCH_RESULT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    NORMALIZED_BOOK_ROW_ON_MATCH_RESULT_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
  icon: 'IconLink',
});
