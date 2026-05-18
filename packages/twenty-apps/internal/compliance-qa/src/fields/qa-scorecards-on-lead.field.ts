import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LEAD_FIELD_ID,
  QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARDS_ON_LEAD_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: QA_SCORECARDS_ON_LEAD_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'complianceQaScorecards',
  label: 'Compliance QA Scorecards',
  description: 'Compliance QA scorecards generated for this lead.',
  icon: 'IconClipboardCheck',
  relationTargetObjectMetadataUniversalIdentifier:
    QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: LEAD_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
