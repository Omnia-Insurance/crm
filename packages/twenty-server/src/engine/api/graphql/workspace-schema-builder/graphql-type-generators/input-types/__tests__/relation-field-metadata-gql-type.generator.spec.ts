import {
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  validateSchema,
} from 'graphql';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { RelationFieldMetadataGqlInputTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/input-types/relation-field-metadata-gql-type.generator';
import { TypeMapperService } from 'src/engine/api/graphql/workspace-schema-builder/services/type-mapper.service';
import { GqlTypesStorage } from 'src/engine/api/graphql/workspace-schema-builder/storages/gql-types.storage';
import { type SchemaGenerationContext } from 'src/engine/api/graphql/workspace-schema-builder/types/schema-generation-context.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';

describe('RelationFieldMetadataGqlInputTypeGenerator', () => {
  it('reuses one-to-many filter input types for the same field metadata id', () => {
    const generator = new RelationFieldMetadataGqlInputTypeGenerator(
      new TypeMapperService(),
      new GqlTypesStorage(),
    );
    const context = {} as SchemaGenerationContext;

    const fieldMetadata = getFlatFieldMetadataMock<FieldMetadataType.RELATION>({
      id: '52e2694a-0000-4000-8000-000000000000',
      universalIdentifier: '52e2694a-0000-4000-8000-000000000001',
      objectMetadataId: '52e2694a-0000-4000-8000-000000000002',
      name: 'timelineActivities',
      type: FieldMetadataType.RELATION,
      settings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    }) as FlatFieldMetadata<FieldMetadataType.RELATION>;

    const createGeneratedFields =
      generator.generateSimpleRelationFieldCreateOrUpdateInputType({
        fieldMetadata,
        typeOptions: {},
        context,
      });
    const updateGeneratedFields =
      generator.generateSimpleRelationFieldCreateOrUpdateInputType({
        fieldMetadata,
        typeOptions: {},
        context,
      });

    expect(createGeneratedFields.timelineActivities.type).toBe(
      updateGeneratedFields.timelineActivities.type,
    );

    const createInputType = new GraphQLInputObjectType({
      name: 'CreateInput',
      fields: createGeneratedFields,
    });
    const updateInputType = new GraphQLInputObjectType({
      name: 'UpdateInput',
      fields: updateGeneratedFields,
    });

    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {
          create: {
            type: GraphQLString,
            args: {
              input: { type: createInputType },
            },
          },
          update: {
            type: GraphQLString,
            args: {
              input: { type: updateInputType },
            },
          },
        },
      }),
    });

    expect(validateSchema(schema)).toEqual([]);
  });
});
