import {
  buildExportableRelationFieldPaths,
  buildRecordGqlFieldsFromSelectedFieldPaths,
  getRelationFieldFlatKey,
  getRelationFieldValueFromPath,
} from '@/object-record/record-index/export/utils/relationExportFieldPaths';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

describe('relationExportFieldPaths', () => {
  const carrierObjectMetadataItem = {
    id: 'carrier-id',
    nameSingular: 'carrier',
    fields: [
      {
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      },
    ],
  } as any;

  const productTypeObjectMetadataItem = {
    id: 'product-type-id',
    nameSingular: 'productType',
    fields: [
      {
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      },
      {
        name: 'active',
        label: 'Active',
        type: FieldMetadataType.BOOLEAN,
      },
      {
        name: 'product',
        label: 'Product',
        type: FieldMetadataType.RELATION,
        relation: {
          type: RelationType.MANY_TO_ONE,
          targetObjectMetadata: {
            nameSingular: 'product',
          },
        },
      },
    ],
  } as any;

  const productObjectMetadataItem = {
    id: 'product-id',
    nameSingular: 'product',
    fields: [
      {
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      },
      {
        name: 'active',
        label: 'Active',
        type: FieldMetadataType.BOOLEAN,
      },
      {
        name: 'productType',
        label: 'Product Type',
        type: FieldMetadataType.RELATION,
        relation: {
          type: RelationType.MANY_TO_ONE,
          targetObjectMetadata: {
            nameSingular: 'productType',
          },
        },
      },
      {
        name: 'carrier',
        label: 'Carrier',
        type: FieldMetadataType.RELATION,
        relation: {
          type: RelationType.MANY_TO_ONE,
          targetObjectMetadata: {
            nameSingular: 'carrier',
          },
        },
      },
      {
        name: 'policies',
        label: 'Policies',
        type: FieldMetadataType.RELATION,
        relation: {
          type: RelationType.ONE_TO_MANY,
          targetObjectMetadata: {
            nameSingular: 'policy',
          },
        },
      },
      {
        isSystem: true,
        name: 'id',
        label: 'Id',
        type: FieldMetadataType.UUID,
      },
    ],
  } as any;

  const objectMetadataItems = [
    productObjectMetadataItem,
    productTypeObjectMetadataItem,
    carrierObjectMetadataItem,
  ];

  it('builds nested exportable field paths for many-to-one relation fields', () => {
    expect(
      buildExportableRelationFieldPaths({
        objectMetadataItem: productObjectMetadataItem,
        objectMetadataItems,
      }),
    ).toEqual([
      {
        fieldPath: 'name',
        fieldLabel: 'Name',
        fieldType: FieldMetadataType.TEXT,
      },
      {
        fieldPath: 'active',
        fieldLabel: 'Active',
        fieldType: FieldMetadataType.BOOLEAN,
      },
      {
        fieldPath: 'productType.name',
        fieldLabel: 'Product Type / Name',
        fieldType: FieldMetadataType.TEXT,
      },
      {
        fieldPath: 'productType.active',
        fieldLabel: 'Product Type / Active',
        fieldType: FieldMetadataType.BOOLEAN,
      },
      {
        fieldPath: 'carrier.name',
        fieldLabel: 'Carrier / Name',
        fieldType: FieldMetadataType.TEXT,
      },
    ]);
  });

  it('builds nested graphql field selections from selected field paths', () => {
    expect(
      buildRecordGqlFieldsFromSelectedFieldPaths([
        'name',
        'productType.name',
        'productType.active',
        'carrier.name',
      ]),
    ).toEqual({
      id: true,
      name: true,
      productType: {
        name: true,
        active: true,
      },
      carrier: {
        name: true,
      },
    });
  });

  it('reads nested relation values by field path', () => {
    expect(
      getRelationFieldValueFromPath(
        {
          name: 'Premier',
          productType: {
            name: 'Vision',
            active: true,
          },
        },
        'productType.name',
      ),
    ).toBe('Vision');
  });

  it('builds flat csv keys from relation field paths', () => {
    expect(getRelationFieldFlatKey('product', 'productType.name')).toBe(
      'product__productType__name',
    );
  });
});
