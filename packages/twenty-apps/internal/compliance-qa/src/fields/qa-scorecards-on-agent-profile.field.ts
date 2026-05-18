import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  AGENT_FIELD_ID,
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARDS_ON_AGENT_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: QA_SCORECARDS_ON_AGENT_FIELD_ID,
  objectUniversalIdentifier: AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'qaScorecards',
  label: 'QA Scorecards',
  description: 'Compliance QA scorecards generated for this agent.',
  icon: 'IconClipboardCheck',
  relationTargetObjectMetadataUniversalIdentifier:
    QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: AGENT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
