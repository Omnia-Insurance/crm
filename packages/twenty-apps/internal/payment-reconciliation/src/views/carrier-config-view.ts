import { defineView } from 'twenty-sdk';

import {
  CARRIER_CONFIG_VIEW_ID,
  CARRIER_CONFIG_OBJECT_ID,
  CC_NAME_FIELD_ID,
  CC_PARSER_ID_FIELD_ID,
  CC_PAYMENT_LAG_DAYS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: CARRIER_CONFIG_VIEW_ID,
  name: 'Carrier Configs',
  objectUniversalIdentifier: CARRIER_CONFIG_OBJECT_ID,
  icon: 'IconSettings',
  position: 2,
  fields: [
    {
      universalIdentifier: '30a1b2c3-0001-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: CC_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '30a1b2c3-0001-4000-8000-000000000002',
      fieldMetadataUniversalIdentifier: CC_PARSER_ID_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '30a1b2c3-0001-4000-8000-000000000003',
      fieldMetadataUniversalIdentifier: CC_PAYMENT_LAG_DAYS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 2,
    },
  ],
});
