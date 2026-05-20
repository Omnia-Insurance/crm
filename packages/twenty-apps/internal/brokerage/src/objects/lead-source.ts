import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';
import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import {
  CALL_LEAD_SOURCE_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_SOURCE_ACTIVE_FIELD_ID,
  LEAD_SOURCE_CALLS_FIELD_ID,
  LEAD_SOURCE_COST_PER_CALL_FIELD_ID,
  LEAD_SOURCE_LEADS_FIELD_ID,
  LEAD_SOURCE_MINIMUM_CALL_DURATION_FIELD_ID,
  LEAD_SOURCE_NAME_FIELD_ID,
  LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_SOURCE_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'leadSource',
  namePlural: 'leadSources',
  labelSingular: 'Lead Source',
  labelPlural: 'Lead Sources',
  description: 'Source or campaign that generated brokerage leads.',
  icon: 'IconRoute',
  labelIdentifierFieldMetadataUniversalIdentifier: LEAD_SOURCE_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: LEAD_SOURCE_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: LEAD_SOURCE_ACTIVE_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'active',
      label: 'Active',
      icon: 'IconCircleCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: LEAD_SOURCE_COST_PER_CALL_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'costPerCall',
      label: 'Cost Per Call',
      icon: 'IconCurrencyDollar',
    },
    {
      universalIdentifier: LEAD_SOURCE_MINIMUM_CALL_DURATION_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'minimumCallDuration',
      label: 'Minimum Call Duration',
      icon: 'IconClock',
    },
    {
      universalIdentifier: LEAD_SOURCE_LEADS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'leads',
      label: 'Leads',
      icon: 'IconTargetArrow',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier: LEAD_SOURCE_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: LEAD_SOURCE_CALLS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'calls',
      label: 'Calls',
      icon: 'IconPhoneCall',
      relationTargetObjectMetadataUniversalIdentifier:
        CALL_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: CALL_LEAD_SOURCE_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});

