import {
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
  RowLevelPermissionPredicateScope,
} from 'twenty-shared/types';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { buildRowLevelPermissionRecordFilter } from 'src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util';

const buildFlatEntityMaps = <T extends SyncableFlatEntity>(
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

const createMockFlatFieldMetadata = (
  id: string,
  name: string,
  overrides?: Partial<FlatFieldMetadata>,
): FlatFieldMetadata =>
  getFlatFieldMetadataMock({
    id,
    name,
    label: name,
    universalIdentifier: `${id}-uid`,
    objectMetadataId: overrides?.objectMetadataId ?? 'policy-object-id',
    type: overrides?.type ?? FieldMetadataType.TEXT,
    ...overrides,
  });

const createMockPredicate = ({
  id,
  fieldMetadataId,
  fieldMetadataUniversalIdentifier,
  scope,
  value,
}: {
  id: string;
  fieldMetadataId: string;
  fieldMetadataUniversalIdentifier: string;
  scope: RowLevelPermissionPredicateScope;
  value: string;
}): FlatRowLevelPermissionPredicate => {
  const predicate: FlatRowLevelPermissionPredicate = {
    id,
    universalIdentifier: `${id}-uid`,
    fieldMetadataId,
    fieldMetadataUniversalIdentifier,
    scope,
    operand: RowLevelPermissionPredicateOperand.CONTAINS,
    value,
    subFieldName: null,
    workspaceMemberFieldMetadataId: null,
    workspaceMemberFieldMetadataUniversalIdentifier: null,
    workspaceMemberSubFieldName: null,
    rowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionPredicateGroupUniversalIdentifier: null,
    positionInRowLevelPermissionPredicateGroup: null,
    objectMetadataId: 'policy-object-id',
    objectMetadataUniversalIdentifier: 'policy-object-uid',
    roleId: 'role-id',
    roleUniversalIdentifier: 'role-uid',
    workspaceId: 'workspace-id',
    applicationId: 'app-id',
    applicationUniversalIdentifier: 'app-uid',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  return predicate;
};

describe('buildRowLevelPermissionRecordFilter', () => {
  const fieldMetadata = [
    createMockFlatFieldMetadata('status-field-id', 'status'),
    createMockFlatFieldMetadata('queue-field-id', 'queue'),
    createMockFlatFieldMetadata('owner-field-id', 'owner'),
  ];
  const flatObjectMetadata = getFlatObjectMetadataMock({
    id: 'policy-object-id',
    nameSingular: 'policy',
    namePlural: 'policies',
    labelSingular: 'Policy',
    labelPlural: 'Policies',
    fieldIds: fieldMetadata.map((field) => field.id),
    universalIdentifier: 'policy-object-uid',
    isCustom: false,
    isSearchable: false,
    isAuditLogged: false,
    labelIdentifierFieldMetadataId: 'label-id',
    imageIdentifierFieldMetadataId: 'image-id',
    labelIdentifierFieldMetadataUniversalIdentifier: 'label-uid',
    imageIdentifierFieldMetadataUniversalIdentifier: 'image-uid',
    applicationId: 'app-id',
    applicationUniversalIdentifier: 'app-uid',
  });
  const flatFieldMetadataMaps = buildFlatEntityMaps(fieldMetadata);
  const flatRowLevelPermissionPredicateGroupMaps =
    buildFlatEntityMaps<FlatRowLevelPermissionPredicateGroup>([]);
  const flatRowLevelPermissionPredicateMaps = buildFlatEntityMaps([
    createMockPredicate({
      id: 'all-scope-predicate-id',
      fieldMetadataId: 'status-field-id',
      fieldMetadataUniversalIdentifier: 'status-field-id-uid',
      scope: RowLevelPermissionPredicateScope.ALL,
      value: 'open',
    }),
    createMockPredicate({
      id: 'read-scope-predicate-id',
      fieldMetadataId: 'queue-field-id',
      fieldMetadataUniversalIdentifier: 'queue-field-id-uid',
      scope: RowLevelPermissionPredicateScope.READ,
      value: 'new-business',
    }),
    createMockPredicate({
      id: 'write-scope-predicate-id',
      fieldMetadataId: 'owner-field-id',
      fieldMetadataUniversalIdentifier: 'owner-field-id-uid',
      scope: RowLevelPermissionPredicateScope.WRITE,
      value: 'agent-1',
    }),
  ]);

  it('includes ALL and READ scoped predicates for read filters only', async () => {
    const recordFilter = await buildRowLevelPermissionRecordFilter({
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
      flatFieldMetadataMaps,
      objectMetadata: flatObjectMetadata,
      targetScope: RowLevelPermissionPredicateScope.READ,
      roleId: 'role-id',
    });

    expect(recordFilter).toEqual({
      and: [
        { status: { ilike: '%open%' } },
        { queue: { ilike: '%new-business%' } },
      ],
    });
  });

  it('includes ALL and WRITE scoped predicates for write filters only', async () => {
    const recordFilter = await buildRowLevelPermissionRecordFilter({
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
      flatFieldMetadataMaps,
      objectMetadata: flatObjectMetadata,
      targetScope: RowLevelPermissionPredicateScope.WRITE,
      roleId: 'role-id',
    });

    expect(recordFilter).toEqual({
      and: [{ status: { ilike: '%open%' } }, { owner: { ilike: '%agent-1%' } }],
    });
  });

  it('resolves relation predicates to related workspace-member records for write filters', async () => {
    const workspaceMemberRecordId = '11111111-1111-4111-8111-111111111111';
    const agentProfileRecordId = '22222222-2222-4222-8222-222222222222';
    const relationFieldMetadata = [
      createMockFlatFieldMetadata('policy-agent-field-id', 'agent', {
        type: FieldMetadataType.RELATION,
        relationTargetObjectMetadataId: 'agent-profile-object-id',
      }),
      createMockFlatFieldMetadata('workspace-member-id-field-id', 'id', {
        type: FieldMetadataType.UUID,
        objectMetadataId: 'workspace-member-object-id',
      }),
      createMockFlatFieldMetadata(
        'agent-profile-workspace-member-field-id',
        'workspaceMember',
        {
          type: FieldMetadataType.RELATION,
          objectMetadataId: 'agent-profile-object-id',
          relationTargetObjectMetadataId: 'workspace-member-object-id',
        },
      ),
    ];

    const relationFlatFieldMetadataMaps = buildFlatEntityMaps(
      relationFieldMetadata,
    );
    const relationFlatObjectMetadata = getFlatObjectMetadataMock({
      id: 'policy-object-id',
      nameSingular: 'policy',
      namePlural: 'policies',
      fieldIds: ['policy-agent-field-id'],
      universalIdentifier: 'policy-object-uid',
      isCustom: false,
      labelIdentifierFieldMetadataId: 'label-id',
      imageIdentifierFieldMetadataId: 'image-id',
      labelIdentifierFieldMetadataUniversalIdentifier: 'label-uid',
      imageIdentifierFieldMetadataUniversalIdentifier: 'image-uid',
    });
    const relationFlatObjectMetadataMaps = buildFlatEntityMaps([
      relationFlatObjectMetadata,
      getFlatObjectMetadataMock({
        id: 'agent-profile-object-id',
        nameSingular: 'agentProfile',
        namePlural: 'agentProfiles',
        labelSingular: 'Agent Profile',
        labelPlural: 'Agent Profiles',
        fieldIds: ['agent-profile-workspace-member-field-id'],
        isCustom: true,
        universalIdentifier: 'agent-profile-object-uid',
        labelIdentifierFieldMetadataId: 'agent-profile-label-id',
        imageIdentifierFieldMetadataId: 'agent-profile-image-id',
        labelIdentifierFieldMetadataUniversalIdentifier:
          'agent-profile-label-uid',
        imageIdentifierFieldMetadataUniversalIdentifier:
          'agent-profile-image-uid',
      }),
      getFlatObjectMetadataMock({
        id: 'workspace-member-object-id',
        nameSingular: 'workspaceMember',
        namePlural: 'workspaceMembers',
        labelSingular: 'Workspace Member',
        labelPlural: 'Workspace Members',
        fieldIds: ['workspace-member-id-field-id'],
        universalIdentifier: 'workspace-member-object-uid',
      }),
    ]);
    const relationFlatPredicateMaps = buildFlatEntityMaps([
      {
        ...createMockPredicate({
          id: 'policy-agent-write-predicate-id',
          fieldMetadataId: 'policy-agent-field-id',
          fieldMetadataUniversalIdentifier: 'policy-agent-field-id-uid',
          scope: RowLevelPermissionPredicateScope.WRITE,
          value: '',
        }),
        operand: RowLevelPermissionPredicateOperand.IS,
        workspaceMemberFieldMetadataId: 'workspace-member-id-field-id',
        workspaceMemberFieldMetadataUniversalIdentifier:
          'workspace-member-id-field-id-uid',
      },
    ]);
    const workspaceDataSource = {
      query: jest.fn().mockResolvedValue([{ id: agentProfileRecordId }]),
    };

    const recordFilter = await buildRowLevelPermissionRecordFilter({
      flatRowLevelPermissionPredicateMaps: relationFlatPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
      flatFieldMetadataMaps: relationFlatFieldMetadataMaps,
      objectMetadata: relationFlatObjectMetadata,
      targetScope: RowLevelPermissionPredicateScope.WRITE,
      roleId: 'role-id',
      workspaceMember: {
        id: workspaceMemberRecordId,
      },
      flatObjectMetadataMaps: relationFlatObjectMetadataMaps,
      objectIdByNameSingular: {
        workspaceMember: 'workspace-member-object-id',
      },
      workspaceDataSource,
      workspaceSchemaName: 'workspace_schema',
      workspaceId: 'workspace-id',
    });

    expect(workspaceDataSource.query).toHaveBeenCalledWith(
      'SELECT "id" FROM "workspace_schema"."_agentProfile" WHERE "workspaceMemberId" = $1 AND "deletedAt" IS NULL',
      [workspaceMemberRecordId],
    );
    expect(recordFilter).toEqual({
      agentId: {
        in: [agentProfileRecordId],
      },
    });
  });
});
