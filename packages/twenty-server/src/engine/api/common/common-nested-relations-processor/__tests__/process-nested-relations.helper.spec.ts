import {
  FieldMetadataType,
  type ObjectRecord,
  RelationType,
} from 'twenty-shared/types';

import { ProcessNestedRelationsHelper } from 'src/engine/api/common/common-nested-relations-processor/process-nested-relations.helper';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

type QueryBuilderMock = {
  withDeleted: () => QueryBuilderMock;
  setFindOptions: (findOptions: Record<string, unknown>) => QueryBuilderMock;
  getFindOptions: () => Record<string, unknown>;
  select: () => QueryBuilderMock;
  where: () => QueryBuilderMock;
  take: () => QueryBuilderMock;
  clone: () => QueryBuilderMock;
  applyRowLevelPermissions: () => Promise<void>;
  getQuery: () => string;
  getParameters: () => Record<string, unknown>;
  getMany: () => Promise<ObjectRecord[]>;
};

const LEAD_ID = 'b4a3f5d2-6c1e-4f8a-9b2d-3e7c1a5f0d11';
const POLICY_ID = 'c5b4e6f3-7d2f-4a9b-8c3e-4f8d2b6e1a22';

const buildFlatEntityMaps = <
  TFlatEntity extends FlatFieldMetadata | FlatObjectMetadata,
>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps() as FlatEntityMaps<TFlatEntity>,
  );

const buildRelationField = ({
  id,
  name,
  objectMetadataId,
  relationType,
  relationTargetObjectMetadataId,
  relationTargetFieldMetadataId,
}: {
  id: string;
  name: string;
  objectMetadataId: string;
  relationType: RelationType;
  relationTargetObjectMetadataId: string;
  relationTargetFieldMetadataId: string;
}) =>
  getFlatFieldMetadataMock({
    id,
    universalIdentifier: id,
    objectMetadataId,
    type: FieldMetadataType.RELATION,
    name,
    settings: { relationType },
    relationTargetObjectMetadataId,
    relationTargetFieldMetadataId,
  });

const policyLeadField = buildRelationField({
  id: 'policy-lead',
  name: 'lead',
  objectMetadataId: 'policy',
  relationType: RelationType.MANY_TO_ONE,
  relationTargetObjectMetadataId: 'lead',
  relationTargetFieldMetadataId: 'lead-policies',
});

const leadPoliciesField = buildRelationField({
  id: 'lead-policies',
  name: 'policies',
  objectMetadataId: 'lead',
  relationType: RelationType.ONE_TO_MANY,
  relationTargetObjectMetadataId: 'policy',
  relationTargetFieldMetadataId: 'policy-lead',
});

const leadLeadSourceField = buildRelationField({
  id: 'lead-lead-source',
  name: 'leadSource',
  objectMetadataId: 'lead',
  relationType: RelationType.MANY_TO_ONE,
  relationTargetObjectMetadataId: 'leadSource',
  relationTargetFieldMetadataId: 'lead-source-leads',
});

const leadSourceLeadsField = buildRelationField({
  id: 'lead-source-leads',
  name: 'leads',
  objectMetadataId: 'leadSource',
  relationType: RelationType.ONE_TO_MANY,
  relationTargetObjectMetadataId: 'lead',
  relationTargetFieldMetadataId: 'lead-lead-source',
});

const policyObject = getFlatObjectMetadataMock({
  id: 'policy',
  universalIdentifier: 'policy',
  nameSingular: 'policy',
  fieldIds: [policyLeadField.id],
});

const leadObject = getFlatObjectMetadataMock({
  id: 'lead',
  universalIdentifier: 'lead',
  nameSingular: 'lead',
  fieldIds: [leadPoliciesField.id, leadLeadSourceField.id],
});

const leadSourceObject = getFlatObjectMetadataMock({
  id: 'leadSource',
  universalIdentifier: 'leadSource',
  nameSingular: 'leadSource',
  fieldIds: [leadSourceLeadsField.id],
});

// Each query returns fresh objects, like rows read from the database
const buildQueryBuilder = (rows: ObjectRecord[]): QueryBuilderMock => {
  let findOptions: Record<string, unknown> = {};

  const queryBuilder: QueryBuilderMock = {
    withDeleted: () => queryBuilder,
    setFindOptions: (nextFindOptions) => {
      findOptions = nextFindOptions;

      return queryBuilder;
    },
    getFindOptions: () => findOptions,
    select: () => queryBuilder,
    where: () => queryBuilder,
    take: () => queryBuilder,
    clone: () => queryBuilder,
    applyRowLevelPermissions: async () => undefined,
    getQuery: () => 'SELECT id',
    getParameters: () => ({}),
    getMany: async () => rows.map((row) => ({ ...row })),
  };

  return queryBuilder;
};

const processNestedRelations = async ({
  parentObjectMetadataItem,
  parentObjectRecords,
  relations,
  selectedFields,
  rowsByObjectName,
}: {
  parentObjectMetadataItem: FlatObjectMetadata;
  parentObjectRecords: ObjectRecord[];
  relations: Record<string, Record<string, object>>;
  selectedFields: Record<string, unknown>;
  rowsByObjectName: Record<string, ObjectRecord[]>;
}) => {
  const workspaceOrmManager = {
    getRepository: (objectName: string) => {
      const rows = rowsByObjectName[objectName] ?? [];

      return {
        isReadDisabled: async () => false,
        createQueryBuilder: () => buildQueryBuilder(rows),
        executeRaw: async () => rows.map(({ id }) => ({ id })),
      };
    },
  } as unknown as WorkspaceOrmManager;

  await new ProcessNestedRelationsHelper(
    workspaceOrmManager,
  ).processNestedRelations({
    flatObjectMetadataMaps: buildFlatEntityMaps([
      policyObject,
      leadObject,
      leadSourceObject,
    ]),
    flatFieldMetadataMaps: buildFlatEntityMaps([
      policyLeadField,
      leadPoliciesField,
      leadLeadSourceField,
      leadSourceLeadsField,
    ]),
    parentObjectMetadataItem,
    parentObjectRecords,
    relations,
    limit: 10,
    authContext: {} as WorkspaceAuthContext,
    selectedFields,
  });
};

const loadPolicyLeadSources = ({
  policies,
  rowsByObjectName,
}: {
  policies: ObjectRecord[];
  rowsByObjectName: Record<string, ObjectRecord[]>;
}) =>
  processNestedRelations({
    parentObjectMetadataItem: policyObject,
    parentObjectRecords: policies,
    relations: { lead: { leadSource: {} } },
    selectedFields: {
      lead: { id: true, leadSource: { id: true, name: true } },
    },
    rowsByObjectName,
  });

describe('ProcessNestedRelationsHelper', () => {
  it('should keep a depth-2 many-to-one relation on the parent record', async () => {
    const policy: ObjectRecord = { id: 'policy-1', leadId: 'lead-1' };

    await loadPolicyLeadSources({
      policies: [policy],
      rowsByObjectName: {
        lead: [
          { id: 'lead-1', leadSourceId: 'lead-source-1', deletedAt: null },
        ],
        leadSource: [
          { id: 'lead-source-1', name: 'Referral', deletedAt: null },
        ],
      },
    });

    expect(policy).toEqual({
      id: 'policy-1',
      leadId: 'lead-1',
      lead: {
        id: 'lead-1',
        leadSourceId: 'lead-source-1',
        leadSource: { id: 'lead-source-1', name: 'Referral' },
      },
    });
  });

  it('should empty a soft-deleted depth-2 many-to-one relation on the parent record', async () => {
    const policy: ObjectRecord = { id: 'policy-1', leadId: 'lead-1' };

    await loadPolicyLeadSources({
      policies: [policy],
      rowsByObjectName: {
        lead: [
          { id: 'lead-1', leadSourceId: 'lead-source-1', deletedAt: null },
        ],
        leadSource: [
          {
            id: 'lead-source-1',
            name: 'Referral',
            deletedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    expect(policy.lead).toEqual({
      id: 'lead-1',
      leadSourceId: null,
      leadSource: null,
    });
  });

  it('should keep one-to-many records whose back-reference points to a soft-deleted parent', async () => {
    const deletedAt = '2026-01-01T00:00:00.000Z';
    const lead: ObjectRecord = { id: LEAD_ID, deletedAt };

    await processNestedRelations({
      parentObjectMetadataItem: leadObject,
      parentObjectRecords: [lead],
      relations: { policies: { lead: {} } },
      selectedFields: { policies: { id: true, lead: { id: true } } },
      rowsByObjectName: {
        policy: [{ id: POLICY_ID, leadId: LEAD_ID }],
        lead: [{ id: LEAD_ID, deletedAt }],
      },
    });

    expect(lead.policies).toEqual([
      { id: POLICY_ID, leadId: null, lead: null },
    ]);
  });
});
