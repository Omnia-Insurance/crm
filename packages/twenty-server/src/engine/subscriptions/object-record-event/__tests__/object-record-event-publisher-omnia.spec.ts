import { Test, type TestingModule } from '@nestjs/testing';

import { type ObjectRecordEvent } from 'twenty-shared/database-events';
import { type ObjectRecord } from 'twenty-shared/types';

import { ProcessNestedRelationsHelper } from 'src/engine/api/common/common-nested-relations-processor/process-nested-relations.helper';
import { CommonSelectFieldsBuilder } from 'src/engine/api/common/common-select-fields/common-select-fields-builder';
import { UserWorkspaceAuthContextService } from 'src/engine/core-modules/user-workspace/services/user-workspace-auth-context.service';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type PermissionsAuthContext } from 'src/engine/permissions/principal/types/permissions-auth-context.type';
import { RecordEventPermissionsReadService } from 'src/engine/permissions/record-event-permissions-read.service';
import { EventStreamService } from 'src/engine/subscriptions/event-stream.service';
import { ObjectRecordEventPublisher } from 'src/engine/subscriptions/object-record-event/object-record-event-publisher';
import { SubscriptionService } from 'src/engine/subscriptions/subscription.service';
import { type EventStreamData } from 'src/engine/subscriptions/types/event-stream-data.type';
import { type EventStreamPayload } from 'src/engine/subscriptions/types/event-stream-payload.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';

jest.mock(
  'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query.parser',
  () => ({
    GraphqlQueryParser: jest.fn().mockImplementation(() => ({
      parseSelectedFields: (selectedFields: Record<string, unknown>) => ({
        select: selectedFields,
        relations: Object.fromEntries(
          Object.entries(selectedFields)
            .filter(([, value]) => typeof value === 'object')
            .map(([fieldName]) => [fieldName, {}]),
        ),
      }),
    })),
  }),
);

const WORKSPACE_ID = 'workspace-id';
const ADMIN_MEMBER_ID = 'admin';
const AGENT_MEMBER_ID = 'agent';

const RELATION_TARGET_BY_RELATION_NAME = {
  lead: 'lead',
  reviewItems: 'reviewItem',
} as const;

const policyObjectMetadata = getFlatObjectMetadataMock({
  id: 'policy',
  universalIdentifier: 'policy',
  nameSingular: 'policy',
  workspaceId: WORKSPACE_ID,
});

const buildStreamData = (workspaceMemberId: string): EventStreamData => ({
  authContext: {
    userId: `${workspaceMemberId}-user`,
    userWorkspaceId: workspaceMemberId,
    workspaceMemberId,
  },
  workspaceId: WORKSPACE_ID,
  queries: {
    'policies-query': { objectNameSingular: 'policy', variables: {} },
  },
  createdAt: Date.now(),
});

const buildPolicyUpdatedBatch = (): WorkspaceEventBatch<ObjectRecordEvent> => ({
  name: 'policy.updated',
  workspaceId: WORKSPACE_ID,
  objectMetadata: policyObjectMetadata,
  events: [
    {
      recordId: 'policy-1',
      properties: {
        before: { id: 'policy-1', name: 'Policy 1' },
        after: { id: 'policy-1', name: 'Policy 1 renewed' },
        updatedFields: ['name'],
        diff: {
          name: { before: 'Policy 1', after: 'Policy 1 renewed' },
        },
      },
    },
  ],
});

describe('ObjectRecordEventPublisher (Omnia)', () => {
  let publisher: ObjectRecordEventPublisher;
  let payloadsByStreamId: Map<string, EventStreamPayload>;
  let readableObjectIdsByMemberId: Record<string, string[]>;
  let relatedRecordsByRelationName: Record<string, unknown>;
  let failingEnrichmentMemberIds: string[];

  beforeEach(async () => {
    payloadsByStreamId = new Map();
    readableObjectIdsByMemberId = {};
    relatedRecordsByRelationName = {};
    failingEnrichmentMemberIds = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObjectRecordEventPublisher,
        {
          provide: SubscriptionService,
          useValue: {
            // Redis pub/sub serializes the payload when it is published
            publishToEventStream: jest.fn(
              async ({
                eventStreamChannelId,
                payload,
              }: {
                eventStreamChannelId: string;
                payload: EventStreamPayload;
              }) => {
                payloadsByStreamId.set(
                  eventStreamChannelId,
                  JSON.parse(JSON.stringify(payload)),
                );
              },
            ),
          },
        },
        {
          provide: EventStreamService,
          useValue: {
            getActiveStreamIds: jest.fn(async () => [
              'admin-stream',
              'agent-stream',
            ]),
            getStreamsData: jest.fn(
              async () =>
                new Map([
                  ['admin-stream', buildStreamData(ADMIN_MEMBER_ID)],
                  ['agent-stream', buildStreamData(AGENT_MEMBER_ID)],
                ]),
            ),
            removeFromActiveStreams: jest.fn(),
          },
        },
        {
          provide: WorkspaceCacheService,
          useValue: {
            getOrRecompute: jest.fn(async () => ({
              flatWorkspaceMemberMaps: { byId: {} },
              flatFieldMetadataMaps: createEmptyFlatEntityMaps(),
              flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
            })),
          },
        },
        {
          provide: WorkspaceManyOrAllFlatEntityMapsCacheService,
          useValue: {
            getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(async () => ({
              flatFieldMetadataMaps: createEmptyFlatEntityMaps(),
              flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
            })),
          },
        },
        {
          provide: RecordEventPermissionsReadService,
          useValue: {
            // Nothing on the policy is hidden, so the batch's own events come back
            filterReadableEvents: jest.fn(
              async ({
                eventBatch,
              }: {
                eventBatch: WorkspaceEventBatch<ObjectRecordEvent>;
              }) => eventBatch.events,
            ),
          },
        },
        {
          provide: CommonSelectFieldsBuilder,
          useValue: {
            findObjectSelectionMetadataIdsOrThrow: jest.fn(
              async ({
                authContext,
              }: {
                authContext: PermissionsAuthContext;
              }) => ({
                readableObjectMetadataIds: new Set(
                  authContext.type === 'user'
                    ? readableObjectIdsByMemberId[authContext.workspaceMemberId]
                    : [],
                ),
                unreadableFieldMetadataIds: new Set<string>(),
              }),
            ),
            // Relations to objects the subscriber cannot read are left out of the selection
            buildFromDepth: jest.fn(
              ({
                readableObjectMetadataIds,
              }: {
                readableObjectMetadataIds: Set<string>;
              }) => ({
                selectedFields: {
                  id: true,
                  name: true,
                  ...Object.fromEntries(
                    Object.entries(RELATION_TARGET_BY_RELATION_NAME)
                      .filter(([, targetObjectId]) =>
                        readableObjectMetadataIds.has(targetObjectId),
                      )
                      .map(([relationName]) => [relationName, { id: true }]),
                  ),
                },
              }),
            ),
          },
        },
        {
          provide: ProcessNestedRelationsHelper,
          useValue: {
            processNestedRelations: jest.fn(
              async ({
                parentObjectRecords,
                relations,
                authContext,
              }: {
                parentObjectRecords: ObjectRecord[];
                relations: Record<string, object>;
                authContext: { workspaceMemberId: string };
              }) => {
                if (
                  failingEnrichmentMemberIds.includes(
                    authContext.workspaceMemberId,
                  )
                ) {
                  throw new Error('Nested relation query failed');
                }

                for (const record of parentObjectRecords) {
                  for (const relationName of Object.keys(relations)) {
                    record[relationName] =
                      relatedRecordsByRelationName[relationName];
                  }
                }
              },
            ),
          },
        },
        {
          provide: WorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: jest.fn(
              async (callback: () => Promise<unknown>) => callback(),
            ),
          },
        },
        {
          provide: UserWorkspaceAuthContextService,
          useValue: {
            resolve: jest.fn(
              async ({ userWorkspaceId }: { userWorkspaceId: string }) => ({
                type: 'user',
                workspaceMemberId: userWorkspaceId,
              }),
            ),
          },
        },
      ],
    }).compile();

    publisher = module.get(ObjectRecordEventPublisher);
  });

  const getDeliveredRecords = (streamId: string) =>
    payloadsByStreamId.get(streamId)?.objectRecordEventsWithQueryIds.map(
      ({ objectRecordEvent }) =>
        objectRecordEvent.properties as {
          before?: ObjectRecord;
          after?: ObjectRecord;
        },
    ) ?? [];

  it('should not send a relation loaded for one subscriber to a later subscriber who cannot read its target', async () => {
    const reviewItems = [{ id: 'review-item-1', name: 'MISSING: P-1' }];

    readableObjectIdsByMemberId = {
      [ADMIN_MEMBER_ID]: ['policy', 'reviewItem'],
      [AGENT_MEMBER_ID]: ['policy'],
    };
    relatedRecordsByRelationName = { reviewItems };

    const eventBatch = buildPolicyUpdatedBatch();

    await publisher.publish(eventBatch);

    const [adminRecords] = getDeliveredRecords('admin-stream');
    const [agentRecords] = getDeliveredRecords('agent-stream');

    expect(adminRecords?.after).toEqual({
      id: 'policy-1',
      name: 'Policy 1 renewed',
      reviewItems,
    });
    expect(agentRecords?.before).toEqual({ id: 'policy-1', name: 'Policy 1' });
    expect(agentRecords?.after).toEqual({
      id: 'policy-1',
      name: 'Policy 1 renewed',
    });
    expect(eventBatch.events).toEqual(buildPolicyUpdatedBatch().events);
  });

  it('should not send relations loaded for another subscriber when enrichment fails', async () => {
    readableObjectIdsByMemberId = {
      [ADMIN_MEMBER_ID]: ['policy', 'lead'],
      [AGENT_MEMBER_ID]: ['policy', 'lead'],
    };
    relatedRecordsByRelationName = {
      lead: { id: 'lead-1', name: 'Lead of another agent' },
    };
    failingEnrichmentMemberIds = [AGENT_MEMBER_ID];

    await publisher.publish(buildPolicyUpdatedBatch());

    const [agentRecords] = getDeliveredRecords('agent-stream');

    expect(agentRecords?.before).toEqual({ id: 'policy-1', name: 'Policy 1' });
    expect(agentRecords?.after).toEqual({
      id: 'policy-1',
      name: 'Policy 1 renewed',
    });
  });
});
