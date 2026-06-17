import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  BROKERAGE_LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_SOURCE_TELEPHONY_CAMPAIGNS_FIELD_ID,
  TC_LEAD_SOURCE_FIELD_ID,
  TELEPHONY_CAMPAIGN_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier: BROKERAGE_LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  universalIdentifier: LEAD_SOURCE_TELEPHONY_CAMPAIGNS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyCampaigns',
  label: 'Telephony Campaigns',
  icon: 'IconSpeakerphone',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_CAMPAIGN_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: TC_LEAD_SOURCE_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
