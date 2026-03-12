import { defineView } from 'twenty-sdk';

import {
  CRM_POLICY_MIRROR_VIEW_ID,
  CRM_POLICY_MIRROR_OBJECT_ID,
  CPM_NAME_FIELD_ID,
  CPM_POLICY_NUMBER_FIELD_ID,
  CPM_CARRIER_NAME_FIELD_ID,
  CPM_AGENT_NAME_FIELD_ID,
  CPM_EFFECTIVE_DATE_FIELD_ID,
  CPM_CRM_STATUS_FIELD_ID,
  CPM_LAST_CRM_SYNC_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: CRM_POLICY_MIRROR_VIEW_ID,
  name: 'CRM Policy Mirrors',
  objectUniversalIdentifier: CRM_POLICY_MIRROR_OBJECT_ID,
  icon: 'IconCopy',
  position: 3,
  fields: [
    {
      universalIdentifier: '40a1b2c3-0001-4000-8000-000000000001',
      fieldMetadataUniversalIdentifier: CPM_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '40a1b2c3-0001-4000-8000-000000000002',
      fieldMetadataUniversalIdentifier: CPM_POLICY_NUMBER_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '40a1b2c3-0001-4000-8000-000000000003',
      fieldMetadataUniversalIdentifier: CPM_CARRIER_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 2,
    },
    {
      universalIdentifier: '40a1b2c3-0001-4000-8000-000000000004',
      fieldMetadataUniversalIdentifier: CPM_AGENT_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: '40a1b2c3-0001-4000-8000-000000000005',
      fieldMetadataUniversalIdentifier: CPM_EFFECTIVE_DATE_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
    {
      universalIdentifier: '40a1b2c3-0001-4000-8000-000000000006',
      fieldMetadataUniversalIdentifier: CPM_CRM_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 5,
    },
    {
      universalIdentifier: '40a1b2c3-0001-4000-8000-000000000007',
      fieldMetadataUniversalIdentifier: CPM_LAST_CRM_SYNC_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 6,
    },
  ],
});
