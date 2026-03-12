import { defineView } from 'twenty-sdk';

import {
  MATCH_OVERRIDE_VIEW_ID,
  MATCH_OVERRIDE_OBJECT_ID,
  MO_NAME_FIELD_ID,
  MO_CARRIER_POLICY_NUMBER_FIELD_ID,
  MO_CARRIER_NAME_FIELD_ID,
  MO_CRM_POLICY_NUMBER_FIELD_ID,
  MO_IS_ACTIVE_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: MATCH_OVERRIDE_VIEW_ID,
  name: 'Match Overrides',
  objectUniversalIdentifier: MATCH_OVERRIDE_OBJECT_ID,
  icon: 'IconAdjustments',
  position: 5,
  fields: [
    {
      universalIdentifier: '60a1b2c3-0001-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: MO_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '60a1b2c3-0001-4000-8000-000000000002',
      fieldMetadataUniversalIdentifier: MO_CARRIER_POLICY_NUMBER_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '60a1b2c3-0001-4000-8000-000000000003',
      fieldMetadataUniversalIdentifier: MO_CARRIER_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 2,
    },
    {
      universalIdentifier: '60a1b2c3-0001-4000-8000-000000000004',
      fieldMetadataUniversalIdentifier: MO_CRM_POLICY_NUMBER_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: '60a1b2c3-0001-4000-8000-000000000005',
      fieldMetadataUniversalIdentifier: MO_IS_ACTIVE_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
  ],
});
