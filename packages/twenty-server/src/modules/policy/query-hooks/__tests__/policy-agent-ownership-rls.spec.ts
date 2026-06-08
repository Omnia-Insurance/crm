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
import { type FlatRowLevelPermissionPredicateGroup } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-group.type';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { buildRowLevelPermissionRecordFilter } from 'src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util';

const WORKSPACE_ID = 'workspace-id';
const ROLE_ID = 'brokerage-agent-role-id';
const POLICY_OBJECT_METADATA_ID = 'policy-object-id';
const AGENT_PROFILE_OBJECT_METADATA_ID = 'agent-profile-object-id';
const WORKSPACE_MEMBER_OBJECT_METADATA_ID = 'workspace-member-object-id';
const POLICY_AGENT_FIELD_METADATA_ID = 'policy-agent-field-id';
const WORKSPACE_MEMBER_ID_FIELD_METADATA_ID = 'workspace-member-id-field-id';
const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID =
  'agent-profile-workspace-member-field-id';

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

const createFlatFieldMetadata = (
  id: string,
  name: string,
  overrides?: Partial<FlatFieldMetadata>,
) =>
  getFlatFieldMetadataMock({
    id,
    name,
    label: name,
    universalIdentifier: `${id}-uid`,
    objectMetadataId: overrides?.objectMetadataId ?? POLICY_OBJECT_METADATA_ID,
    type: overrides?.type ?? FieldMetadataType.TEXT,
    ...overrides,
  });

describe('Brokerage Agent policy ownership RLS', () => {
  it('resolves policy.agent write rules through Agent Profile workspace member ownership', async () => {
    const workspaceMemberId = '11111111-1111-4111-8111-111111111111';
    const agentProfileId = '22222222-2222-4222-8222-222222222222';
    const flatFieldMetadataMaps = buildFlatEntityMaps([
      createFlatFieldMetadata(POLICY_AGENT_FIELD_METADATA_ID, 'agent', {
        type: FieldMetadataType.RELATION,
        relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_METADATA_ID,
      }),
      createFlatFieldMetadata(WORKSPACE_MEMBER_ID_FIELD_METADATA_ID, 'id', {
        type: FieldMetadataType.UUID,
        objectMetadataId: WORKSPACE_MEMBER_OBJECT_METADATA_ID,
      }),
      createFlatFieldMetadata(
        AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID,
        'workspaceMember',
        {
          type: FieldMetadataType.RELATION,
          objectMetadataId: AGENT_PROFILE_OBJECT_METADATA_ID,
          relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_METADATA_ID,
        },
      ),
    ]);
    const policyObjectMetadata = getFlatObjectMetadataMock({
      id: POLICY_OBJECT_METADATA_ID,
      nameSingular: 'policy',
      namePlural: 'policies',
      labelSingular: 'Policy',
      labelPlural: 'Policies',
      fieldIds: [POLICY_AGENT_FIELD_METADATA_ID],
      universalIdentifier: `${POLICY_OBJECT_METADATA_ID}-uid`,
      isCustom: false,
      labelIdentifierFieldMetadataId: 'policy-label-id',
      imageIdentifierFieldMetadataId: 'policy-image-id',
      labelIdentifierFieldMetadataUniversalIdentifier: 'policy-label-uid',
      imageIdentifierFieldMetadataUniversalIdentifier: 'policy-image-uid',
    });
    const flatObjectMetadataMaps = buildFlatEntityMaps([
      policyObjectMetadata,
      getFlatObjectMetadataMock({
        id: AGENT_PROFILE_OBJECT_METADATA_ID,
        nameSingular: 'agentProfile',
        namePlural: 'agentProfiles',
        labelSingular: 'Agent Profile',
        labelPlural: 'Agent Profiles',
        fieldIds: [AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_METADATA_ID],
        universalIdentifier: `${AGENT_PROFILE_OBJECT_METADATA_ID}-uid`,
        isCustom: true,
        labelIdentifierFieldMetadataId: 'agent-profile-label-id',
        imageIdentifierFieldMetadataId: 'agent-profile-image-id',
        labelIdentifierFieldMetadataUniversalIdentifier:
          'agent-profile-label-uid',
        imageIdentifierFieldMetadataUniversalIdentifier:
          'agent-profile-image-uid',
      }),
      getFlatObjectMetadataMock({
        id: WORKSPACE_MEMBER_OBJECT_METADATA_ID,
        nameSingular: 'workspaceMember',
        namePlural: 'workspaceMembers',
        labelSingular: 'Workspace Member',
        labelPlural: 'Workspace Members',
        fieldIds: [WORKSPACE_MEMBER_ID_FIELD_METADATA_ID],
        universalIdentifier: `${WORKSPACE_MEMBER_OBJECT_METADATA_ID}-uid`,
      }),
    ]);
    const flatRowLevelPermissionPredicateMaps = buildFlatEntityMaps([
      {
        id: 'policy-agent-write-predicate-id',
        universalIdentifier: 'policy-agent-write-predicate-uid',
        applicationId: 'brokerage-app-id',
        applicationUniversalIdentifier: 'brokerage-app-uid',
        fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        fieldMetadataUniversalIdentifier: `${POLICY_AGENT_FIELD_METADATA_ID}-uid`,
        objectMetadataId: POLICY_OBJECT_METADATA_ID,
        objectMetadataUniversalIdentifier: `${POLICY_OBJECT_METADATA_ID}-uid`,
        operand: RowLevelPermissionPredicateOperand.IS,
        value: null,
        subFieldName: null,
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
        workspaceMemberFieldMetadataUniversalIdentifier: `${WORKSPACE_MEMBER_ID_FIELD_METADATA_ID}-uid`,
        workspaceMemberSubFieldName: null,
        rowLevelPermissionPredicateGroupId: null,
        rowLevelPermissionPredicateGroupUniversalIdentifier: null,
        positionInRowLevelPermissionPredicateGroup: null,
        workspaceId: WORKSPACE_ID,
        roleId: ROLE_ID,
        roleUniversalIdentifier: 'brokerage-agent-role-uid',
        scope: RowLevelPermissionPredicateScope.WRITE,
        createdAt: new Date('2026-06-02T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-06-02T00:00:00.000Z').toISOString(),
        deletedAt: null,
      } satisfies FlatRowLevelPermissionPredicate,
    ]);
    const workspaceDataSource = {
      query: jest.fn().mockResolvedValue([{ id: agentProfileId }]),
    };

    const recordFilter = await buildRowLevelPermissionRecordFilter({
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps:
        buildFlatEntityMaps<FlatRowLevelPermissionPredicateGroup>([]),
      flatFieldMetadataMaps,
      objectMetadata: policyObjectMetadata,
      targetScope: RowLevelPermissionPredicateScope.WRITE,
      roleId: ROLE_ID,
      workspaceMember: {
        id: workspaceMemberId,
      },
      flatObjectMetadataMaps,
      objectIdByNameSingular: {
        workspaceMember: WORKSPACE_MEMBER_OBJECT_METADATA_ID,
      },
      workspaceDataSource,
      workspaceSchemaName: 'workspace_schema',
      workspaceId: WORKSPACE_ID,
    });

    expect(workspaceDataSource.query).toHaveBeenCalledWith(
      'SELECT "id" FROM "workspace_schema"."_agentProfile" WHERE "workspaceMemberId" = $1 AND "deletedAt" IS NULL',
      [workspaceMemberId],
    );
    expect(recordFilter).toEqual({
      agentId: {
        in: [agentProfileId],
      },
    });
  });
});
