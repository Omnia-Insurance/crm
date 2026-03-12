import { defineView } from 'twenty-sdk';

import {
  MATCH_RESULT_VIEW_ID,
  MATCH_RESULT_OBJECT_ID,
  MR_NAME_FIELD_ID,
  MR_CONFIDENCE_FIELD_ID,
  MR_MATCH_METHOD_FIELD_ID,
  MR_MATCH_STATUS_FIELD_ID,
  NORMALIZED_BOOK_ROW_ON_MATCH_RESULT_ID,
  CRM_POLICY_MIRROR_ON_MATCH_RESULT_ID,
  SOURCE_FILE_ON_MATCH_RESULT_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: MATCH_RESULT_VIEW_ID,
  name: 'Match Results',
  objectUniversalIdentifier: MATCH_RESULT_OBJECT_ID,
  icon: 'IconLink',
  position: 4,
  fields: [
    {
      universalIdentifier: '50a1b2c3-0001-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: MR_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '50a1b2c3-0001-4000-8000-000000000002',
      fieldMetadataUniversalIdentifier: MR_CONFIDENCE_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '50a1b2c3-0001-4000-8000-000000000003',
      fieldMetadataUniversalIdentifier: MR_MATCH_METHOD_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 2,
    },
    {
      universalIdentifier: '50a1b2c3-0001-4000-8000-000000000004',
      fieldMetadataUniversalIdentifier: MR_MATCH_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: '50a1b2c3-0001-4000-8000-000000000005',
      fieldMetadataUniversalIdentifier: NORMALIZED_BOOK_ROW_ON_MATCH_RESULT_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
    {
      universalIdentifier: '50a1b2c3-0001-4000-8000-000000000006',
      fieldMetadataUniversalIdentifier: CRM_POLICY_MIRROR_ON_MATCH_RESULT_ID,
      isVisible: true,
      size: 12,
      position: 5,
    },
    {
      universalIdentifier: '50a1b2c3-0001-4000-8000-000000000007',
      fieldMetadataUniversalIdentifier: SOURCE_FILE_ON_MATCH_RESULT_ID,
      isVisible: true,
      size: 12,
      position: 6,
    },
  ],
});
