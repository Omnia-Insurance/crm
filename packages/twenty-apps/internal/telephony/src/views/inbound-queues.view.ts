import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import {
  TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
  TELEPHONY_INBOUND_QUEUES_VIEW_ID,
  TIQ_CAMPAIGN_FIELD_ID,
  TIQ_NAME_FIELD_ID,
  TIQ_PRIORITY_FIELD_ID,
  TIQ_PROVIDER_NUMBER_FIELD_ID,
  TIQ_STATUS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: TELEPHONY_INBOUND_QUEUES_VIEW_ID,
  name: 'Active Inbound Queues',
  objectUniversalIdentifier: TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
  icon: 'IconPhoneIncoming',
  position: 1,
  fields: [
    {
      universalIdentifier: '3f83bbf0-78b4-4d03-a994-0537bafb5341',
      fieldMetadataUniversalIdentifier: TIQ_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '7dd76379-2ea1-46d6-aec8-e642330f8daa',
      fieldMetadataUniversalIdentifier: TIQ_PROVIDER_NUMBER_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '148d855c-0964-4c34-bae3-40a7c7577efa',
      fieldMetadataUniversalIdentifier: TIQ_STATUS_FIELD_ID,
      isVisible: true,
      size: 10,
      position: 2,
    },
    {
      universalIdentifier: 'f02dc78e-b57a-42dc-9df8-3f11026265f5',
      fieldMetadataUniversalIdentifier: TIQ_PRIORITY_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 3,
    },
    {
      universalIdentifier: '861084d4-88b3-4e2a-8c1b-5b0bddf97ae6',
      fieldMetadataUniversalIdentifier: TIQ_CAMPAIGN_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
  ],
  filters: [
    {
      universalIdentifier: 'd0668e53-7940-4a26-b2f1-11ae708dfbce',
      fieldMetadataUniversalIdentifier: TIQ_STATUS_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: 'ACTIVE',
    },
  ],
  sorts: [
    {
      universalIdentifier: 'f62ac1e9-3f65-453d-a1f6-fbba293c1146',
      fieldMetadataUniversalIdentifier: TIQ_PRIORITY_FIELD_ID,
      direction: ViewSortDirection.ASC,
    },
  ],
});
