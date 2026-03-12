import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  SOURCE_FILE_OBJECT_ID,
  MATCH_RESULT_OBJECT_ID,
  MATCH_RESULTS_ON_SOURCE_FILE_ID,
  SOURCE_FILE_ON_MATCH_RESULT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: MATCH_RESULTS_ON_SOURCE_FILE_ID,
  objectUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'matchResults',
  label: 'Match Results',
  relationTargetObjectMetadataUniversalIdentifier: MATCH_RESULT_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    SOURCE_FILE_ON_MATCH_RESULT_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
  icon: 'IconLink',
});
