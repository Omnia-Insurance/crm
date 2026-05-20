import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import {
  PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_PRODUCT_TYPE_FIELD_ID,
  PRODUCT_TYPE_NAME_FIELD_ID,
  PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_TYPE_PRODUCTS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'productType',
  namePlural: 'productTypes',
  labelSingular: 'Product Type',
  labelPlural: 'Product Types',
  description: 'Insurance product category.',
  icon: 'IconCategory',
  labelIdentifierFieldMetadataUniversalIdentifier: PRODUCT_TYPE_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: PRODUCT_TYPE_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: PRODUCT_TYPE_PRODUCTS_FIELD_ID,
      type: FieldType.RELATION,
      name: 'products',
      label: 'Products',
      icon: 'IconPackage',
      relationTargetObjectMetadataUniversalIdentifier:
        PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        PRODUCT_PRODUCT_TYPE_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});

