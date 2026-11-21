import { Test, type TestingModule } from '@nestjs/testing';

import { isNonEmptyString } from '@sniptt/guards';
import {
  type ObjectRecordCreateEvent,
  type ObjectRecordUpdateEvent,
} from 'twenty-shared/database-events';
import {
  FeatureFlagKey,
  FieldMetadataType,
  type ObjectRecord,
  type ObjectRecordsPermissions,
  OrderByDirection,
  RelationType,
  RowLevelPermissionPredicateOperand,
  type RowLevelRecordsPermissions,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { GroupByArgProcessorService } from 'src/engine/api/common/common-args-processors/group-by-arg-processor/group-by-arg-processor.service';
import { CommonGroupByQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-group-by-query-runner.service';
import { CommonRecordVisibilityService } from 'src/engine/api/common/common-record-visibility/common-record-visibility.service';
import { resolveOrderByLeaves } from 'src/engine/api/utils/resolve-order-by-leaves.utils';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ApplicationGrantRoleLookupService } from 'src/engine/core-modules/application/application-grant-role-lookup/services/application-grant-role-lookup.service';
import { type FlatWorkspaceMember } from 'src/engine/core-modules/user/types/flat-workspace-member.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { NO_RECORD_READ_RESTRICTIONS } from 'src/engine/permissions/constants/no-record-read-restrictions.constant';
import { NO_ROLE_RECORDS_PERMISSIONS } from 'src/engine/permissions/constants/no-role-records-permissions.constant';
import { AccessGroupReadService } from 'src/engine/permissions/internal/access-group/services/access-group-read.service';
import { PermissionsMetadataMapsService } from 'src/engine/permissions/internal/combine/services/permissions-metadata-maps.service';
import { PrivateRecordRepository } from 'src/engine/permissions/internal/private-record/repositories/private-record.repository';
import { AccessGroupReadRepository } from 'src/engine/permissions/internal/record-permission-repository/repositories/access-group-read.repository';
import { RecordPermissionReadRepository } from 'src/engine/permissions/internal/record-permission-repository/repositories/record-permission-read.repository';
import { RelatedRecordPathReadService } from 'src/engine/permissions/internal/related-record-path/services/related-record-path-read.service';
import { buildRecordReadRestrictions } from 'src/engine/permissions/internal/role/utils/build-record-read-restrictions.util';
import { PermissionsException } from 'src/engine/permissions/permissions.exception';
import { PrincipalPermissionsReadService } from 'src/engine/permissions/principal-permissions-read.service';
import { RecordEventPermissionsReadService } from 'src/engine/permissions/record-event-permissions-read.service';
import { RecordPermissionsReadService } from 'src/engine/permissions/record-permissions-read.service';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { type SQLCondition } from 'src/engine/permissions/types/sql-condition.type';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { ApplyTimelineActivitiesVisibilityRestrictionsService } from 'src/modules/timeline/query-hooks/apply-timeline-activities-visibility-restrictions.service';
import { TimelineActivityCreateOnePreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-create-one.pre-query-hook';
import { TimelineActivityMergeManyPreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-merge-many.pre-query-hook';
import { type TimelineActivityMutationQueryHookService } from 'src/modules/timeline/query-hooks/timeline-activity-mutation-query-hook.service';
import { TimelineActivityUpdateManyPreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-update-many.pre-query-hook';
import { TimelineActivityUpdateOnePreQueryHook } from 'src/modules/timeline/query-hooks/timeline-activity-update-one.pre-query-hook';
import { TimelineActivityWriteAuthorizationService } from 'src/modules/timeline/query-hooks/timeline-activity-write-authorization.service';
import { type TimelineActivityMutationInput } from 'src/modules/timeline/query-hooks/types/timeline-activity-mutation-input.type';
import { addTimelineActivityObjectColumnsToSelect } from 'src/modules/timeline/utils/add-timeline-activity-object-columns-to-select.util';
import { assertTimelineActivityPropertiesAreQueryableOrThrow } from 'src/modules/timeline/utils/assert-timeline-activity-properties-are-queryable-or-throw.util';

// An agent reads only the leads assigned to their agent profile (contract C2 hop on person.assignedAgent),
// and no role but the admin reads the reconciliation objects; timeline activities must follow both.
const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const WORKSPACE_CUSTOM_APPLICATION_ID = '20202020-64aa-4b6f-b003-9c74b97cee20';
const AGENT_ROLE_ID = 'agent-role-id';
const ADMIN_ROLE_ID = 'admin-role-id';

const MY_WORKSPACE_MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_WORKSPACE_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const MY_USER_ID = '44444444-4444-4444-8444-444444444444';
const ADMIN_USER_ID = '55555555-5555-4555-8555-555555555555';
const MY_USER_WORKSPACE_ID = '66666666-6666-4666-8666-666666666666';
const ADMIN_USER_WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';

const MY_AGENT_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AGENT_PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MY_LEAD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_LEAD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REVIEW_ITEM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NOTE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const PERSON_OBJECT_ID = 'person-object-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const WORKSPACE_MEMBER_OBJECT_ID = 'workspace-member-object-id';
const REVIEW_ITEM_OBJECT_ID = 'review-item-object-id';
const NOTE_OBJECT_ID = 'note-object-id';
const TIMELINE_ACTIVITY_OBJECT_ID = 'timeline-activity-object-id';

const PERSON_CITY_FIELD_ID = 'person-city-field-id';
const PERSON_ASSIGNED_AGENT_FIELD_ID = 'person-assigned-agent-field-id';
const PERSON_TIMELINE_ACTIVITIES_FIELD_ID =
  'person-timeline-activities-field-id';
const AGENT_PROFILE_LEADS_FIELD_ID = 'agent-profile-leads-field-id';
const AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID =
  'agent-profile-workspace-member-field-id';
const WORKSPACE_MEMBER_ID_FIELD_ID = 'workspace-member-id-field-id';
const WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID =
  'workspace-member-agent-profiles-field-id';
const REVIEW_ITEM_DECISION_FIELD_ID = 'review-item-decision-field-id';
const NOTE_TITLE_FIELD_ID = 'note-title-field-id';
const TIMELINE_ACTIVITY_PROPERTIES_FIELD_ID =
  'timeline-activity-properties-field-id';
const TIMELINE_ACTIVITY_LINKED_OBJECT_METADATA_ID_FIELD_ID =
  'timeline-activity-linked-object-metadata-id-field-id';
const TIMELINE_ACTIVITY_LINKED_RECORD_ID_FIELD_ID =
  'timeline-activity-linked-record-id-field-id';
const TIMELINE_ACTIVITY_LINKED_RECORD_CACHED_NAME_FIELD_ID =
  'timeline-activity-linked-record-cached-name-field-id';
const TIMELINE_ACTIVITY_TARGET_PERSON_FIELD_ID =
  'timeline-activity-target-person-field-id';
const TIMELINE_ACTIVITY_SEARCH_VECTOR_FIELD_ID =
  'timeline-activity-search-vector-field-id';
const TIMELINE_ACTIVITY_TYPE_ID = '99999999-9999-4999-8999-999999999999';

const AGENT_PROFILE_ROWS = [
  { id: MY_AGENT_PROFILE_ID, workspaceMemberId: MY_WORKSPACE_MEMBER_ID },
  { id: OTHER_AGENT_PROFILE_ID, workspaceMemberId: OTHER_WORKSPACE_MEMBER_ID },
];

const PERSON_ROWS = [
  { id: MY_LEAD_ID, assignedAgentId: MY_AGENT_PROFILE_ID },
  { id: OTHER_LEAD_ID, assignedAgentId: OTHER_AGENT_PROFILE_ID },
];

const buildTimelineActivities = () => {
  const buildTimelineActivity = (
    timelineActivity: Partial<ObjectRecord> & { id: string },
  ): ObjectRecord => ({
    linkedObjectMetadataId: null,
    linkedRecordId: null,
    linkedRecordCachedName: '',
    searchVector: '',
    targetPersonId: null,
    targetNoteId: null,
    targetReviewItemId: null,
    ...timelineActivity,
  });

  return {
    myLeadUpdated: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000001',
      targetPersonId: MY_LEAD_ID,
      properties: { diff: { city: { before: 'Paris', after: 'Lyon' } } },
    }),
    otherLeadUpdated: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000002',
      targetPersonId: OTHER_LEAD_ID,
      properties: { diff: { city: { before: 'Austin', after: 'Dallas' } } },
    }),
    reviewItemUpdated: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000003',
      targetReviewItemId: REVIEW_ITEM_ID,
      properties: { diff: { decision: { before: null, after: 'FLAG_AUDIT' } } },
    }),
    noteLinkedToOtherLead: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000004',
      targetPersonId: OTHER_LEAD_ID,
      linkedObjectMetadataId: NOTE_OBJECT_ID,
      linkedRecordId: NOTE_ID,
      linkedRecordCachedName: 'Call notes',
      searchVector: "'call':1 'notes':2",
      properties: { diff: { title: { before: 'Draft', after: 'Call notes' } } },
    }),
    noteLinkedToMyLead: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000005',
      targetPersonId: MY_LEAD_ID,
      linkedObjectMetadataId: NOTE_OBJECT_ID,
      linkedRecordId: NOTE_ID,
      linkedRecordCachedName: 'Call notes',
      searchVector: "'call':1 'notes':2",
      properties: { diff: { title: { before: 'Draft', after: 'Call notes' } } },
    }),
    otherLeadLinkedToNote: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000006',
      targetNoteId: NOTE_ID,
      linkedObjectMetadataId: PERSON_OBJECT_ID,
      linkedRecordId: OTHER_LEAD_ID,
      linkedRecordCachedName: 'Jane Doe',
      searchVector: "'doe':2 'jane':1",
      properties: { diff: { city: { before: 'Austin', after: 'Dallas' } } },
    }),
    appSummaryOnOtherLead: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000007',
      targetPersonId: OTHER_LEAD_ID,
      properties: { summary: 'Asked about the plan renewal' },
    }),
    otherLeadLinkedToMyLead: buildTimelineActivity({
      id: '00000000-0000-4000-8000-000000000008',
      targetPersonId: MY_LEAD_ID,
      linkedObjectMetadataId: PERSON_OBJECT_ID,
      linkedRecordId: OTHER_LEAD_ID,
      linkedRecordCachedName: 'Jane Doe',
      searchVector: "'doe':2 'jane':1",
      properties: { diff: { city: { before: 'Austin', after: 'Dallas' } } },
    }),
  };
};

const TIMELINE_ACTIVITY_IDS = Object.values(buildTimelineActivities()).map(
  ({ id }) => id,
);

const ROW_IDS_BY_OBJECT_METADATA_ID: Record<string, string[]> = {
  [PERSON_OBJECT_ID]: PERSON_ROWS.map(({ id }) => id),
  [REVIEW_ITEM_OBJECT_ID]: [REVIEW_ITEM_ID],
  [NOTE_OBJECT_ID]: [NOTE_ID],
  [TIMELINE_ACTIVITY_OBJECT_ID]: TIMELINE_ACTIVITY_IDS,
};

const buildFlatEntityMaps = <TFlatEntity extends SyncableFlatEntity>(
  flatEntities: TFlatEntity[],
) =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const personObjectMetadata = getFlatObjectMetadataMock({
  id: PERSON_OBJECT_ID,
  universalIdentifier: PERSON_OBJECT_ID,
  nameSingular: 'person',
  namePlural: 'people',
  fieldIds: [
    PERSON_CITY_FIELD_ID,
    PERSON_ASSIGNED_AGENT_FIELD_ID,
    PERSON_TIMELINE_ACTIVITIES_FIELD_ID,
  ],
});

const timelineActivityObjectMetadata = getFlatObjectMetadataMock({
  id: TIMELINE_ACTIVITY_OBJECT_ID,
  universalIdentifier: TIMELINE_ACTIVITY_OBJECT_ID,
  nameSingular: 'timelineActivity',
  namePlural: 'timelineActivities',
  isSystem: true,
  fieldIds: [
    TIMELINE_ACTIVITY_PROPERTIES_FIELD_ID,
    TIMELINE_ACTIVITY_LINKED_OBJECT_METADATA_ID_FIELD_ID,
    TIMELINE_ACTIVITY_LINKED_RECORD_ID_FIELD_ID,
    TIMELINE_ACTIVITY_LINKED_RECORD_CACHED_NAME_FIELD_ID,
    TIMELINE_ACTIVITY_TARGET_PERSON_FIELD_ID,
    TIMELINE_ACTIVITY_SEARCH_VECTOR_FIELD_ID,
  ],
});

const flatObjectMetadataMaps = buildFlatEntityMaps([
  personObjectMetadata,
  timelineActivityObjectMetadata,
  getFlatObjectMetadataMock({
    id: AGENT_PROFILE_OBJECT_ID,
    universalIdentifier: AGENT_PROFILE_OBJECT_ID,
    nameSingular: 'agentProfile',
    namePlural: 'agentProfiles',
    fieldIds: [
      AGENT_PROFILE_LEADS_FIELD_ID,
      AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    ],
  }),
  getFlatObjectMetadataMock({
    id: WORKSPACE_MEMBER_OBJECT_ID,
    universalIdentifier: WORKSPACE_MEMBER_OBJECT_ID,
    nameSingular: 'workspaceMember',
    namePlural: 'workspaceMembers',
    fieldIds: [
      WORKSPACE_MEMBER_ID_FIELD_ID,
      WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    ],
  }),
  getFlatObjectMetadataMock({
    id: REVIEW_ITEM_OBJECT_ID,
    universalIdentifier: REVIEW_ITEM_OBJECT_ID,
    nameSingular: 'reviewItem',
    namePlural: 'reviewItems',
    fieldIds: [REVIEW_ITEM_DECISION_FIELD_ID],
  }),
  getFlatObjectMetadataMock({
    id: NOTE_OBJECT_ID,
    universalIdentifier: NOTE_OBJECT_ID,
    nameSingular: 'note',
    namePlural: 'notes',
    fieldIds: [NOTE_TITLE_FIELD_ID],
  }),
]);

const buildField = ({
  id,
  objectMetadataId,
  type,
  name,
}: {
  id: string;
  objectMetadataId: string;
  type: FieldMetadataType;
  name: string;
}) =>
  getFlatFieldMetadataMock({
    id,
    universalIdentifier: id,
    objectMetadataId,
    type,
    name,
  });

const buildRelationField = ({
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
}) =>
  getFlatFieldMetadataMock({
    id,
    universalIdentifier: id,
    objectMetadataId,
    type: FieldMetadataType.RELATION,
    name,
    relationTargetObjectMetadataId,
    relationTargetFieldMetadataId,
    settings:
      relationType === RelationType.MANY_TO_ONE
        ? { relationType, joinColumnName: `${name}Id` }
        : { relationType },
  });

const flatFieldMetadataMaps = buildFlatEntityMaps([
  buildField({
    id: PERSON_CITY_FIELD_ID,
    objectMetadataId: PERSON_OBJECT_ID,
    type: FieldMetadataType.TEXT,
    name: 'city',
  }),
  buildRelationField({
    id: PERSON_ASSIGNED_AGENT_FIELD_ID,
    name: 'assignedAgent',
    objectMetadataId: PERSON_OBJECT_ID,
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetFieldMetadataId: AGENT_PROFILE_LEADS_FIELD_ID,
    relationType: RelationType.MANY_TO_ONE,
  }),
  buildRelationField({
    id: PERSON_TIMELINE_ACTIVITIES_FIELD_ID,
    name: 'timelineActivities',
    objectMetadataId: PERSON_OBJECT_ID,
    relationTargetObjectMetadataId: TIMELINE_ACTIVITY_OBJECT_ID,
    relationTargetFieldMetadataId: TIMELINE_ACTIVITY_TARGET_PERSON_FIELD_ID,
    relationType: RelationType.ONE_TO_MANY,
  }),
  buildRelationField({
    id: AGENT_PROFILE_LEADS_FIELD_ID,
    name: 'leads',
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetObjectMetadataId: PERSON_OBJECT_ID,
    relationTargetFieldMetadataId: PERSON_ASSIGNED_AGENT_FIELD_ID,
    relationType: RelationType.ONE_TO_MANY,
  }),
  buildRelationField({
    id: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    name: 'workspaceMember',
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetObjectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    relationTargetFieldMetadataId: WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    relationType: RelationType.MANY_TO_ONE,
  }),
  buildRelationField({
    id: WORKSPACE_MEMBER_AGENT_PROFILES_FIELD_ID,
    name: 'agentProfiles',
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    relationTargetObjectMetadataId: AGENT_PROFILE_OBJECT_ID,
    relationTargetFieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
    relationType: RelationType.ONE_TO_MANY,
  }),
  buildField({
    id: WORKSPACE_MEMBER_ID_FIELD_ID,
    objectMetadataId: WORKSPACE_MEMBER_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'id',
  }),
  buildField({
    id: REVIEW_ITEM_DECISION_FIELD_ID,
    objectMetadataId: REVIEW_ITEM_OBJECT_ID,
    type: FieldMetadataType.TEXT,
    name: 'decision',
  }),
  buildField({
    id: NOTE_TITLE_FIELD_ID,
    objectMetadataId: NOTE_OBJECT_ID,
    type: FieldMetadataType.TEXT,
    name: 'title',
  }),
  buildField({
    id: TIMELINE_ACTIVITY_PROPERTIES_FIELD_ID,
    objectMetadataId: TIMELINE_ACTIVITY_OBJECT_ID,
    type: FieldMetadataType.RAW_JSON,
    name: 'properties',
  }),
  buildField({
    id: TIMELINE_ACTIVITY_LINKED_OBJECT_METADATA_ID_FIELD_ID,
    objectMetadataId: TIMELINE_ACTIVITY_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'linkedObjectMetadataId',
  }),
  buildField({
    id: TIMELINE_ACTIVITY_LINKED_RECORD_ID_FIELD_ID,
    objectMetadataId: TIMELINE_ACTIVITY_OBJECT_ID,
    type: FieldMetadataType.UUID,
    name: 'linkedRecordId',
  }),
  buildField({
    id: TIMELINE_ACTIVITY_LINKED_RECORD_CACHED_NAME_FIELD_ID,
    objectMetadataId: TIMELINE_ACTIVITY_OBJECT_ID,
    type: FieldMetadataType.TEXT,
    name: 'linkedRecordCachedName',
  }),
  buildField({
    id: TIMELINE_ACTIVITY_SEARCH_VECTOR_FIELD_ID,
    objectMetadataId: TIMELINE_ACTIVITY_OBJECT_ID,
    type: FieldMetadataType.TS_VECTOR,
    name: 'searchVector',
  }),
  getFlatFieldMetadataMock({
    id: TIMELINE_ACTIVITY_TARGET_PERSON_FIELD_ID,
    universalIdentifier: TIMELINE_ACTIVITY_TARGET_PERSON_FIELD_ID,
    objectMetadataId: TIMELINE_ACTIVITY_OBJECT_ID,
    type: FieldMetadataType.MORPH_RELATION,
    name: 'targetPerson',
    morphId: 'timeline-activity-target-morph-id',
    relationTargetObjectMetadataId: PERSON_OBJECT_ID,
    settings: {
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName: 'targetPersonId',
    },
  }),
]);

const READ_ALL_RECORDS: ObjectRecordsPermissions = {
  canCreateAllRecords: true,
  canReadAllRecords: true,
  canUpdateAllRecords: true,
  canSoftDeleteAllRecords: true,
  canDestroyAllRecords: true,
  unreadableFields: [],
  uneditableFields: [],
};

const NO_OBJECT_LEVEL_GRANTS: ObjectRecordsPermissions = {
  canCreateAllRecords: false,
  canReadAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
};

const OWN_LEADS_RULE: RowLevelRecordsPermissions = {
  ruleId: 'agent-own-leads-rule-id',
  canCreateRecords: true,
  canReadRecords: true,
  canUpdateRecords: true,
  canSoftDeleteRecords: true,
  canDestroyRecords: false,
  predicates: [
    {
      id: 'agent-own-leads-predicate-id',
      roleId: AGENT_ROLE_ID,
      objectMetadataId: PERSON_OBJECT_ID,
      relationFieldMetadataId: PERSON_ASSIGNED_AGENT_FIELD_ID,
      fieldMetadataId: AGENT_PROFILE_WORKSPACE_MEMBER_FIELD_ID,
      workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_ID,
      operand: RowLevelPermissionPredicateOperand.IS,
      value: null,
      subFieldName: null,
      workspaceMemberSubFieldName: null,
      rowLevelPermissionPredicateGroupId: null,
    },
  ],
  predicateGroups: [],
  unreadableFields: [],
  uneditableFields: [],
};

const ROLES_PERMISSIONS: Record<string, RoleRecordsPermissions> = {
  [AGENT_ROLE_ID]: {
    ...NO_ROLE_RECORDS_PERMISSIONS,
    objects: {
      [PERSON_OBJECT_ID]: {
        ...NO_OBJECT_LEVEL_GRANTS,
        rowLevelRecordsPermissions: [OWN_LEADS_RULE],
      },
      [REVIEW_ITEM_OBJECT_ID]: NO_OBJECT_LEVEL_GRANTS,
      [NOTE_OBJECT_ID]: READ_ALL_RECORDS,
      [TIMELINE_ACTIVITY_OBJECT_ID]: READ_ALL_RECORDS,
    },
  },
  [ADMIN_ROLE_ID]: {
    canReadAllRecords: true,
    canUpdateAllRecords: true,
    canSoftDeleteAllRecords: true,
    canDestroyAllRecords: true,
    objects: Object.fromEntries(
      Object.keys(ROW_IDS_BY_OBJECT_METADATA_ID).map((objectMetadataId) => [
        objectMetadataId,
        READ_ALL_RECORDS,
      ]),
    ),
  },
};

const WORKSPACE_CACHE: Record<string, unknown> = {
  flatObjectMetadataMaps,
  flatFieldMetadataMapsOrm: flatFieldMetadataMaps,
  featureFlagsMap: {
    [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
    [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: false,
    [FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED]: false,
    [FeatureFlagKey.IS_PRIVATE_RECORDS_ENABLED]: false,
    [FeatureFlagKey.IS_RELATED_RECORD_PATHS_ENABLED]: false,
  },
  rolesPermissions: ROLES_PERMISSIONS,
  flatWorkspaceMemberMaps: {
    byId: {
      [MY_WORKSPACE_MEMBER_ID]: {
        id: MY_WORKSPACE_MEMBER_ID,
        userId: MY_USER_ID,
      } as FlatWorkspaceMember,
      [ADMIN_WORKSPACE_MEMBER_ID]: {
        id: ADMIN_WORKSPACE_MEMBER_ID,
        userId: ADMIN_USER_ID,
      } as FlatWorkspaceMember,
    },
    idByUserId: {
      [MY_USER_ID]: MY_WORKSPACE_MEMBER_ID,
      [ADMIN_USER_ID]: ADMIN_WORKSPACE_MEMBER_ID,
    },
    idByUserWorkspaceId: {
      [MY_USER_WORKSPACE_ID]: MY_WORKSPACE_MEMBER_ID,
      [ADMIN_USER_WORKSPACE_ID]: ADMIN_WORKSPACE_MEMBER_ID,
    },
    userWorkspaceIdByUserId: {
      [MY_USER_ID]: MY_USER_WORKSPACE_ID,
      [ADMIN_USER_ID]: ADMIN_USER_WORKSPACE_ID,
    },
  },
  userWorkspaceRoleMap: {
    [MY_USER_WORKSPACE_ID]: AGENT_ROLE_ID,
    [ADMIN_USER_WORKSPACE_ID]: ADMIN_ROLE_ID,
  },
  flatRoleMaps: buildFlatEntityMaps(
    [AGENT_ROLE_ID, ADMIN_ROLE_ID].map(
      (roleId) =>
        ({
          id: roleId,
          universalIdentifier: roleId,
          applicationId: WORKSPACE_CUSTOM_APPLICATION_ID,
        }) as FlatRole,
    ),
  ),
  apiKeyRoleMap: {},
  flatRoleTargetByAgentIdMaps: {},
  flatRoleTargetByApplicationIdMaps: {},
  flatApplicationMaps: { byId: {} },
};

const buildUserAuthContext = ({
  workspaceMemberId,
  userWorkspaceId,
}: {
  workspaceMemberId: string;
  userWorkspaceId: string;
}) =>
  ({
    type: 'user',
    workspace: { id: WORKSPACE_ID },
    workspaceMemberId,
    userWorkspaceId,
  }) as WorkspaceAuthContext;

const AGENT_AUTH_CONTEXT = buildUserAuthContext({
  workspaceMemberId: MY_WORKSPACE_MEMBER_ID,
  userWorkspaceId: MY_USER_WORKSPACE_ID,
});

const ADMIN_AUTH_CONTEXT = buildUserAuthContext({
  workspaceMemberId: ADMIN_WORKSPACE_MEMBER_ID,
  userWorkspaceId: ADMIN_USER_WORKSPACE_ID,
});

// The fake database answers only the conditions these roles compile to: every record, or the lead hop
const findHopWorkspaceMemberIdsOrThrow = (
  sqlCondition: SQLCondition,
): string[] => {
  if (
    !sqlCondition.sql.startsWith('EXISTS') ||
    !sqlCondition.sql.includes('= "person"."assignedAgentId"') ||
    !/"workspaceMemberId" IN \(:\.\.\.\w+\)/.test(sqlCondition.sql)
  ) {
    throw new Error(`Unexpected row-level SQL: ${sqlCondition.sql}`);
  }

  return Object.values(sqlCondition.parameters).flat().filter(isNonEmptyString);
};

const findRecordIdsMatchingSQLCondition = jest.fn(
  async ({
    flatObjectMetadata,
    recordIds,
    sqlCondition,
  }: Parameters<
    RecordPermissionReadRepository['findRecordIdsMatchingSQLCondition']
  >[0]): Promise<Set<string>> => {
    const candidateRecordIds = (
      ROW_IDS_BY_OBJECT_METADATA_ID[flatObjectMetadata.id] ?? []
    ).filter((recordId) => recordIds.includes(recordId));

    if (sqlCondition === true) {
      return new Set(candidateRecordIds);
    }

    const workspaceMemberIds = findHopWorkspaceMemberIdsOrThrow(sqlCondition);

    return new Set(
      PERSON_ROWS.filter(
        ({ id, assignedAgentId }) =>
          candidateRecordIds.includes(id) &&
          AGENT_PROFILE_ROWS.some(
            (agentProfileRow) =>
              agentProfileRow.id === assignedAgentId &&
              workspaceMemberIds.includes(agentProfileRow.workspaceMemberId),
          ),
      ).map(({ id }) => id),
    );
  },
);

const createServices = async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ApplyTimelineActivitiesVisibilityRestrictionsService,
      CommonRecordVisibilityService,
      TimelineActivityWriteAuthorizationService,
      RecordPermissionsReadService,
      RecordEventPermissionsReadService,
      PermissionsMetadataMapsService,
      PrincipalPermissionsReadService,
      RelatedRecordPathReadService,
      AccessGroupReadService,
      {
        provide: WorkspaceCacheService,
        useValue: {
          getOrRecompute: jest.fn(
            async (_workspaceId: string, keys: string[]) =>
              Object.fromEntries(
                keys.map((key) => [key, WORKSPACE_CACHE[key]]),
              ),
          ),
        },
      },
      {
        provide: ApplicationGrantRoleLookupService,
        useValue: {
          findWorkspaceCustomApplicationIdOrThrow: jest
            .fn()
            .mockResolvedValue(WORKSPACE_CUSTOM_APPLICATION_ID),
        },
      },
      {
        provide: RecordPermissionReadRepository,
        useValue: {
          findRecordIdsMatchingSQLCondition,
          findRelationJoinValues: jest.fn().mockResolvedValue([]),
          findRecordShares: jest.fn().mockResolvedValue([]),
          findRecordShareAccessLevelsByObjectMetadataId: jest
            .fn()
            .mockResolvedValue(new Map()),
        },
      },
      {
        provide: PrivateRecordRepository,
        useValue: {
          findPrivateRecordStates: jest.fn().mockResolvedValue(new Map()),
        },
      },
      {
        provide: AccessGroupReadRepository,
        useValue: {
          findCompactIdsByGroupHashes: jest.fn().mockResolvedValue([]),
        },
      },
    ],
  }).compile();

  // Runs onModuleInit, so the handler registers with the visibility service as it does at boot
  await module.init();

  return {
    module,
    commonRecordVisibilityService: module.get(CommonRecordVisibilityService),
    timelineActivityWriteAuthorizationService: module.get(
      TimelineActivityWriteAuthorizationService,
    ),
    visibilityRestrictionsService: module.get(
      ApplyTimelineActivitiesVisibilityRestrictionsService,
    ),
    recordEventPermissionsReadService: module.get(
      RecordEventPermissionsReadService,
    ),
    recordPermissionsReadService: module.get(RecordPermissionsReadService),
    principalPermissionsReadService: module.get(
      PrincipalPermissionsReadService,
    ),
  };
};

describe('Omnia timeline activity row-level security', () => {
  let services: Awaited<ReturnType<typeof createServices>>;

  beforeAll(async () => {
    services = await createServices();
  });

  afterAll(async () => {
    await services.module.close();
  });

  beforeEach(() => {
    findRecordIdsMatchingSQLCondition.mockClear();
  });

  const applyVisibilityRestrictions = async ({
    authContext,
    records,
  }: {
    authContext: WorkspaceAuthContext;
    records: ObjectRecord[];
  }) => {
    const principals =
      await services.principalPermissionsReadService.resolvePermissionsPrincipals(
        { authContext },
      );

    await services.visibilityRestrictionsService.applyVisibilityRestrictions({
      records,
      authContext,
      recordReadRestrictions: isDefined(principals)
        ? await services.recordPermissionsReadService.findRecordReadRestrictions(
            { principals },
          )
        : NO_RECORD_READ_RESTRICTIONS,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    });

    return records;
  };

  const findQueriedObjectMetadataIds = () =>
    findRecordIdsMatchingSQLCondition.mock.calls.map(
      ([{ flatObjectMetadata }]) => flatObjectMetadata.id,
    );

  describe('as an agent restricted to their own leads', () => {
    it("should keep the diff of the agent's own lead", async () => {
      const { myLeadUpdated } = buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [myLeadUpdated],
      });

      expect(myLeadUpdated.properties).toEqual({
        diff: { city: { before: 'Paris', after: 'Lyon' } },
      });
    });

    it("should omit the diff of another agent's lead", async () => {
      const { otherLeadUpdated } = buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [otherLeadUpdated],
      });

      expect(otherLeadUpdated.properties).toEqual({ diff: {} });
      expect(otherLeadUpdated.linkedRecordCachedName).toBeNull();
      expect(otherLeadUpdated.searchVector).toBeNull();
    });

    it('should omit the diff of a review item the role cannot read at all', async () => {
      const { reviewItemUpdated } = buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [reviewItemUpdated],
      });

      expect(reviewItemUpdated.properties).toEqual({ diff: {} });
      expect(findRecordIdsMatchingSQLCondition).not.toHaveBeenCalled();
    });

    it("should omit the diff and cached name of a note linked to another agent's lead", async () => {
      const { noteLinkedToOtherLead, noteLinkedToMyLead } =
        buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [noteLinkedToOtherLead, noteLinkedToMyLead],
      });

      expect(noteLinkedToOtherLead.properties).toEqual({ diff: {} });
      expect(noteLinkedToOtherLead.linkedRecordCachedName).toBeNull();
      expect(noteLinkedToOtherLead.searchVector).toBeNull();
      expect(noteLinkedToMyLead.properties).toEqual({
        diff: { title: { before: 'Draft', after: 'Call notes' } },
      });
      expect(noteLinkedToMyLead.linkedRecordCachedName).toBe('Call notes');
      expect(noteLinkedToMyLead.searchVector).toBe("'call':1 'notes':2");
    });

    it("should omit the cached name of another agent's lead linked to a readable note", async () => {
      const { otherLeadLinkedToNote } = buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [otherLeadLinkedToNote],
      });

      expect(otherLeadLinkedToNote.properties).toEqual({ diff: {} });
      expect(otherLeadLinkedToNote.linkedRecordCachedName).toBeNull();
      expect(otherLeadLinkedToNote.searchVector).toBeNull();
    });

    it("should check a timeline activity selected only for its search vector, the lead's name in tokens", async () => {
      const { otherLeadLinkedToNote, noteLinkedToMyLead } =
        buildTimelineActivities();
      const selectSearchVectorOnly = ({
        id,
        searchVector,
        linkedObjectMetadataId,
        linkedRecordId,
        targetPersonId,
        targetNoteId,
      }: ObjectRecord): ObjectRecord => ({
        id,
        searchVector,
        linkedObjectMetadataId,
        linkedRecordId,
        targetPersonId,
        targetNoteId,
      });
      const otherLeadSearchVector = selectSearchVectorOnly(
        otherLeadLinkedToNote,
      );
      const myLeadSearchVector = selectSearchVectorOnly(noteLinkedToMyLead);

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [otherLeadSearchVector, myLeadSearchVector],
      });

      expect(otherLeadSearchVector.searchVector).toBeNull();
      expect(myLeadSearchVector.searchVector).toBe("'call':1 'notes':2");
    });

    it("should drop the keys an app wrote on another agent's lead", async () => {
      const { appSummaryOnOtherLead } = buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [appSummaryOnOtherLead],
      });

      expect(appSummaryOnOtherLead.properties).toEqual({});
    });

    it('should omit a linked lead whose record id was not read', async () => {
      const { otherLeadLinkedToNote } = buildTimelineActivities();
      const { linkedRecordId: _linkedRecordId, ...withoutLinkedRecordId } =
        otherLeadLinkedToNote;

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: [withoutLinkedRecordId as ObjectRecord],
      });

      expect(withoutLinkedRecordId.properties).toEqual({ diff: {} });
      expect(withoutLinkedRecordId.linkedRecordCachedName).toBeNull();
    });

    it('should look up the leads of a whole result in one query', async () => {
      const timelineActivities = Object.values(buildTimelineActivities());

      await applyVisibilityRestrictions({
        authContext: AGENT_AUTH_CONTEXT,
        records: timelineActivities,
      });

      expect(findQueriedObjectMetadataIds()).toEqual([PERSON_OBJECT_ID]);
      expect(
        new Set(findRecordIdsMatchingSQLCondition.mock.calls[0][0].recordIds),
      ).toEqual(new Set([MY_LEAD_ID, OTHER_LEAD_ID]));
    });

    it('should drop the events of timeline activities describing records the agent cannot read', async () => {
      const timelineActivities = buildTimelineActivities();
      const events: ObjectRecordCreateEvent<ObjectRecord>[] = Object.values(
        timelineActivities,
      ).map((timelineActivity) => ({
        recordId: timelineActivity.id,
        properties: { after: timelineActivity },
      }));

      const readableEvents =
        await services.recordEventPermissionsReadService.filterReadableEvents({
          authContext: AGENT_AUTH_CONTEXT,
          eventBatch: {
            name: 'timelineActivity.created',
            workspaceId: WORKSPACE_ID,
            objectMetadata: timelineActivityObjectMetadata,
            events,
          },
        });

      expect(readableEvents.map(({ recordId }) => recordId)).toEqual([
        timelineActivities.myLeadUpdated.id,
        timelineActivities.noteLinkedToMyLead.id,
      ]);
    });

    it("should drop an update event whose earlier snapshot describes another agent's lead", async () => {
      const { otherLeadUpdated, myLeadUpdated } = buildTimelineActivities();
      const buildUpdateEvent = (
        before: ObjectRecord,
      ): ObjectRecordUpdateEvent<ObjectRecord> => ({
        recordId: otherLeadUpdated.id,
        properties: {
          before,
          after: { ...otherLeadUpdated, targetPersonId: MY_LEAD_ID },
          updatedFields: ['targetPersonId'],
          diff: {},
        },
      });

      const readableEvents =
        await services.recordEventPermissionsReadService.filterReadableEvents({
          authContext: AGENT_AUTH_CONTEXT,
          eventBatch: {
            name: 'timelineActivity.updated',
            workspaceId: WORKSPACE_ID,
            objectMetadata: timelineActivityObjectMetadata,
            events: [
              buildUpdateEvent(otherLeadUpdated),
              buildUpdateEvent({ ...myLeadUpdated, id: otherLeadUpdated.id }),
            ],
          },
        });

      expect(
        readableEvents.map(
          ({ properties }) => properties.before.targetPersonId,
        ),
      ).toEqual([MY_LEAD_ID]);
    });

    it('should strip nested timeline activities through the registered handler', async () => {
      const { myLeadUpdated, otherLeadLinkedToMyLead } =
        buildTimelineActivities();
      const myLead: ObjectRecord = {
        id: MY_LEAD_ID,
        timelineActivities: [myLeadUpdated, otherLeadLinkedToMyLead],
      };

      await services.commonRecordVisibilityService.applyVisibilityRestrictions({
        records: [myLead],
        flatObjectMetadata: personObjectMetadata,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        authContext: AGENT_AUTH_CONTEXT,
        recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
      });

      expect(myLeadUpdated.properties).toEqual({
        diff: { city: { before: 'Paris', after: 'Lyon' } },
      });
      expect(otherLeadLinkedToMyLead).toMatchObject({
        properties: { diff: {} },
        linkedRecordCachedName: null,
        searchVector: null,
      });
    });
  });

  describe('as an admin', () => {
    it('should keep every diff and cached name without looking up a record', async () => {
      const timelineActivities = Object.values(buildTimelineActivities());

      await applyVisibilityRestrictions({
        authContext: ADMIN_AUTH_CONTEXT,
        records: timelineActivities,
      });

      expect(timelineActivities).toEqual(
        Object.values(buildTimelineActivities()),
      );
      expect(findRecordIdsMatchingSQLCondition).not.toHaveBeenCalled();
    });

    it('should keep every timeline activity event', async () => {
      const events: ObjectRecordCreateEvent<ObjectRecord>[] = Object.values(
        buildTimelineActivities(),
      ).map((timelineActivity) => ({
        recordId: timelineActivity.id,
        properties: { after: timelineActivity },
      }));

      const readableEvents =
        await services.recordEventPermissionsReadService.filterReadableEvents({
          authContext: ADMIN_AUTH_CONTEXT,
          eventBatch: {
            name: 'timelineActivity.created',
            workspaceId: WORKSPACE_ID,
            objectMetadata: timelineActivityObjectMetadata,
            events,
          },
        });

      expect(readableEvents.map(({ recordId }) => recordId)).toEqual(
        TIMELINE_ACTIVITY_IDS,
      );
      expect(findQueriedObjectMetadataIds()).toEqual([
        TIMELINE_ACTIVITY_OBJECT_ID,
      ]);
    });
  });

  describe('without a role', () => {
    it('should omit every diff for a reader whose permissions cannot be resolved', async () => {
      const { myLeadUpdated, noteLinkedToMyLead } = buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: {
          type: 'pendingActivationUser',
          workspace: { id: WORKSPACE_ID },
          userWorkspaceId: MY_USER_WORKSPACE_ID,
        } as WorkspaceAuthContext,
        records: [myLeadUpdated, noteLinkedToMyLead],
      });

      expect(myLeadUpdated.properties).toEqual({ diff: {} });
      expect(noteLinkedToMyLead.properties).toEqual({ diff: {} });
      expect(noteLinkedToMyLead.linkedRecordCachedName).toBeNull();
    });

    it('should leave system reads to the field filter alone', async () => {
      const { otherLeadUpdated, reviewItemUpdated } = buildTimelineActivities();

      await applyVisibilityRestrictions({
        authContext: buildSystemAuthContext(WORKSPACE_ID),
        records: [otherLeadUpdated, reviewItemUpdated],
      });

      expect([otherLeadUpdated, reviewItemUpdated]).toEqual([
        buildTimelineActivities().otherLeadUpdated,
        buildTimelineActivities().reviewItemUpdated,
      ]);
      expect(findRecordIdsMatchingSQLCondition).not.toHaveBeenCalled();
    });
  });

  describe('selected columns', () => {
    it('should select the linked record and targets when only the cached name is requested', () => {
      expect(
        addTimelineActivityObjectColumnsToSelect({
          select: { linkedRecordCachedName: true },
          flatObjectMetadata: timelineActivityObjectMetadata,
          recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        }),
      ).toEqual({
        linkedRecordCachedName: true,
        linkedObjectMetadataId: true,
        linkedRecordId: true,
        targetPersonId: true,
      });
    });

    it('should select the linked record and targets when only the search vector is requested', () => {
      expect(
        addTimelineActivityObjectColumnsToSelect({
          select: { searchVector: true },
          flatObjectMetadata: timelineActivityObjectMetadata,
          recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        }),
      ).toEqual({
        searchVector: true,
        linkedObjectMetadataId: true,
        linkedRecordId: true,
        targetPersonId: true,
      });
    });

    it('should select the check columns of timeline activities nested under a lead', () => {
      expect(
        addTimelineActivityObjectColumnsToSelect({
          select: {
            id: true,
            timelineActivities: { linkedRecordCachedName: true },
          },
          flatObjectMetadata: personObjectMetadata,
          recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        }),
      ).toEqual({
        id: true,
        timelineActivities: {
          linkedRecordCachedName: true,
          linkedObjectMetadataId: true,
          linkedRecordId: true,
          targetPersonId: true,
        },
      });
    });

    it('should not select a linked record id the reader cannot read', () => {
      expect(
        addTimelineActivityObjectColumnsToSelect({
          select: { properties: true },
          flatObjectMetadata: timelineActivityObjectMetadata,
          recordReadRestrictions: {
            unreadableFieldMetadataIds: new Set([
              TIMELINE_ACTIVITY_LINKED_RECORD_ID_FIELD_ID,
            ]),
          },
          flatObjectMetadataMaps,
          flatFieldMetadataMaps,
        }),
      ).toEqual({
        properties: true,
        linkedObjectMetadataId: true,
        targetPersonId: true,
      });
    });
  });

  describe('queryable fields', () => {
    const DESCRIBED_RECORD_VALUE_FIELD_NAMES = [
      'properties',
      'linkedRecordCachedName',
      'searchVector',
    ];

    const AGENT_READ_RESTRICTIONS = buildRecordReadRestrictions({
      recordsPermissions: ROLES_PERMISSIONS[AGENT_ROLE_ID],
    });

    // Every object readable in full except leads, which a row-level rule narrows to the agent's own
    const ROW_LEVEL_RULES_ONLY_READ_RESTRICTIONS = buildRecordReadRestrictions({
      recordsPermissions: {
        objects: {
          ...ROLES_PERMISSIONS[ADMIN_ROLE_ID].objects,
          [PERSON_OBJECT_ID]: {
            ...NO_OBJECT_LEVEL_GRANTS,
            rowLevelRecordsPermissions: [OWN_LEADS_RULE],
          },
        },
      },
    });

    it.each(DESCRIBED_RECORD_VALUE_FIELD_NAMES)(
      'should refuse to filter or order by %s for a restricted role',
      (fieldName) => {
        expect(() =>
          assertTimelineActivityPropertiesAreQueryableOrThrow({
            objectNameSingular: 'timelineActivity',
            fieldName,
            recordReadRestrictions: AGENT_READ_RESTRICTIONS,
          }),
        ).toThrow(PermissionsException);
      },
    );

    it.each(DESCRIBED_RECORD_VALUE_FIELD_NAMES)(
      'should let an unrestricted role filter or order by %s',
      (fieldName) => {
        expect(() =>
          assertTimelineActivityPropertiesAreQueryableOrThrow({
            objectNameSingular: 'timelineActivity',
            fieldName,
            recordReadRestrictions: NO_RECORD_READ_RESTRICTIONS,
          }),
        ).not.toThrow();
      },
    );

    it.each(DESCRIBED_RECORD_VALUE_FIELD_NAMES)(
      'should refuse ordering by %s to a role held only by row-level rules, since cursors carry the raw value',
      (fieldName) => {
        expect(
          ROW_LEVEL_RULES_ONLY_READ_RESTRICTIONS.unreadableObjectMetadataIds,
        ).toEqual(new Set());
        expect(
          ROW_LEVEL_RULES_ONLY_READ_RESTRICTIONS.unreadableFieldMetadataIds,
        ).toEqual(new Set());
        expect(() =>
          resolveOrderByLeaves({
            orderBy: [{ [fieldName]: OrderByDirection.AscNullsFirst }],
            flatObjectMetadata: timelineActivityObjectMetadata,
            flatFieldMetadataMaps,
            recordReadRestrictions: ROW_LEVEL_RULES_ONLY_READ_RESTRICTIONS,
          }),
        ).toThrow(PermissionsException);
      },
    );

    it('should treat restrictions built without row-level information as restricted', () => {
      expect(() =>
        assertTimelineActivityPropertiesAreQueryableOrThrow({
          objectNameSingular: 'timelineActivity',
          fieldName: 'properties',
          recordReadRestrictions: {
            unreadableObjectMetadataIds: new Set(),
            unreadableFieldMetadataIds: new Set(),
          },
        }),
      ).toThrow(PermissionsException);
    });

    // Grouping by a search vector is refused upstream for every reader
    it('should refuse to group by the cached name for a role held only by row-level rules', async () => {
      const groupByQueryRunner: CommonGroupByQueryRunnerService = Object.assign(
        Object.create(CommonGroupByQueryRunnerService.prototype),
        {
          metricsService: { incrementCounterBy: jest.fn() },
          groupByArgProcessor: new GroupByArgProcessorService(),
        },
      );

      await expect(
        groupByQueryRunner.run(
          {
            groupBy: [{ linkedRecordCachedName: true }],
          } as unknown as Parameters<CommonGroupByQueryRunnerService['run']>[0],
          {
            flatObjectMetadata: timelineActivityObjectMetadata,
            flatObjectMetadataMaps,
            flatFieldMetadataMaps,
            recordReadRestrictions: ROW_LEVEL_RULES_ONLY_READ_RESTRICTIONS,
            repository: { createQueryBuilder: jest.fn() },
          } as unknown as Parameters<CommonGroupByQueryRunnerService['run']>[1],
        ),
      ).rejects.toThrow(PermissionsException);
    });
  });

  describe('timeline activity writes', () => {
    const OTHER_LEAD_ACTIVITY_FILTER = {
      targetPersonId: { eq: OTHER_LEAD_ID },
    };

    it.each([
      ['moves it to their own lead', { targetPersonId: MY_LEAD_ID }],
      [
        'moves it through a nested relation',
        {
          targetPerson: { connect: { where: { id: MY_LEAD_ID } } },
        },
      ],
      [
        'unlinks its linked record',
        {
          linkedObjectMetadataId: null,
          linkedRecordId: null,
        },
      ],
      ['rewrites its diff', { properties: { diff: {} } }],
      ['renames its linked record', { linkedRecordCachedName: 'Jane Doe' }],
    ])(
      "should refuse an agent's update of another agent's lead activity that %s",
      async (_change, data) => {
        await expect(
          new TimelineActivityUpdateManyPreQueryHook().execute(
            AGENT_AUTH_CONTEXT,
            'timelineActivity',
            { filter: OTHER_LEAD_ACTIVITY_FILTER, data } as never,
          ),
        ).rejects.toThrow(PermissionsException);
        await expect(
          new TimelineActivityUpdateOnePreQueryHook().execute(
            AGENT_AUTH_CONTEXT,
            'timelineActivity',
            {
              id: buildTimelineActivities().otherLeadUpdated.id,
              data,
            } as never,
          ),
        ).rejects.toThrow(PermissionsException);
      },
    );

    it('should let an application move its activity in time and let system work re-target', async () => {
      await expect(
        new TimelineActivityUpdateOnePreQueryHook().execute(
          {
            type: 'application',
            workspace: { id: WORKSPACE_ID },
          } as WorkspaceAuthContext,
          'timelineActivity',
          {
            id: buildTimelineActivities().myLeadUpdated.id,
            data: { happensAt: '2026-01-01T00:00:00.000Z' },
          } as never,
        ),
      ).resolves.toMatchObject({
        data: { happensAt: '2026-01-01T00:00:00.000Z' },
      });
      await expect(
        new TimelineActivityUpdateManyPreQueryHook().execute(
          buildSystemAuthContext(WORKSPACE_ID),
          'timelineActivity',
          {
            filter: OTHER_LEAD_ACTIVITY_FILTER,
            data: { targetPersonId: MY_LEAD_ID },
          } as never,
        ),
      ).resolves.toMatchObject({ data: { targetPersonId: MY_LEAD_ID } });
    });

    it('should refuse an agent merging timeline activities, dry runs included', async () => {
      const { myLeadUpdated, otherLeadUpdated } = buildTimelineActivities();
      const mergeArgs = (dryRun: boolean) =>
        ({
          ids: [myLeadUpdated.id, otherLeadUpdated.id],
          conflictPriorityIndex: 0,
          dryRun,
        }) as never;

      for (const dryRun of [false, true]) {
        await expect(
          new TimelineActivityMergeManyPreQueryHook().execute(
            AGENT_AUTH_CONTEXT,
            'timelineActivity',
            mergeArgs(dryRun),
          ),
        ).rejects.toThrow(PermissionsException);
      }
      await expect(
        new TimelineActivityMergeManyPreQueryHook().execute(
          buildSystemAuthContext(WORKSPACE_ID),
          'timelineActivity',
          mergeArgs(false),
        ),
      ).resolves.toMatchObject({ conflictPriorityIndex: 0 });
    });

    const assertMayDescribeRecords = ({
      authContext = AGENT_AUTH_CONTEXT,
      records,
    }: {
      authContext?: WorkspaceAuthContext;
      records: TimelineActivityMutationInput[];
    }) =>
      services.timelineActivityWriteAuthorizationService.assertMayDescribeRecordsOrThrow(
        { authContext, records },
      );

    it.each([
      ['their own lead', { targetPersonId: MY_LEAD_ID }],
      [
        'their own lead through a nested relation',
        {
          targetPerson: { connect: { where: { id: MY_LEAD_ID } } },
        },
      ],
      [
        'their own lead, linked to a note',
        {
          targetPersonId: MY_LEAD_ID,
          linkedObjectMetadataId: NOTE_OBJECT_ID,
          linkedRecordId: NOTE_ID,
        },
      ],
    ])('should let an agent add an activity on %s', async (_target, record) => {
      await expect(
        assertMayDescribeRecords({
          records: [
            { timelineActivityTypeId: TIMELINE_ACTIVITY_TYPE_ID, ...record },
          ],
        }),
      ).resolves.toBeUndefined();
    });

    it.each([
      ["another agent's lead", { targetPersonId: OTHER_LEAD_ID }],
      [
        "their own lead, linked to another agent's lead",
        {
          targetPersonId: MY_LEAD_ID,
          linkedObjectMetadataId: PERSON_OBJECT_ID,
          linkedRecordId: OTHER_LEAD_ID,
        },
      ],
      [
        'a lead found by another unique field',
        {
          targetPerson: { connect: { where: { email: 'jane@example.com' } } },
        },
      ],
      [
        'a review item the role cannot read',
        {
          targetReviewItemId: REVIEW_ITEM_ID,
        },
      ],
    ])(
      'should refuse an agent adding an activity on %s',
      async (_target, record) => {
        await expect(
          assertMayDescribeRecords({
            records: [
              { timelineActivityTypeId: TIMELINE_ACTIVITY_TYPE_ID, ...record },
            ],
          }),
        ).rejects.toThrow(PermissionsException);
      },
    );

    it('should check created activities in the create hook before stamping them', async () => {
      const timelineActivityMutationQueryHookService = {
        stampTimelineActivityTypeSnapshot: jest.fn(
          async ({ records }: { records: TimelineActivityMutationInput[] }) =>
            records,
        ),
      };
      const createOnePreQueryHook = new TimelineActivityCreateOnePreQueryHook(
        timelineActivityMutationQueryHookService as unknown as TimelineActivityMutationQueryHookService,
        services.timelineActivityWriteAuthorizationService,
      );

      await expect(
        createOnePreQueryHook.execute(AGENT_AUTH_CONTEXT, 'timelineActivity', {
          data: {
            timelineActivityTypeId: TIMELINE_ACTIVITY_TYPE_ID,
            targetPersonId: OTHER_LEAD_ID,
          },
        }),
      ).rejects.toThrow(PermissionsException);
      expect(
        timelineActivityMutationQueryHookService.stampTimelineActivityTypeSnapshot,
      ).not.toHaveBeenCalled();
    });

    it('should leave system writes unchecked', async () => {
      await expect(
        assertMayDescribeRecords({
          authContext: buildSystemAuthContext(WORKSPACE_ID),
          records: [
            {
              timelineActivityTypeId: TIMELINE_ACTIVITY_TYPE_ID,
              targetPersonId: OTHER_LEAD_ID,
            },
          ],
        }),
      ).resolves.toBeUndefined();
      expect(findRecordIdsMatchingSQLCondition).not.toHaveBeenCalled();
    });
  });
});
