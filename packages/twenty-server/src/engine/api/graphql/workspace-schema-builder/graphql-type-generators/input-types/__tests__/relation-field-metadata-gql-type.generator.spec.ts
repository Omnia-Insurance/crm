import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { RelationFieldMetadataGqlInputTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/input-types/relation-field-metadata-gql-type.generator';
import { GqlTypesStorage } from 'src/engine/api/graphql/workspace-schema-builder/storages/gql-types.storage';

describe('RelationFieldMetadataGqlInputTypeGenerator', () => {
  it('reuses one-to-many filter input types for the same field', () => {
    const gqlTypesStorage = new GqlTypesStorage();
    const generator = new RelationFieldMetadataGqlInputTypeGenerator(
      {} as never,
      gqlTypesStorage,
    );

    const fieldMetadata = {
      id: '51cdd199-0594-48ab-9a52-5c821be6ad51',
      name: 'timelineActivities',
      type: FieldMetadataType.RELATION,
      description: 'Timeline activities',
      settings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    } as never;

    const first = generator.generateSimpleRelationFieldCreateOrUpdateInputType({
      fieldMetadata,
      typeOptions: {},
      context: {} as never,
    });
    const second = generator.generateSimpleRelationFieldCreateOrUpdateInputType(
      {
        fieldMetadata,
        typeOptions: {},
        context: {} as never,
      },
    );

    expect(first.timelineActivities.type).toBe(second.timelineActivities.type);
  });
});
