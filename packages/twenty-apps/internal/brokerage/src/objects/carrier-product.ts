import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { STATE_OPTIONS } from 'src/constants/field-options';
import {
  CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_PRODUCT_ACTIVE_FIELD_ID,
  CARRIER_PRODUCT_CARRIER_FIELD_ID,
  CARRIER_PRODUCT_COMMISSION_FIELD_ID,
  CARRIER_PRODUCT_NAME_FIELD_ID,
  CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_PRODUCT_PRODUCT_FIELD_ID,
  CARRIER_PRODUCT_STATES_AVAILABLE_FIELD_ID,
  CARRIER_PRODUCTS_FIELD_ID,
  PRODUCT_CARRIERS_FIELD_ID,
  PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'carrierProduct',
  namePlural: 'carrierProducts',
  labelSingular: 'Carrier Product',
  labelPlural: 'Carrier Products',
  description: 'Carrier-specific insurance product configuration.',
  icon: 'IconPackages',
  labelIdentifierFieldMetadataUniversalIdentifier:
    CARRIER_PRODUCT_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: CARRIER_PRODUCT_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: CARRIER_PRODUCT_COMMISSION_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'commission',
      label: 'Commission',
      icon: 'IconCurrencyDollar',
    },
    {
      universalIdentifier: CARRIER_PRODUCT_ACTIVE_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'active',
      label: 'Active',
      icon: 'IconCircleCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: CARRIER_PRODUCT_STATES_AVAILABLE_FIELD_ID,
      type: FieldType.MULTI_SELECT,
      name: 'statesAvailable',
      label: 'States Available',
      icon: 'IconMap2',
      options: STATE_OPTIONS,
    },
    {
      universalIdentifier: CARRIER_PRODUCT_CARRIER_FIELD_ID,
      type: FieldType.RELATION,
      name: 'carrier',
      label: 'Carrier',
      icon: 'IconBuildingBank',
      relationTargetObjectMetadataUniversalIdentifier:
        CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: CARRIER_PRODUCTS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'carrierId',
      },
    },
    {
      universalIdentifier: CARRIER_PRODUCT_PRODUCT_FIELD_ID,
      type: FieldType.RELATION,
      name: 'product',
      label: 'Product',
      icon: 'IconPackage',
      relationTargetObjectMetadataUniversalIdentifier:
        PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: PRODUCT_CARRIERS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'productId',
      },
    },
  ],
});

