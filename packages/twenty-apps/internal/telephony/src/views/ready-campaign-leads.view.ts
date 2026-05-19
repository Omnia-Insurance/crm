import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import {
  TCL_ATTEMPTS_FIELD_ID,
  TCL_CAMPAIGN_FIELD_ID,
  TCL_LEAD_FIELD_ID,
  TCL_NAME_FIELD_ID,
  TCL_NEXT_CALL_AT_FIELD_ID,
  TCL_PRIORITY_FIELD_ID,
  TCL_STATUS_FIELD_ID,
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  TELEPHONY_READY_CAMPAIGN_LEADS_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: TELEPHONY_READY_CAMPAIGN_LEADS_VIEW_ID,
  name: 'Ready Leads',
  objectUniversalIdentifier: TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  icon: 'IconTargetArrow',
  position: 1,
  fields: [
    {
      universalIdentifier: '4444c5fe-39d6-4309-a017-8697da4e5c99',
      fieldMetadataUniversalIdentifier: TCL_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '4bf5e2e6-a595-469a-a220-09a15cded0f8',
      fieldMetadataUniversalIdentifier: TCL_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '7b1f467f-7a21-4545-8235-a9809dd11867',
      fieldMetadataUniversalIdentifier: TCL_PRIORITY_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 2,
    },
    {
      universalIdentifier: '79038284-3ab5-4933-abf7-14ec24308adc',
      fieldMetadataUniversalIdentifier: TCL_NEXT_CALL_AT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: '6a64d9a6-ec1c-457c-a6e2-37491d84814d',
      fieldMetadataUniversalIdentifier: TCL_ATTEMPTS_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 4,
    },
    {
      universalIdentifier: 'a8d55e53-bec6-4e6b-bf2b-558a0c24d3c9',
      fieldMetadataUniversalIdentifier: TCL_CAMPAIGN_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 5,
    },
    {
      universalIdentifier: 'b0b28bc2-d4cc-40cc-a946-02ee6bca1e11',
      fieldMetadataUniversalIdentifier: TCL_LEAD_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 6,
    },
  ],
  filters: [
    {
      universalIdentifier: 'da681580-118d-4a2a-9807-1425064912f8',
      fieldMetadataUniversalIdentifier: TCL_STATUS_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: 'READY',
    },
  ],
  sorts: [
    {
      universalIdentifier: '16ed3f67-590f-4c76-a606-8a47917a443a',
      fieldMetadataUniversalIdentifier: TCL_PRIORITY_FIELD_ID,
      direction: ViewSortDirection.ASC,
    },
  ],
});
