import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARDS_ON_CALL_FIELD_ID,
  SOURCE_CALL_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: QA_SCORECARDS_ON_CALL_FIELD_ID,
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'qaScorecards',
  label: 'QA Scorecards',
  description: 'Compliance QA scorecards generated for this call.',
  icon: 'IconClipboardCheck',
  relationTargetObjectMetadataUniversalIdentifier:
    QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SOURCE_CALL_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
