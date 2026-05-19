import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import {
  TC_ALLOWED_END_LOCAL_TIME_FIELD_ID,
  TC_ALLOWED_START_LOCAL_TIME_FIELD_ID,
  TC_MAX_ATTEMPTS_FIELD_ID,
  TC_NAME_FIELD_ID,
  TC_PRIORITY_FIELD_ID,
  TC_STATUS_FIELD_ID,
  TELEPHONY_ACTIVE_CAMPAIGNS_VIEW_ID,
  TELEPHONY_CAMPAIGN_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: TELEPHONY_ACTIVE_CAMPAIGNS_VIEW_ID,
  name: 'Active Campaigns',
  objectUniversalIdentifier: TELEPHONY_CAMPAIGN_OBJECT_ID,
  icon: 'IconSpeakerphone',
  position: 1,
  fields: [
    {
      universalIdentifier: 'fdf618d3-b59a-4a37-b7a0-c0ffa05ecade',
      fieldMetadataUniversalIdentifier: TC_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: 'b237f12c-dd05-4a57-8ec0-1ea9b87e34e4',
      fieldMetadataUniversalIdentifier: TC_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '93c36dca-c3ad-40d3-8dad-b35d051afe13',
      fieldMetadataUniversalIdentifier: TC_PRIORITY_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 2,
    },
    {
      universalIdentifier: 'b1746da0-4be7-47d8-8870-e90c541ef262',
      fieldMetadataUniversalIdentifier: TC_ALLOWED_START_LOCAL_TIME_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 3,
    },
    {
      universalIdentifier: '96cb4375-34f1-4dce-9068-c799e2d816dc',
      fieldMetadataUniversalIdentifier: TC_ALLOWED_END_LOCAL_TIME_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 4,
    },
    {
      universalIdentifier: '208ae57f-2656-430e-9c42-c4a148f1bb39',
      fieldMetadataUniversalIdentifier: TC_MAX_ATTEMPTS_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 5,
    },
  ],
  filters: [
    {
      universalIdentifier: '769c7b88-fba8-42f0-bc16-0f9ad421328b',
      fieldMetadataUniversalIdentifier: TC_STATUS_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: 'ACTIVE',
    },
  ],
  sorts: [
    {
      universalIdentifier: 'ac980dda-85d2-43d9-a9b2-71b4d046e046',
      fieldMetadataUniversalIdentifier: TC_PRIORITY_FIELD_ID,
      direction: ViewSortDirection.ASC,
    },
  ],
});
