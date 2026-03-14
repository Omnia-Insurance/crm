import { defineView } from 'twenty-sdk';

import {
  STATUS_CHANGE_LOG_VIEW_ID,
  STATUS_CHANGE_LOG_OBJECT_ID,
  SCL_NAME_FIELD_ID,
  SCL_CRM_POLICY_NUMBER_FIELD_ID,
  SCL_OLD_STATUS_FIELD_ID,
  SCL_NEW_STATUS_FIELD_ID,
  SCL_CARRIER_NAME_FIELD_ID,
  SCL_APPLIED_AT_FIELD_ID,
  SCL_REVERTED_FIELD_ID,
  SOURCE_FILE_ON_STATUS_CHANGE_LOG_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: STATUS_CHANGE_LOG_VIEW_ID,
  name: 'Status Change Logs',
  objectUniversalIdentifier: STATUS_CHANGE_LOG_OBJECT_ID,
  icon: 'IconHistory',
  position: 6,
  fields: [
    {
      universalIdentifier: '71142757-cf14-4d23-a71a-4d921712b5e3',
      fieldMetadataUniversalIdentifier: SCL_NAME_FIELD_ID,
      isVisible: true,
      size: 14,
      position: 0,
    },
    {
      universalIdentifier: 'ba558407-ef53-47e1-9bf5-75a71d5ddb47',
      fieldMetadataUniversalIdentifier: SCL_CRM_POLICY_NUMBER_FIELD_ID,
      isVisible: true,
      size: 10,
      position: 1,
    },
    {
      universalIdentifier: '4ddda394-1526-442d-a638-dee85a174e55',
      fieldMetadataUniversalIdentifier: SCL_OLD_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 2,
    },
    {
      universalIdentifier: '2ba57674-e78a-48a6-a615-606724f1fe95',
      fieldMetadataUniversalIdentifier: SCL_NEW_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: 'fb9d5a8f-56b5-4d79-be62-40d13fd18285',
      fieldMetadataUniversalIdentifier: SCL_CARRIER_NAME_FIELD_ID,
      isVisible: true,
      size: 10,
      position: 4,
    },
    {
      universalIdentifier: '513feaed-8a72-4d51-81f5-57af9e16e7b7',
      fieldMetadataUniversalIdentifier: SCL_APPLIED_AT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 5,
    },
    {
      universalIdentifier: '7423f074-f154-455c-af42-6bddff533a41',
      fieldMetadataUniversalIdentifier: SCL_REVERTED_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 6,
    },
    {
      universalIdentifier: '1de38a5e-a320-4aa5-8948-5af2c0b6bb1c',
      fieldMetadataUniversalIdentifier: SOURCE_FILE_ON_STATUS_CHANGE_LOG_ID,
      isVisible: true,
      size: 12,
      position: 7,
    },
  ],
});
