import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import {
  TCS_AGENT_FIELD_ID,
  TCS_CAMPAIGN_FIELD_ID,
  TCS_DIRECTION_FIELD_ID,
  TCS_LEAD_FIELD_ID,
  TCS_NAME_FIELD_ID,
  TCS_PROVIDER_CALL_ID_FIELD_ID,
  TCS_STARTED_AT_FIELD_ID,
  TCS_STATUS_FIELD_ID,
  TELEPHONY_ACTIVE_CALL_SESSIONS_VIEW_ID,
  TELEPHONY_CALL_SESSION_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: TELEPHONY_ACTIVE_CALL_SESSIONS_VIEW_ID,
  name: 'Active Sessions',
  objectUniversalIdentifier: TELEPHONY_CALL_SESSION_OBJECT_ID,
  icon: 'IconPhoneCalling',
  position: 1,
  fields: [
    {
      universalIdentifier: '5d2efbaa-f067-4964-a628-b6632a363273',
      fieldMetadataUniversalIdentifier: TCS_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: 'c7cabcb7-bc88-428b-956d-41511c2acfb2',
      fieldMetadataUniversalIdentifier: TCS_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: 'f0337811-78c4-46fc-981d-253177f823b4',
      fieldMetadataUniversalIdentifier: TCS_DIRECTION_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 2,
    },
    {
      universalIdentifier: 'ec242239-459b-4937-8ff4-425b864fa7e9',
      fieldMetadataUniversalIdentifier: TCS_PROVIDER_CALL_ID_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: 'fd700b3f-b599-4619-8be4-86d023f47bbc',
      fieldMetadataUniversalIdentifier: TCS_STARTED_AT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
    {
      universalIdentifier: '01aac263-ec57-4a6e-8366-6888d341b77e',
      fieldMetadataUniversalIdentifier: TCS_CAMPAIGN_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 5,
    },
    {
      universalIdentifier: '9b4e3da2-fb59-4b89-9a5a-cf2f1b27484b',
      fieldMetadataUniversalIdentifier: TCS_AGENT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 6,
    },
    {
      universalIdentifier: 'ae564f2a-cfe5-4fbf-a914-8595b5c73189',
      fieldMetadataUniversalIdentifier: TCS_LEAD_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 7,
    },
  ],
  filters: [
    {
      universalIdentifier: '91754962-ac8a-45f2-b32b-a95e28e50c85',
      fieldMetadataUniversalIdentifier: TCS_STATUS_FIELD_ID,
      operand: ViewFilterOperand.IS_NOT,
      value: 'DISPOSITIONED',
    },
  ],
  sorts: [
    {
      universalIdentifier: '81a28b53-38a6-4a8f-909d-fefb99ef3b24',
      fieldMetadataUniversalIdentifier: TCS_STARTED_AT_FIELD_ID,
      direction: ViewSortDirection.DESC,
    },
  ],
});
