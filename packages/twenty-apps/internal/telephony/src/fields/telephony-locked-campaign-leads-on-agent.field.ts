import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  AGENT_TELEPHONY_LOCKED_CAMPAIGN_LEADS_FIELD_ID,
  BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  TCL_LOCKED_BY_AGENT_FIELD_ID,
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier: BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  universalIdentifier: AGENT_TELEPHONY_LOCKED_CAMPAIGN_LEADS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyLockedCampaignLeads',
  label: 'Locked Campaign Leads',
  icon: 'IconLock',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    TCL_LOCKED_BY_AGENT_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
