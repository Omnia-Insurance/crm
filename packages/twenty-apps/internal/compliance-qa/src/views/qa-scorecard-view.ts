import {
  QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  NAME_FIELD_ID,
  OVERALL_SCORE_FIELD_ID,
  OVERALL_RESULT_FIELD_ID,
  CALL_TYPE_FIELD_ID,
  HAS_RED_FLAG_FIELD_ID,
  STATUS_FIELD_ID,
  ANALYZED_AT_FIELD_ID,
  OPENING_SCORE_FIELD_ID,
  SCORE_DETAILS_FIELD_ID,
  RECOMMENDATIONS_FIELD_ID,
} from 'src/objects/qa-scorecard';
import { defineView } from 'twenty-sdk';

export const QA_SCORECARD_VIEW_UNIVERSAL_IDENTIFIER =
  'f1a2b3c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c';

export default defineView({
  universalIdentifier: QA_SCORECARD_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'QA Scorecards',
  objectUniversalIdentifier: QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconClipboardCheck',
  position: 0,
  fields: [
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000002',
      fieldMetadataUniversalIdentifier: OVERALL_SCORE_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 1,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000003',
      fieldMetadataUniversalIdentifier: OVERALL_RESULT_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 2,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000004',
      fieldMetadataUniversalIdentifier: CALL_TYPE_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 3,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000005',
      fieldMetadataUniversalIdentifier: HAS_RED_FLAG_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 4,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000006',
      fieldMetadataUniversalIdentifier: STATUS_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 5,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000007',
      fieldMetadataUniversalIdentifier: ANALYZED_AT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 6,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000008',
      fieldMetadataUniversalIdentifier: OPENING_SCORE_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 7,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000009',
      fieldMetadataUniversalIdentifier: SCORE_DETAILS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 8,
    },
    {
      universalIdentifier: 'a1000001-0000-4000-8000-000000000010',
      fieldMetadataUniversalIdentifier: RECOMMENDATIONS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 9,
    },
  ],
});
