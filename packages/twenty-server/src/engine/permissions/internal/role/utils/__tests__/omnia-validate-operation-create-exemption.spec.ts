import {
  FieldMetadataType,
  type ObjectRecordsOperationType,
  RelationType,
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { NO_ROLE_RECORDS_PERMISSIONS } from 'src/engine/permissions/constants/no-role-records-permissions.constant';
import { validateOperationIsPermittedOrThrow } from 'src/engine/permissions/internal/role/utils/validate-operation-is-permitted-or-throw.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

const AGENT_ROLE_ID = 'agent-role-id';

const POLICY_OBJECT_ID = 'policy-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const TEAM_OBJECT_ID = 'team-object-id';
const CARRIER_OBJECT_ID = 'carrier-object-id';
const WORKSPACE_MEMBER_OBJECT_ID = 'workspace-member-object-id';

const POLICY_ID_FIELD_ID = 'policy-id-field-id';
const POLICY_NAME_FIELD_ID = 'policy-name-field-id';
const POLICY_AGENT_FIELD_ID = 'policy-agent-field-id';
const POLICY_SPLIT_AGENT_FIELD_ID = 'policy-split-agent-field-id';
const POLICY_TEAM_FIELD_ID = 'policy-team-field-id';
const POLICY_CARRIER_FIELD_ID = 'policy-carrier-field-id';
const POLICY_SUBMITTED_DATE_FIELD_ID = 'policy-submitted-date-field-id';
const POLICY_STATUS_FIELD_ID = 'policy-status-field-id';
const POLICY_LTV_FIELD_ID = 'policy-ltv-field-id';
const POLICY_COMMISSION_FIELD_ID = 'policy-commission-field-id';
const TEAM_MANAGER_FIELD_ID = 'team-manager-field-id';
const WORKSPACE_MEMBER_ID_FIELD_ID = 'workspace-member-id-field-id';

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const flatObjectMetadataMaps = buildFlatEntityMaps([
  getFlatObjectMetadataMock({
    id: POLICY_OBJECT_ID,
    universalIdentifier: POLICY_OBJECT_ID,
    nameSingular: 'policy',
    namePlural: 'policies',
    fieldIds: [
      POLICY_ID_FIELD_ID,
      POLICY_NAME_FIELD_ID,
      POLICY_AGENT_FIELD_ID,
      POLICY_SPLIT_AGENT_FIELD_ID,
      POLICY_TEAM_FIELD_ID,
      POLICY_CARRIER_FIELD_ID,
      POLICY_SUBMITTED_DATE_FIELD_ID,
      POLICY_STATUS_FIELD_ID,
      POLICY_LTV_FIELD_ID,
      POLICY_COMMISSION_FIELD_ID,
    ],
  }),
  ...[
    [AGENT_PROFILE_OBJECT_ID, 'agentProfile', 'agentProfiles'],
    [TEAM_OBJECT_ID, 'team', 'teams'],
    [CARRIER_OBJECT_ID, 'carrier', 'carriers'],
    [WORKSPACE_MEMBER_OBJECT_ID, 'workspaceMember', 'workspaceMembers'],
  ].map(([id, nameSingular, namePlural]) =>
    getFlatObjectMetadataMock({
      id,
      universalIdentifier: id,
      nameSingular,
      namePlural,
    }),
  ),
]);

const buildPolicyField = (
  field: Pick<FlatFieldMetadata, 'id' | 'name' | 'type'> &
    Partial<FlatFieldMetadata>,
) =>
  getFlatFieldMetadataMock({
    universalIdentifier: field.id,
    objectMetadataId: POLICY_OBJECT_ID,
    ...field,
  });

const buildManyToOneRelationField = ({
  id,
  name,
  objectMetadataId = POLICY_OBJECT_ID,
  relationTargetObjectMetadataId,
}: {
  id: string;
  name: string;
  objectMetadataId?: string;
  relationTargetObjectMetadataId: string;
}) =>
  getFlatFieldMetadataMock({
    id,
    universalIdentifier: id,
    objectMetadataId,
    type: FieldMetadataType.RELATION,
    name,
    relationTargetObjectMetadataId,
    relationTargetFieldMetadataId: `${id}-inverse`,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: `${name}Id`,
    },
  });

const flatFieldMetadataMaps = buildFlatEntityMaps([
  buildPolicyField({
    id: POLICY_ID_FIELD_ID,
    name: 'id',
    type: FieldMetadataType.UUID,
  }),
  buildPolicyField({
    id: POLICY_NAME_FIELD_ID,
    name: 'name',
    type: FieldMetadataType.TEXT,
  }),
  buildManyToOneRelationField({
    id: POLICY_AGENT_FIELD_ID,
    name: 'agent',
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
  }),
  buildManyToOneRelationField({
    id: POLICY_SPLIT_AGENT_FIELD_ID,
    name: 'splitAgent',
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
  }),
  buildManyToOneRelationField({
    id: POLICY_TEAM_FIELD_ID,
    name: 'team',
    relationTargetObjectMetadataId: TEAM_OBJECT_ID,
  }),
  buildManyToOneRelationField({
    id: POLICY_CARRIER_FIELD_ID,
    name: 'carrier',
    relationTargetObjectMetadataId: CARRIER_OBJECT_ID,
  }),
  buildPolicyField({
    id: POLICY_SUBMITTED_DATE_FIELD_ID,
    name: 'submittedDate',
    type: FieldMetadataType.DATE,
  }),
  buildPolicyField({
    id: POLICY_STATUS_FIELD_ID,
    name: 'status',
    type: FieldMetadataType.TEXT,
  }),
  buildPolicyField({
    id: POLICY_LTV_FIELD_ID,
    name: 'ltv',
    type: FieldMetadataType.NUMBER,
  }),
  buildPolicyField({
    id: POLICY_COMMISSION_FIELD_ID,
    name: 'commission',
    type: FieldMetadataType.NUMBER,
  }),
  buildManyToOneRelationField({
    id: TEAM_MANAGER_FIELD_ID,
    name: 'manager',
    objectMetadataId: TEAM_OBJECT_ID,
    relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
  }),
  getFlatFieldMetadataMock({
    id: WORKSPACE_MEMBER_ID_FIELD_ID,
    universalIdentifier: WORKSPACE_MEMBER_ID_FIELD_ID,
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'id',
  }),
]);

// policy.team → team.manager = Me: a hop through a relation that does not target agentProfile
const teamManagerIsMeHopPredicate: RowLevelPermissionPredicate = {
  id: 'policy-team-manager-is-me-predicate-id',
  roleId: AGENT_ROLE_ID,
  objectMetadataId: POLICY_OBJECT_ID,
  relationFieldMetadataId: POLICY_TEAM_FIELD_ID,
  fieldMetadataId: TEAM_MANAGER_FIELD_ID,
  workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
  operand: RowLevelPermissionPredicateOperand.IS,
  value: null,
  subFieldName: null,
  workspaceMemberSubFieldName: null,
  rowLevelPermissionPredicateGroupId: null,
};

const UNEDITABLE_POLICY_FIELD_IDS = [
  POLICY_AGENT_FIELD_ID,
  POLICY_SPLIT_AGENT_FIELD_ID,
  POLICY_TEAM_FIELD_ID,
  POLICY_CARRIER_FIELD_ID,
  POLICY_SUBMITTED_DATE_FIELD_ID,
  POLICY_STATUS_FIELD_ID,
  POLICY_LTV_FIELD_ID,
];

const buildRecordsPermissions = ({
  predicates,
}: {
  predicates: RowLevelPermissionPredicate[];
}): RoleRecordsPermissions => ({
  ...NO_ROLE_RECORDS_PERMISSIONS,
  objects: {
    [POLICY_OBJECT_ID]: {
      canCreateAllRecords: false,
      canReadAllRecords: true,
      canUpdateAllRecords: false,
      canSoftDeleteAllRecords: false,
      canDestroyAllRecords: false,
      unreadableFields: [POLICY_COMMISSION_FIELD_ID],
      uneditableFields: UNEDITABLE_POLICY_FIELD_IDS,
      rowLevelRecordsPermissions: [
        {
          ruleId: 'policy-rule-id',
          canCreateRecords: true,
          canReadRecords: false,
          canUpdateRecords: true,
          canSoftDeleteRecords: false,
          canDestroyRecords: false,
          predicates,
          predicateGroups: [],
          unreadableFields: [],
          uneditableFields: [],
        },
      ],
    },
  },
});

const validatePolicyOperation = ({
  operationType = 'create',
  updatedColumns,
  selectedColumns = ['id'],
  predicates = [teamManagerIsMeHopPredicate],
}: {
  operationType?: ObjectRecordsOperationType;
  updatedColumns: string[];
  selectedColumns?: string[];
  predicates?: RowLevelPermissionPredicate[];
}) =>
  validateOperationIsPermittedOrThrow({
    entityName: 'policy',
    operationType,
    recordsPermissions: buildRecordsPermissions({ predicates }),
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
    // the record permission services only pass the object being written
    objectIdByNameSingular: { policy: POLICY_OBJECT_ID },
    selectedColumns,
    updatedColumns,
  });

describe('Omnia create exemption for uneditable fields', () => {
  it('should let a creator set the hop relation, agent profile relations and submittedDate', () => {
    expect(() =>
      validatePolicyOperation({
        updatedColumns: [
          'name',
          'teamId',
          'agentId',
          'splitAgentId',
          'submittedDate',
        ],
      }),
    ).not.toThrow();
  });

  it('should keep a hop relation uneditable when no predicate hops through it', () => {
    expect(() =>
      validatePolicyOperation({ updatedColumns: ['teamId'], predicates: [] }),
    ).toThrow(/no permission to write field "team" on "policy"/);
  });

  it.each([
    ['a number field', 'ltv', 'ltv'],
    ['a status field', 'status', 'status'],
    ['a relation to another object', 'carrierId', 'carrier'],
  ])('should reject %s the role cannot edit', (_, updatedColumn, fieldName) => {
    expect(() =>
      validatePolicyOperation({
        updatedColumns: ['agentId', 'submittedDate', updatedColumn],
      }),
    ).toThrow(`no permission to write field "${fieldName}" on "policy"`);
  });

  it('should keep exempt fields uneditable on update', () => {
    expect(() =>
      validatePolicyOperation({
        operationType: 'update',
        updatedColumns: ['agentId'],
      }),
    ).toThrow(/no permission to write field "agent" on "policy"/);
  });

  it('should still check that the returned columns are readable', () => {
    expect(() =>
      validatePolicyOperation({
        updatedColumns: ['agentId'],
        selectedColumns: ['id', 'commission'],
      }),
    ).toThrow(/no permission to read field "commission" on "policy"/);
  });
});
