import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LEAD_TELEPHONY_CAMPAIGN_LEADS_FIELD_ID,
  TCL_LEAD_FIELD_ID,
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  universalIdentifier: LEAD_TELEPHONY_CAMPAIGN_LEADS_FIELD_ID,
  type: FieldType.RELATION,
  name: 'telephonyCampaignLeads',
  label: 'Campaign Leads',
  icon: 'IconTargetArrow',
  relationTargetObjectMetadataUniversalIdentifier:
    TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: TCL_LEAD_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
