import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type FieldMetadataItemRelation } from '@/object-metadata/types/FieldMetadataItemRelation';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { detectJunctionBridge } from '@/object-record/record-field/ui/utils/junction/detectJunctionBridge';
import { FieldMetadataType } from 'twenty-shared/types';
import { RelationType } from '~/generated-metadata/graphql';

const makeRelation = (
  overrides: Partial<FieldMetadataItemRelation> & {
    type: RelationType;
    targetObjectMetadataId: string;
  },
): FieldMetadataItemRelation => ({
  sourceFieldMetadata: { id: 'src-field', name: 'srcField' },
  targetFieldMetadata: {
    id: 'tgt-field',
    name: 'tgtField',
    isCustom: false,
  },
  sourceObjectMetadata: {
    id: 'src-obj',
    nameSingular: 'srcObj',
    namePlural: 'srcObjs',
  },
  targetObjectMetadata: {
    id: overrides.targetObjectMetadataId,
    nameSingular: 'tgtObj',
    namePlural: 'tgtObjs',
  },
  ...overrides,
});

const makeField = (
  overrides: Partial<FieldMetadataItem> & { id: string; name: string },
): FieldMetadataItem =>
  ({
    type: FieldMetadataType.RELATION,
    settings: null,
    relation: null,
    morphRelations: null,
    label: overrides.name,
    isActive: true,
    isCustom: false,
    isNullable: false,
    isSystem: false,
    isUnique: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as unknown as FieldMetadataItem;

const makeObject = (
  overrides: Partial<ObjectMetadataItem> & {
    id: string;
    nameSingular: string;
    fields: FieldMetadataItem[];
  },
): ObjectMetadataItem =>
  ({
    namePlural: overrides.nameSingular + 's',
    labelSingular: overrides.nameSingular,
    labelPlural: overrides.nameSingular + 's',
    isActive: true,
    isCustom: false,
    isSystem: false,
    isRemote: false,
    createdAt: '',
    updatedAt: '',
    labelIdentifierFieldMetadataId: '',
    imageIdentifierFieldMetadataId: '',
    readableFields: overrides.fields,
    updatableFields: overrides.fields,
    indexMetadatas: [],
    ...overrides,
  }) as unknown as ObjectMetadataItem;

// The scenario: Policy -> Carrier (MANY_TO_ONE), Policy -> Product (ONE_TO_MANY)
// Carrier -> CarrierProduct (ONE_TO_MANY with junction config) -> Product

describe('detectJunctionBridge', () => {
  const policyObjectId = 'policy-obj-id';
  const carrierObjectId = 'carrier-obj-id';
  const productObjectId = 'product-obj-id';
  const carrierProductObjectId = 'carrier-product-obj-id';

  const policyCarrierFieldId = 'policy-carrier-field-id';
  const policyProductFieldId = 'policy-product-field-id';
  const carrierProductsFieldId = 'carrier-products-field-id';
  const cpCarrierFieldId = 'cp-carrier-field-id';
  const cpProductFieldId = 'cp-product-field-id';

  // CarrierProduct junction object fields
  const cpCarrierField = makeField({
    id: cpCarrierFieldId,
    name: 'carrier',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: carrierObjectId,
    relation: makeRelation({
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadataId: carrierObjectId,
      sourceFieldMetadata: { id: cpCarrierFieldId, name: 'carrier' },
      targetFieldMetadata: {
        id: carrierProductsFieldId,
        name: 'carrierProducts',
        isCustom: false,
      },
      targetObjectMetadata: {
        id: carrierObjectId,
        nameSingular: 'carrier',
        namePlural: 'carriers',
      },
    }),
    settings: { joinColumnName: 'carrierId' },
  });

  const cpProductField = makeField({
    id: cpProductFieldId,
    name: 'product',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: productObjectId,
    relation: makeRelation({
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadataId: productObjectId,
      sourceFieldMetadata: { id: cpProductFieldId, name: 'product' },
      targetFieldMetadata: {
        id: 'product-carrier-products-field',
        name: 'carrierProducts',
        isCustom: false,
      },
      targetObjectMetadata: {
        id: productObjectId,
        nameSingular: 'product',
        namePlural: 'products',
      },
    }),
    settings: { joinColumnName: 'productId' },
  });

  const carrierProductObject = makeObject({
    id: carrierProductObjectId,
    nameSingular: 'carrierProduct',
    fields: [cpCarrierField, cpProductField],
  });

  // Carrier object with a ONE_TO_MANY carrierProducts field with junction config
  const carrierCarrierProductsField = makeField({
    id: carrierProductsFieldId,
    name: 'carrierProducts',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: carrierProductObjectId,
    relation: makeRelation({
      type: RelationType.ONE_TO_MANY,
      targetObjectMetadataId: carrierProductObjectId,
      sourceFieldMetadata: {
        id: carrierProductsFieldId,
        name: 'carrierProducts',
      },
      targetFieldMetadata: {
        id: cpCarrierFieldId,
        name: 'carrier',
        isCustom: false,
      },
      targetObjectMetadata: {
        id: carrierProductObjectId,
        nameSingular: 'carrierProduct',
        namePlural: 'carrierProducts',
      },
    }),
    settings: {
      junctionTargetFieldId: cpProductFieldId,
    },
  });

  const carrierObject = makeObject({
    id: carrierObjectId,
    nameSingular: 'carrier',
    fields: [carrierCarrierProductsField],
  });

  const productObject = makeObject({
    id: productObjectId,
    nameSingular: 'product',
    fields: [],
  });

  // Policy object fields
  const policyCarrierField = makeField({
    id: policyCarrierFieldId,
    name: 'carrier',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: carrierObjectId,
    relation: makeRelation({
      type: RelationType.MANY_TO_ONE,
      targetObjectMetadataId: carrierObjectId,
      sourceFieldMetadata: {
        id: policyCarrierFieldId,
        name: 'carrier',
      },
      targetFieldMetadata: {
        id: 'carrier-policies-field',
        name: 'policies',
        isCustom: false,
      },
      targetObjectMetadata: {
        id: carrierObjectId,
        nameSingular: 'carrier',
        namePlural: 'carriers',
      },
    }),
    settings: { joinColumnName: 'carrierId' },
  });

  const policyProductField = makeField({
    id: policyProductFieldId,
    name: 'product',
    type: FieldMetadataType.RELATION,
    relationTargetObjectMetadataId: productObjectId,
    relation: makeRelation({
      type: RelationType.ONE_TO_MANY,
      targetObjectMetadataId: productObjectId,
      sourceFieldMetadata: {
        id: policyProductFieldId,
        name: 'product',
      },
      targetFieldMetadata: {
        id: 'product-policies-field',
        name: 'policies',
        isCustom: false,
      },
      targetObjectMetadata: {
        id: productObjectId,
        nameSingular: 'product',
        namePlural: 'products',
      },
    }),
    settings: null,
  });

  const policyObject = makeObject({
    id: policyObjectId,
    nameSingular: 'policy',
    fields: [policyCarrierField, policyProductField],
  });

  const allObjects = [
    policyObject,
    carrierObject,
    productObject,
    carrierProductObject,
  ];

  it('should detect junction bridge from Policy.product through Carrier -> CarrierProduct -> Product', () => {
    const result = detectJunctionBridge({
      objectMetadataItem: policyObject,
      fieldMetadataItem: policyProductField,
      objectMetadataItems: allObjects,
    });

    expect(result).toBeDefined();
    expect(result).toEqual({
      junctionObjectNameSingular: 'carrierProduct',
      sourceJoinColumnName: 'carrierId',
      targetJoinColumnName: 'productId',
      parentFieldName: 'carrier',
    });
  });

  it('should return undefined when field has no relation target', () => {
    const fieldWithNoRelation = makeField({
      id: 'no-relation-field',
      name: 'noRelation',
      type: FieldMetadataType.TEXT,
      relation: null,
    });

    const result = detectJunctionBridge({
      objectMetadataItem: policyObject,
      fieldMetadataItem: fieldWithNoRelation,
      objectMetadataItems: allObjects,
    });

    expect(result).toBeUndefined();
  });

  it('should return undefined when no sibling MANY_TO_ONE fields exist', () => {
    const lonelyObject = makeObject({
      id: 'lonely-obj',
      nameSingular: 'lonely',
      fields: [policyProductField],
    });

    const result = detectJunctionBridge({
      objectMetadataItem: lonelyObject,
      fieldMetadataItem: policyProductField,
      objectMetadataItems: allObjects,
    });

    expect(result).toBeUndefined();
  });

  it('should return undefined when sibling target has no junction config', () => {
    const carrierWithoutJunction = makeObject({
      id: carrierObjectId,
      nameSingular: 'carrier',
      fields: [
        makeField({
          id: 'plain-relation',
          name: 'plainRelation',
          type: FieldMetadataType.RELATION,
          relationTargetObjectMetadataId: carrierProductObjectId,
          relation: makeRelation({
            type: RelationType.ONE_TO_MANY,
            targetObjectMetadataId: carrierProductObjectId,
            sourceFieldMetadata: {
              id: 'plain-relation',
              name: 'plainRelation',
            },
            targetFieldMetadata: {
              id: cpCarrierFieldId,
              name: 'carrier',
              isCustom: false,
            },
            targetObjectMetadata: {
              id: carrierProductObjectId,
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
          }),
          settings: null,
        }),
      ],
    });

    const objectsWithoutJunction = [
      policyObject,
      carrierWithoutJunction,
      productObject,
      carrierProductObject,
    ];

    const result = detectJunctionBridge({
      objectMetadataItem: policyObject,
      fieldMetadataItem: policyProductField,
      objectMetadataItems: objectsWithoutJunction,
    });

    expect(result).toBeUndefined();
  });

  it('should return undefined when junction target points to a different object', () => {
    const differentTargetObjectId = 'different-target-id';

    const cpDifferentTargetField = makeField({
      id: 'cp-different-field',
      name: 'different',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: differentTargetObjectId,
      relation: makeRelation({
        type: RelationType.MANY_TO_ONE,
        targetObjectMetadataId: differentTargetObjectId,
        sourceFieldMetadata: {
          id: 'cp-different-field',
          name: 'different',
        },
        targetFieldMetadata: {
          id: 'different-back-field',
          name: 'differentBack',
          isCustom: false,
        },
        targetObjectMetadata: {
          id: differentTargetObjectId,
          nameSingular: 'differentTarget',
          namePlural: 'differentTargets',
        },
      }),
      settings: { joinColumnName: 'differentId' },
    });

    const mismatchedJunctionObject = makeObject({
      id: carrierProductObjectId,
      nameSingular: 'carrierProduct',
      fields: [cpCarrierField, cpDifferentTargetField],
    });

    const carrierWithMismatch = makeObject({
      id: carrierObjectId,
      nameSingular: 'carrier',
      fields: [
        makeField({
          id: carrierProductsFieldId,
          name: 'carrierProducts',
          type: FieldMetadataType.RELATION,
          relationTargetObjectMetadataId: carrierProductObjectId,
          relation: makeRelation({
            type: RelationType.ONE_TO_MANY,
            targetObjectMetadataId: carrierProductObjectId,
            sourceFieldMetadata: {
              id: carrierProductsFieldId,
              name: 'carrierProducts',
            },
            targetFieldMetadata: {
              id: cpCarrierFieldId,
              name: 'carrier',
              isCustom: false,
            },
            targetObjectMetadata: {
              id: carrierProductObjectId,
              nameSingular: 'carrierProduct',
              namePlural: 'carrierProducts',
            },
          }),
          settings: {
            junctionTargetFieldId: 'cp-different-field',
          },
        }),
      ],
    });

    const mismatchedObjects = [
      policyObject,
      carrierWithMismatch,
      productObject,
      mismatchedJunctionObject,
    ];

    const result = detectJunctionBridge({
      objectMetadataItem: policyObject,
      fieldMetadataItem: policyProductField,
      objectMetadataItems: mismatchedObjects,
    });

    expect(result).toBeUndefined();
  });

  it('should return undefined for the carrier field itself', () => {
    const result = detectJunctionBridge({
      objectMetadataItem: policyObject,
      fieldMetadataItem: policyCarrierField,
      objectMetadataItems: allObjects,
    });

    expect(result).toBeUndefined();
  });

  it('should detect bridge when all fields have relationTargetObjectMetadataId but relation is null', () => {
    // All fields use only relationTargetObjectMetadataId, no relation resolver
    const cpCarrierFieldScalarOnly = makeField({
      id: cpCarrierFieldId,
      name: 'carrier',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: carrierObjectId,
      relation: null,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'carrierId',
      },
    });

    const cpProductFieldScalarOnly = makeField({
      id: cpProductFieldId,
      name: 'product',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: productObjectId,
      relation: null,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'productId',
      },
    });

    const carrierProductObjectScalar = makeObject({
      id: carrierProductObjectId,
      nameSingular: 'carrierProduct',
      fields: [cpCarrierFieldScalarOnly, cpProductFieldScalarOnly],
    });

    const carrierProductsFieldScalar = makeField({
      id: carrierProductsFieldId,
      name: 'carrierProducts',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: carrierProductObjectId,
      relation: null,
      settings: {
        relationType: RelationType.ONE_TO_MANY,
        junctionTargetFieldId: cpProductFieldId,
      },
    });

    const carrierObjectScalar = makeObject({
      id: carrierObjectId,
      nameSingular: 'carrier',
      fields: [carrierProductsFieldScalar],
    });

    const policyCarrierFieldScalar = makeField({
      id: policyCarrierFieldId,
      name: 'carrier',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: carrierObjectId,
      relation: null,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'carrierId',
      },
    });

    const policyProductFieldScalar = makeField({
      id: policyProductFieldId,
      name: 'product',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: productObjectId,
      relation: null,
      settings: { relationType: RelationType.ONE_TO_MANY },
    });

    const policyObjectScalar = makeObject({
      id: policyObjectId,
      nameSingular: 'policy',
      fields: [policyCarrierFieldScalar, policyProductFieldScalar],
    });

    const productObjectScalar = makeObject({
      id: productObjectId,
      nameSingular: 'product',
      fields: [],
    });

    const scalarOnlyObjects = [
      policyObjectScalar,
      carrierObjectScalar,
      productObjectScalar,
      carrierProductObjectScalar,
    ];

    const result = detectJunctionBridge({
      objectMetadataItem: policyObjectScalar,
      fieldMetadataItem: policyProductFieldScalar,
      objectMetadataItems: scalarOnlyObjects,
    });

    expect(result).toBeDefined();
    expect(result).toEqual({
      junctionObjectNameSingular: 'carrierProduct',
      sourceJoinColumnName: 'carrierId',
      targetJoinColumnName: 'productId',
      parentFieldName: 'carrier',
    });
  });

  it('should detect bridge when sibling field has relation=null but settings.relationType is set', () => {
    // Simulate a field where the relation resolver returned null
    // but settings.relationType is still available.
    const policyCarrierFieldNoRelation = makeField({
      id: policyCarrierFieldId,
      name: 'carrier',
      type: FieldMetadataType.RELATION,
      relation: null,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'carrierId',
      },
    });

    const policyObjectWithNullRelation = makeObject({
      id: policyObjectId,
      nameSingular: 'policy',
      fields: [policyCarrierFieldNoRelation, policyProductField],
    });

    // Add inverse fields so the inverse relation search can find targets
    // by searching for fields that reference the carrier field.
    const carrierPoliciesField = makeField({
      id: 'carrier-policies-field',
      name: 'policies',
      type: FieldMetadataType.RELATION,
      relation: makeRelation({
        type: RelationType.ONE_TO_MANY,
        targetObjectMetadataId: policyObjectId,
        targetFieldMetadata: {
          id: policyCarrierFieldId,
          name: 'carrier',
          isCustom: false,
        },
        sourceFieldMetadata: {
          id: 'carrier-policies-field',
          name: 'policies',
        },
        targetObjectMetadata: {
          id: policyObjectId,
          nameSingular: 'policy',
          namePlural: 'policies',
        },
      }),
      settings: null,
    });

    const carrierObjectWithInverse = makeObject({
      id: carrierObjectId,
      nameSingular: 'carrier',
      fields: [carrierCarrierProductsField, carrierPoliciesField],
    });

    const objectsWithInverse = [
      policyObjectWithNullRelation,
      carrierObjectWithInverse,
      productObject,
      carrierProductObject,
    ];

    const result = detectJunctionBridge({
      objectMetadataItem: policyObjectWithNullRelation,
      fieldMetadataItem: policyProductField,
      objectMetadataItems: objectsWithInverse,
    });

    expect(result).toBeDefined();
    expect(result).toEqual({
      junctionObjectNameSingular: 'carrierProduct',
      sourceJoinColumnName: 'carrierId',
      targetJoinColumnName: 'productId',
      parentFieldName: 'carrier',
    });
  });

  it('should detect bridge when junction inner fields (carrier/product on CarrierProduct) have relation=null', () => {
    // Both cpCarrierField and cpProductField have relation=null
    // but have relationTargetObjectMetadataId set.
    const cpCarrierFieldNoRelation = makeField({
      id: cpCarrierFieldId,
      name: 'carrier',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: carrierObjectId,
      relation: null,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'carrierId',
      },
    });

    const cpProductFieldNoRelation = makeField({
      id: cpProductFieldId,
      name: 'product',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: productObjectId,
      relation: null,
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'productId',
      },
    });

    const carrierProductObjectNoRelation = makeObject({
      id: carrierProductObjectId,
      nameSingular: 'carrierProduct',
      fields: [cpCarrierFieldNoRelation, cpProductFieldNoRelation],
    });

    const objectsWithNullJunctionRelations = [
      policyObject,
      carrierObject,
      productObject,
      carrierProductObjectNoRelation,
    ];

    const result = detectJunctionBridge({
      objectMetadataItem: policyObject,
      fieldMetadataItem: policyProductField,
      objectMetadataItems: objectsWithNullJunctionRelations,
    });

    expect(result).toBeDefined();
    expect(result).toEqual({
      junctionObjectNameSingular: 'carrierProduct',
      sourceJoinColumnName: 'carrierId',
      targetJoinColumnName: 'productId',
      parentFieldName: 'carrier',
    });
  });

  it('should detect bridge when carrier ONE_TO_MANY field has relation=null but settings has relationType and junctionTargetFieldId', () => {
    // Carrier.carrierProducts has relation=null but settings is correct
    const carrierProductsFieldNoRelation = makeField({
      id: carrierProductsFieldId,
      name: 'carrierProducts',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataId: carrierProductObjectId,
      relation: null,
      settings: {
        relationType: RelationType.ONE_TO_MANY,
        junctionTargetFieldId: cpProductFieldId,
      },
    });

    const carrierObjectNoRelation = makeObject({
      id: carrierObjectId,
      nameSingular: 'carrier',
      fields: [carrierProductsFieldNoRelation],
    });

    const objectsWithNoRelationOnCarrier = [
      policyObject,
      carrierObjectNoRelation,
      productObject,
      carrierProductObject,
    ];

    const result = detectJunctionBridge({
      objectMetadataItem: policyObject,
      fieldMetadataItem: policyProductField,
      objectMetadataItems: objectsWithNoRelationOnCarrier,
    });

    expect(result).toBeDefined();
    expect(result).toEqual({
      junctionObjectNameSingular: 'carrierProduct',
      sourceJoinColumnName: 'carrierId',
      targetJoinColumnName: 'productId',
      parentFieldName: 'carrier',
    });
  });
});
