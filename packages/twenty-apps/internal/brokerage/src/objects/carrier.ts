import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import {
  CARRIER_ACTIVE_FIELD_ID,
  CARRIER_NAME_FIELD_ID,
  CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_POLICIES_FIELD_ID,
  CARRIER_PRODUCT_CARRIER_FIELD_ID,
  CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_PRODUCTS_FIELD_ID,
  POLICY_CARRIER_FIELD_ID,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'carrier',
  namePlural: 'carriers',
  labelSingular: 'Carrier',
  labelPlural: 'Carriers',
  description: 'Insurance carrier.',
  icon: 'IconBuildingBank',
  labelIdentifierFieldMetadataUniversalIdentifier: CARRIER_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: CARRIER_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: CARRIER_ACTIVE_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'active',
      label: 'Active',
      icon: 'IconCircleCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: CARRIER_POLICIES_FIELD_ID,
      type: FieldType.RELATION,
      name: 'policies',
      label: 'Policies',
      icon: 'IconFileText',
      relationTargetObjectMetadataUniversalIdentifier:
        POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: POLICY_CARRIER_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: CARRIER_PRODUCTS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'carrierProducts',
      label: 'Carrier Products',
      icon: 'IconPackage',
      relationTargetObjectMetadataUniversalIdentifier:
        CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CARRIER_PRODUCT_CARRIER_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});

