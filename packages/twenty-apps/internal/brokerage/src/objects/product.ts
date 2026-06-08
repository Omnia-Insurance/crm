import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  CARRIER_PRODUCT_CARRIER_FIELD_ID,
  CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_PRODUCT_PRODUCT_FIELD_ID,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  POLICY_PRODUCT_FIELD_ID,
  PRODUCT_ACTIVE_FIELD_ID,
  PRODUCT_CARRIERS_FIELD_ID,
  PRODUCT_NAME_FIELD_ID,
  PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_POLICIES_FIELD_ID,
  PRODUCT_PRODUCT_TYPE_FIELD_ID,
  PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_TYPE_PRODUCTS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'product',
  namePlural: 'products',
  labelSingular: 'Product',
  labelPlural: 'Products',
  description: 'Insurance product.',
  icon: 'IconPackage',
  labelIdentifierFieldMetadataUniversalIdentifier: PRODUCT_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: PRODUCT_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: PRODUCT_ACTIVE_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'active',
      label: 'Active',
      icon: 'IconCircleCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: PRODUCT_PRODUCT_TYPE_FIELD_ID,
      type: FieldType.RELATION,
      name: 'productType',
      label: 'Product Type',
      icon: 'IconCategory',
      relationTargetObjectMetadataUniversalIdentifier:
        PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        PRODUCT_TYPE_PRODUCTS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'productTypeId',
      },
    },
    {
      universalIdentifier: PRODUCT_POLICIES_FIELD_ID,
      type: FieldType.RELATION,
      name: 'policies',
      label: 'Policies',
      icon: 'IconFileText',
      relationTargetObjectMetadataUniversalIdentifier:
        POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: POLICY_PRODUCT_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: PRODUCT_CARRIERS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'productCarriers',
      label: 'Product Carriers',
      icon: 'IconPackage',
      relationTargetObjectMetadataUniversalIdentifier:
        CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CARRIER_PRODUCT_PRODUCT_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
        junctionTargetFieldUniversalIdentifier:
          CARRIER_PRODUCT_CARRIER_FIELD_ID,
      },
    },
  ],
});
