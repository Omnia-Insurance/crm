import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import {
  TCE_AGENT_FIELD_ID,
  TCE_BLOCKED_REASON_FIELD_ID,
  TCE_CAMPAIGN_LEAD_FIELD_ID,
  TCE_EVENT_TIME_FIELD_ID,
  TCE_EVENT_TYPE_FIELD_ID,
  TCE_NAME_FIELD_ID,
  TELEPHONY_BLOCKED_ATTEMPTS_VIEW_ID,
  TELEPHONY_CALL_EVENT_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: TELEPHONY_BLOCKED_ATTEMPTS_VIEW_ID,
  name: 'Blocked Attempts',
  objectUniversalIdentifier: TELEPHONY_CALL_EVENT_OBJECT_ID,
  icon: 'IconShieldX',
  position: 1,
  fields: [
    {
      universalIdentifier: '0a49db7d-dcb8-4465-9d41-fca751f234ac',
      fieldMetadataUniversalIdentifier: TCE_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: 'aa87a9b8-ef0b-4e79-ada7-396593b1745d',
      fieldMetadataUniversalIdentifier: TCE_EVENT_TIME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '7fbac8eb-4aeb-4ab9-b9d9-8735f2191486',
      fieldMetadataUniversalIdentifier: TCE_BLOCKED_REASON_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 2,
    },
    {
      universalIdentifier: '7924640c-1a8a-4759-9a84-3ed51e670bbc',
      fieldMetadataUniversalIdentifier: TCE_CAMPAIGN_LEAD_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: '55349a5b-75fa-4ff7-81fd-3c1beb6c5f0f',
      fieldMetadataUniversalIdentifier: TCE_AGENT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
  ],
  filters: [
    {
      universalIdentifier: '87e9841f-bce0-4a85-be79-2c35bc755710',
      fieldMetadataUniversalIdentifier: TCE_EVENT_TYPE_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: 'BLOCKED_ATTEMPT',
    },
  ],
  sorts: [
    {
      universalIdentifier: '8fa79db8-63e1-4000-8046-803352225b15',
      fieldMetadataUniversalIdentifier: TCE_EVENT_TIME_FIELD_ID,
      direction: ViewSortDirection.DESC,
    },
  ],
});
