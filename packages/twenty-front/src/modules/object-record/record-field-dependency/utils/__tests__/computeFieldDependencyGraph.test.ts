import { computeFieldDependencyGraph } from '@/object-record/record-field-dependency/utils/computeFieldDependencyGraph';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { RelationType } from '~/generated-metadata/graphql';

const createMockField = (
  overrides: Partial<FieldMetadataItem> & { id: string; name: string },
): FieldMetadataItem => {
  const { id, name, ...rest } = overrides;

  return {
    type: 'RELATION',
    label: name,
    isActive: true,
    ...rest,
    id,
    name,
  } as unknown as FieldMetadataItem;
};

const createMockObject = (
  overrides: Partial<ObjectMetadataItem> & {
    id: string;
    nameSingular: string;
  },
): ObjectMetadataItem => {
  const { id, nameSingular, ...rest } = overrides;

  return {
    namePlural: nameSingular + 's',
    fields: [],
    readableFields: [],
    updatableFields: [],
    labelIdentifierFieldMetadataId: '',
    indexMetadatas: [],
    ...rest,
    id,
    nameSingular,
  } as unknown as ObjectMetadataItem;
};

describe('computeFieldDependencyGraph', () => {
  it('should detect insurance scenario: Carrier -> ProductType -> CarrierProduct -> PolicyOption', () => {
    const carrierObject = createMockObject({
      id: 'carrier-obj',
      nameSingular: 'carrier',
      fields: [
        createMockField({
          id: 'carrier-name-field',
          name: 'name',
        }),
      ],
    });

    const productTypeObject = createMockObject({
      id: 'productType-obj',
      nameSingular: 'productType',
      fields: [
        createMockField({
          id: 'pt-carrier-field',
          name: 'carrier',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: { id: 'pt-carrier-field', name: 'carrier' },
            targetFieldMetadata: {
              id: 'carrier-pts-field',
              name: 'productTypes',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'productType-obj',
              nameSingular: 'productType',
              namePlural: 'productTypes',
            },
            targetObjectMetadata: {
              id: 'carrier-obj',
              nameSingular: 'carrier',
              namePlural: 'carriers',
            },
          },
        }),
      ],
    });

    const carrierProductObject = createMockObject({
      id: 'carrierProduct-obj',
      nameSingular: 'carrierProduct',
      fields: [
        createMockField({
          id: 'cp-carrier-field',
          name: 'carrier',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: { id: 'cp-carrier-field', name: 'carrier' },
            targetFieldMetadata: {
              id: 'carrier-cps-field',
              name: 'carrierProducts',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'carrierProduct-obj',
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
            targetObjectMetadata: {
              id: 'carrier-obj',
              nameSingular: 'carrier',
              namePlural: 'carriers',
            },
          },
        }),
        createMockField({
          id: 'cp-productType-field',
          name: 'productType',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'cp-productType-field',
              name: 'productType',
            },
            targetFieldMetadata: {
              id: 'pt-cps-field',
              name: 'carrierProducts',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'carrierProduct-obj',
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
            targetObjectMetadata: {
              id: 'productType-obj',
              nameSingular: 'productType',
              namePlural: 'productTypes',
            },
          },
        }),
      ],
    });

    const policyOptionObject = createMockObject({
      id: 'policyOption-obj',
      nameSingular: 'policyOption',
      fields: [
        createMockField({
          id: 'po-carrierProduct-field',
          name: 'carrierProduct',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'po-carrierProduct-field',
              name: 'carrierProduct',
            },
            targetFieldMetadata: {
              id: 'cp-pos-field',
              name: 'policyOptions',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'policyOption-obj',
              nameSingular: 'policyOption',
              namePlural: 'policyOptions',
            },
            targetObjectMetadata: {
              id: 'carrierProduct-obj',
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
          },
        }),
      ],
    });

    // Policy object has carrier, productType, carrierProduct, policyOption relations
    const policyObject = createMockObject({
      id: 'policy-obj',
      nameSingular: 'policy',
      fields: [
        createMockField({
          id: 'policy-carrier-field',
          name: 'carrier',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'policy-carrier-field',
              name: 'carrier',
            },
            targetFieldMetadata: {
              id: 'carrier-policies-field',
              name: 'policies',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'policy-obj',
              nameSingular: 'policy',
              namePlural: 'policies',
            },
            targetObjectMetadata: {
              id: 'carrier-obj',
              nameSingular: 'carrier',
              namePlural: 'carriers',
            },
          },
        }),
        createMockField({
          id: 'policy-productType-field',
          name: 'productType',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'policy-productType-field',
              name: 'productType',
            },
            targetFieldMetadata: {
              id: 'pt-policies-field',
              name: 'policies',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'policy-obj',
              nameSingular: 'policy',
              namePlural: 'policies',
            },
            targetObjectMetadata: {
              id: 'productType-obj',
              nameSingular: 'productType',
              namePlural: 'productTypes',
            },
          },
        }),
        createMockField({
          id: 'policy-carrierProduct-field',
          name: 'carrierProduct',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'policy-carrierProduct-field',
              name: 'carrierProduct',
            },
            targetFieldMetadata: {
              id: 'cp-policies-field',
              name: 'policies',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'policy-obj',
              nameSingular: 'policy',
              namePlural: 'policies',
            },
            targetObjectMetadata: {
              id: 'carrierProduct-obj',
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
          },
        }),
        createMockField({
          id: 'policy-policyOption-field',
          name: 'policyOption',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'policy-policyOption-field',
              name: 'policyOption',
            },
            targetFieldMetadata: {
              id: 'po-policies-field',
              name: 'policies',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'policy-obj',
              nameSingular: 'policy',
              namePlural: 'policies',
            },
            targetObjectMetadata: {
              id: 'policyOption-obj',
              nameSingular: 'policyOption',
              namePlural: 'policyOptions',
            },
          },
        }),
      ],
    });

    const allObjects = [
      carrierObject,
      productTypeObject,
      carrierProductObject,
      policyOptionObject,
      policyObject,
    ];

    const graph = computeFieldDependencyGraph(policyObject, allObjects);

    // productType depends on carrier (because productType obj has a carrier MANY_TO_ONE)
    expect(graph.dependenciesByField['productType']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentFieldName: 'carrier',
          bridgeFieldForeignKeyName: 'carrierId',
        }),
      ]),
    );

    // carrierProduct depends on carrier
    expect(graph.dependenciesByField['carrierProduct']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentFieldName: 'carrier',
          bridgeFieldForeignKeyName: 'carrierId',
        }),
      ]),
    );

    // carrierProduct depends on productType
    expect(graph.dependenciesByField['carrierProduct']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentFieldName: 'productType',
          bridgeFieldForeignKeyName: 'productTypeId',
        }),
      ]),
    );

    // policyOption depends on carrierProduct
    expect(graph.dependenciesByField['policyOption']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentFieldName: 'carrierProduct',
          bridgeFieldForeignKeyName: 'carrierProductId',
        }),
      ]),
    );

    // carrier has dependents: productType, carrierProduct
    expect(graph.dependentsByField['carrier']).toHaveLength(2);

    // productType has dependent: carrierProduct
    expect(graph.dependentsByField['productType']).toHaveLength(1);

    // carrierProduct has dependent: policyOption
    expect(graph.dependentsByField['carrierProduct']).toHaveLength(1);
  });

  it('should return empty graph for object with no relation dependencies', () => {
    const companyObject = createMockObject({
      id: 'company-obj',
      nameSingular: 'company',
      fields: [
        createMockField({
          id: 'company-name',
          name: 'name',
          type: 'TEXT',
        } as any),
      ],
    });

    const graph = computeFieldDependencyGraph(companyObject, [companyObject]);

    expect(Object.keys(graph.dependenciesByField)).toHaveLength(0);
    expect(Object.keys(graph.dependentsByField)).toHaveLength(0);
  });

  it('should return empty graph for unrelated relation fields', () => {
    const alphaObject = createMockObject({
      id: 'alpha-obj',
      nameSingular: 'alpha',
      fields: [],
    });

    const betaObject = createMockObject({
      id: 'beta-obj',
      nameSingular: 'beta',
      fields: [],
    });

    const currentObject = createMockObject({
      id: 'current-obj',
      nameSingular: 'current',
      fields: [
        createMockField({
          id: 'current-alpha-field',
          name: 'alpha',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'current-alpha-field',
              name: 'alpha',
            },
            targetFieldMetadata: {
              id: 'alpha-currents-field',
              name: 'currents',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'current-obj',
              nameSingular: 'current',
              namePlural: 'currents',
            },
            targetObjectMetadata: {
              id: 'alpha-obj',
              nameSingular: 'alpha',
              namePlural: 'alphas',
            },
          },
        }),
        createMockField({
          id: 'current-beta-field',
          name: 'beta',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'current-beta-field',
              name: 'beta',
            },
            targetFieldMetadata: {
              id: 'beta-currents-field',
              name: 'currents',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'current-obj',
              nameSingular: 'current',
              namePlural: 'currents',
            },
            targetObjectMetadata: {
              id: 'beta-obj',
              nameSingular: 'beta',
              namePlural: 'betas',
            },
          },
        }),
      ],
    });

    const graph = computeFieldDependencyGraph(currentObject, [
      alphaObject,
      betaObject,
      currentObject,
    ]);

    expect(Object.keys(graph.dependenciesByField)).toHaveLength(0);
    expect(Object.keys(graph.dependentsByField)).toHaveLength(0);
  });

  it('should support multiple parents for one field', () => {
    const carrierObject = createMockObject({
      id: 'carrier-obj',
      nameSingular: 'carrier',
      fields: [],
    });

    const productTypeObject = createMockObject({
      id: 'productType-obj',
      nameSingular: 'productType',
      fields: [],
    });

    // carrierProduct has both carrier and productType relations
    const carrierProductObject = createMockObject({
      id: 'carrierProduct-obj',
      nameSingular: 'carrierProduct',
      fields: [
        createMockField({
          id: 'cp-carrier-field',
          name: 'carrier',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: { id: 'cp-carrier-field', name: 'carrier' },
            targetFieldMetadata: {
              id: 'carrier-cps-field',
              name: 'carrierProducts',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'carrierProduct-obj',
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
            targetObjectMetadata: {
              id: 'carrier-obj',
              nameSingular: 'carrier',
              namePlural: 'carriers',
            },
          },
        }),
        createMockField({
          id: 'cp-productType-field',
          name: 'productType',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'cp-productType-field',
              name: 'productType',
            },
            targetFieldMetadata: {
              id: 'pt-cps-field',
              name: 'carrierProducts',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'carrierProduct-obj',
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
            targetObjectMetadata: {
              id: 'productType-obj',
              nameSingular: 'productType',
              namePlural: 'productTypes',
            },
          },
        }),
      ],
    });

    const currentObject = createMockObject({
      id: 'current-obj',
      nameSingular: 'current',
      fields: [
        createMockField({
          id: 'current-carrier-field',
          name: 'carrier',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'current-carrier-field',
              name: 'carrier',
            },
            targetFieldMetadata: {
              id: 'carrier-currents-field',
              name: 'currents',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'current-obj',
              nameSingular: 'current',
              namePlural: 'currents',
            },
            targetObjectMetadata: {
              id: 'carrier-obj',
              nameSingular: 'carrier',
              namePlural: 'carriers',
            },
          },
        }),
        createMockField({
          id: 'current-productType-field',
          name: 'productType',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'current-productType-field',
              name: 'productType',
            },
            targetFieldMetadata: {
              id: 'pt-currents-field',
              name: 'currents',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'current-obj',
              nameSingular: 'current',
              namePlural: 'currents',
            },
            targetObjectMetadata: {
              id: 'productType-obj',
              nameSingular: 'productType',
              namePlural: 'productTypes',
            },
          },
        }),
        createMockField({
          id: 'current-carrierProduct-field',
          name: 'carrierProduct',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'current-carrierProduct-field',
              name: 'carrierProduct',
            },
            targetFieldMetadata: {
              id: 'cp-currents-field',
              name: 'currents',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'current-obj',
              nameSingular: 'current',
              namePlural: 'currents',
            },
            targetObjectMetadata: {
              id: 'carrierProduct-obj',
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
          },
        }),
      ],
    });

    const graph = computeFieldDependencyGraph(currentObject, [
      carrierObject,
      productTypeObject,
      carrierProductObject,
      currentObject,
    ]);

    // carrierProduct should have two parents: carrier and productType
    expect(graph.dependenciesByField['carrierProduct']).toHaveLength(2);
    expect(graph.dependenciesByField['carrierProduct']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentFieldName: 'carrier' }),
        expect.objectContaining({ parentFieldName: 'productType' }),
      ]),
    );
  });

  it('should handle a single field pair', () => {
    const carrierObject = createMockObject({
      id: 'carrier-obj',
      nameSingular: 'carrier',
      fields: [],
    });

    const productObject = createMockObject({
      id: 'product-obj',
      nameSingular: 'product',
      fields: [
        createMockField({
          id: 'product-carrier-field',
          name: 'carrier',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'product-carrier-field',
              name: 'carrier',
            },
            targetFieldMetadata: {
              id: 'carrier-products-field',
              name: 'products',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'product-obj',
              nameSingular: 'product',
              namePlural: 'products',
            },
            targetObjectMetadata: {
              id: 'carrier-obj',
              nameSingular: 'carrier',
              namePlural: 'carriers',
            },
          },
        }),
      ],
    });

    const policyObject = createMockObject({
      id: 'policy-obj',
      nameSingular: 'policy',
      fields: [
        createMockField({
          id: 'policy-carrier-field',
          name: 'carrier',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'policy-carrier-field',
              name: 'carrier',
            },
            targetFieldMetadata: {
              id: 'carrier-policies-field',
              name: 'policies',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'policy-obj',
              nameSingular: 'policy',
              namePlural: 'policies',
            },
            targetObjectMetadata: {
              id: 'carrier-obj',
              nameSingular: 'carrier',
              namePlural: 'carriers',
            },
          },
        }),
        createMockField({
          id: 'policy-product-field',
          name: 'product',
          relation: {
            type: RelationType.MANY_TO_ONE,
            sourceFieldMetadata: {
              id: 'policy-product-field',
              name: 'product',
            },
            targetFieldMetadata: {
              id: 'product-policies-field',
              name: 'policies',
              isCustom: false,
            },
            sourceObjectMetadata: {
              id: 'policy-obj',
              nameSingular: 'policy',
              namePlural: 'policies',
            },
            targetObjectMetadata: {
              id: 'product-obj',
              nameSingular: 'product',
              namePlural: 'products',
            },
          },
        }),
      ],
    });

    const graph = computeFieldDependencyGraph(policyObject, [
      carrierObject,
      productObject,
      policyObject,
    ]);

    expect(graph.dependenciesByField['product']).toHaveLength(1);
    expect(graph.dependenciesByField['product']![0]).toEqual({
      dependentFieldName: 'product',
      dependentFieldMetadataId: 'policy-product-field',
      parentFieldName: 'carrier',
      parentFieldMetadataId: 'policy-carrier-field',
      bridgeFieldForeignKeyName: 'carrierId',
    });

    expect(graph.dependentsByField['carrier']).toHaveLength(1);
    expect(graph.dependentsByField['carrier']![0]).toEqual({
      dependentFieldName: 'product',
      dependentFieldMetadataId: 'policy-product-field',
      parentFieldName: 'carrier',
      parentFieldMetadataId: 'policy-carrier-field',
      bridgeFieldForeignKeyName: 'carrierId',
    });
  });
});
