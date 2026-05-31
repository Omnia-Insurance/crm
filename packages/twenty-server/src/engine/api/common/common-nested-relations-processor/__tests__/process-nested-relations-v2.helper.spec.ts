import { FieldMetadataType, type ObjectRecord } from 'twenty-shared/types';

import { ProcessNestedRelationsV2Helper } from 'src/engine/api/common/common-nested-relations-processor/process-nested-relations-v2.helper';
import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

type EntityWithUniversalIdentifier = FlatObjectMetadata | FlatFieldMetadata;

type MockQueryBuilder = {
  setFindOptions: jest.Mock<MockQueryBuilder, [Record<string, unknown>]>;
  getFindOptions: jest.Mock<Record<string, unknown>, []>;
  where: jest.Mock<MockQueryBuilder, []>;
  take: jest.Mock<MockQueryBuilder, []>;
  withDeleted: jest.Mock<MockQueryBuilder, []>;
  getMany: jest.Mock<Promise<ObjectRecord[]>, []>;
  clone: jest.Mock<MockQueryBuilder, []>;
};

const createFlatEntityMaps = <T extends EntityWithUniversalIdentifier>(
  entities: T[],
): FlatEntityMaps<T> => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
  universalIdentifierById: Object.fromEntries(
    entities.map((entity) => [entity.id, entity.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
});

const createObjectMetadata = ({
  id,
  nameSingular,
  fieldIds,
}: {
  id: string;
  nameSingular: string;
  fieldIds: string[];
}): FlatObjectMetadata =>
  ({
    id,
    workspaceId: 'workspace-id',
    nameSingular,
    namePlural: `${nameSingular}s`,
    labelSingular: nameSingular,
    labelPlural: `${nameSingular}s`,
    isCustom: false,
    isRemote: false,
    isActive: true,
    isSystem: false,
    isUIReadOnly: false,
    isAuditLogged: true,
    isSearchable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    universalIdentifier: `${id}-universal-id`,
    fieldIds,
    indexMetadataIds: [],
    viewIds: [],
    applicationId: null,
  }) as unknown as FlatObjectMetadata;

const createRelationFieldMetadata = ({
  id,
  name,
  objectMetadataId,
  relationTargetObjectMetadataId,
  relationTargetFieldMetadataId,
  relationType,
}: {
  id: string;
  name: string;
  objectMetadataId: string;
  relationTargetObjectMetadataId: string;
  relationTargetFieldMetadataId: string;
  relationType: RelationType;
}): FlatFieldMetadata =>
  ({
    id,
    workspaceId: 'workspace-id',
    objectMetadataId,
    type: FieldMetadataType.RELATION,
    name,
    label: name,
    settings: { relationType },
    isNullable: true,
    isCustom: false,
    isActive: true,
    isSystem: false,
    isUIReadOnly: false,
    isLabelSyncedWithName: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    universalIdentifier: `${id}-universal-id`,
    relationTargetObjectMetadataId,
    relationTargetFieldMetadataId,
    viewFieldIds: [],
    viewFilterIds: [],
    kanbanAggregateOperationViewIds: [],
    calendarViewIds: [],
    applicationId: null,
  }) as unknown as FlatFieldMetadata;

const createQueryBuilder = (records: ObjectRecord[]) => {
  let findOptions = {};

  const queryBuilder: MockQueryBuilder = {
    setFindOptions: jest.fn((options) => {
      findOptions = options;

      return queryBuilder;
    }),
    getFindOptions: jest.fn(() => findOptions),
    where: jest.fn(() => queryBuilder),
    take: jest.fn(() => queryBuilder),
    withDeleted: jest.fn(() => queryBuilder),
    getMany: jest.fn(async () => records),
    clone: jest.fn(() => queryBuilder),
  };

  return queryBuilder;
};

describe('ProcessNestedRelationsV2Helper', () => {
  it('keeps many-to-one nested relations on the parent relation result', async () => {
    const policyObject = createObjectMetadata({
      id: 'policy-object-id',
      nameSingular: 'policy',
      fieldIds: ['policy-lead-field-id'],
    });
    const leadObject = createObjectMetadata({
      id: 'lead-object-id',
      nameSingular: 'lead',
      fieldIds: ['lead-policies-field-id', 'lead-source-field-id'],
    });
    const leadSourceObject = createObjectMetadata({
      id: 'lead-source-object-id',
      nameSingular: 'leadSource',
      fieldIds: ['lead-source-leads-field-id'],
    });

    const policyLeadField = createRelationFieldMetadata({
      id: 'policy-lead-field-id',
      name: 'lead',
      objectMetadataId: policyObject.id,
      relationTargetObjectMetadataId: leadObject.id,
      relationTargetFieldMetadataId: 'lead-policies-field-id',
      relationType: RelationType.MANY_TO_ONE,
    });
    const leadPoliciesField = createRelationFieldMetadata({
      id: 'lead-policies-field-id',
      name: 'policies',
      objectMetadataId: leadObject.id,
      relationTargetObjectMetadataId: policyObject.id,
      relationTargetFieldMetadataId: policyLeadField.id,
      relationType: RelationType.ONE_TO_MANY,
    });
    const leadSourceField = createRelationFieldMetadata({
      id: 'lead-source-field-id',
      name: 'leadSource',
      objectMetadataId: leadObject.id,
      relationTargetObjectMetadataId: leadSourceObject.id,
      relationTargetFieldMetadataId: 'lead-source-leads-field-id',
      relationType: RelationType.MANY_TO_ONE,
    });
    const leadSourceLeadsField = createRelationFieldMetadata({
      id: 'lead-source-leads-field-id',
      name: 'leads',
      objectMetadataId: leadSourceObject.id,
      relationTargetObjectMetadataId: leadObject.id,
      relationTargetFieldMetadataId: leadSourceField.id,
      relationType: RelationType.ONE_TO_MANY,
    });

    const flatObjectMetadataMaps = createFlatEntityMaps([
      policyObject,
      leadObject,
      leadSourceObject,
    ]);
    const flatFieldMetadataMaps = createFlatEntityMaps([
      policyLeadField,
      leadPoliciesField,
      leadSourceField,
      leadSourceLeadsField,
    ]);

    const policyRecord = {
      id: 'policy-id',
      leadId: 'lead-id',
    };
    const leadRecord = {
      id: 'lead-id',
      leadSourceId: 'lead-source-id',
    };
    const leadSourceRecord = {
      id: 'lead-source-id',
      name: 'Slate U65 Leads',
    };

    const queryBuildersByObjectName = {
      lead: createQueryBuilder([leadRecord]),
      leadSource: createQueryBuilder([leadSourceRecord]),
    };

    const workspaceDataSource = {
      getRepository: jest.fn(
        (objectName: keyof typeof queryBuildersByObjectName) => ({
          createQueryBuilder: jest.fn(
            () => queryBuildersByObjectName[objectName],
          ),
        }),
      ),
    };

    await new ProcessNestedRelationsV2Helper().processNestedRelations({
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      parentObjectMetadataItem: policyObject,
      parentObjectRecords: [policyRecord],
      relations: {
        lead: {
          leadSource: {},
        },
      },
      aggregate: {},
      limit: 10,
      authContext: {} as never,
      workspaceDataSource: workspaceDataSource as never,
      selectedFields: {
        lead: {
          id: true,
          leadSourceId: true,
          leadSource: {
            id: true,
            name: true,
          },
        },
      },
    });

    expect(policyRecord).toEqual({
      id: 'policy-id',
      leadId: 'lead-id',
      lead: {
        id: 'lead-id',
        leadSourceId: 'lead-source-id',
        leadSource: {
          id: 'lead-source-id',
          name: 'Slate U65 Leads',
        },
      },
    });
  });
});
