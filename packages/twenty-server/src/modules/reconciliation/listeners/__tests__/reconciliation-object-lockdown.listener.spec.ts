import { Logger } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

import { v4 } from 'uuid';

import { type MetadataEventBatch } from 'src/engine/subscriptions/metadata-event/types/metadata-event-batch.type';
import { UpgradeAwareRepositoryState } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-repository-state';
import {
  buildLockdownFlatObjectPermissionMock,
  buildLockdownFlatPredicateMock,
  buildLockdownFlatRoleMock,
  buildLockdownFlatRuleMock,
  buildLockdownWorkspaceFixture,
  createLockdownServiceMock,
  createLockdownWorkspaceMock,
  LOCKDOWN_WORKSPACE_ID,
} from 'src/modules/reconciliation/listeners/__mocks__/reconciliation-object-lockdown-workspace.mock';
import { ReconciliationObjectLockdownListener } from 'src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener';
import { ReconciliationObjectLockdownService } from 'src/modules/reconciliation/services/object-lockdown.service';

const MAX_EVENT_ROUNDS = 10;

const setup = async () => {
  const fixture = buildLockdownWorkspaceFixture();
  const workspace = createLockdownWorkspaceMock(fixture.state);
  const { service } = createLockdownServiceMock(workspace);

  const testingModule = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot({ wildcard: true })],
    providers: [
      ReconciliationObjectLockdownListener,
      { provide: ReconciliationObjectLockdownService, useValue: service },
    ],
  }).compile();

  await testingModule.init();

  const eventEmitter = testingModule.get(EventEmitter2);

  const emit = async (batch: MetadataEventBatch) => {
    await eventEmitter.emitAsync(batch.name, batch);
  };

  // Replays what each write emits, the lockdown's own writes included, until nothing changes
  const settle = async (): Promise<number> => {
    for (let round = 0; round < MAX_EVENT_ROUNDS; round++) {
      const batches = workspace.takeEmittedMetadataEventBatches();

      if (batches.length === 0) {
        return round;
      }

      for (const batch of batches) {
        await emit(batch);
      }
    }

    throw new Error('Metadata events kept coming');
  };

  const isRoleLocked = (roleId: string) => {
    const reconciliationObjectPermissions =
      workspace.state.objectPermissions.filter(
        (objectPermission) =>
          objectPermission.roleId === roleId &&
          fixture.reconciliationObjectMetadataIds.includes(
            objectPermission.objectMetadataId,
          ),
      );

    return (
      reconciliationObjectPermissions.length ===
        fixture.reconciliationObjectMetadataIds.length &&
      reconciliationObjectPermissions.every(
        (objectPermission) =>
          objectPermission.canCreateObjectRecords === false &&
          objectPermission.canReadObjectRecords === false &&
          objectPermission.canUpdateObjectRecords === false &&
          objectPermission.canSoftDeleteObjectRecords === false &&
          objectPermission.canDestroyObjectRecords === false,
      ) &&
      !workspace.state.rules.some(
        (rule) =>
          rule.roleId === roleId &&
          fixture.reconciliationObjectMetadataIds.includes(
            rule.objectMetadataId,
          ),
      )
    );
  };

  return {
    fixture,
    workspace,
    service,
    emit,
    settle,
    isRoleLocked,
    close: () => testingModule.close(),
  };
};

describe('ReconciliationObjectLockdownListener', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should deny a role created in settings again after its object permissions are replaced without the reconciliation rows', async () => {
    const { fixture, workspace, settle, isRoleLocked, close } = await setup();
    const createdFlatRole = buildLockdownFlatRoleMock({
      id: v4(),
      universalIdentifier: v4(),
      label: 'Reconciler',
      flatApplication: fixture.flatApplications.workspaceCustom,
    });

    workspace.addRole(createdFlatRole);
    await settle();

    expect(isRoleLocked(createdFlatRole.id)).toBe(true);

    const draftPolicyObjectPermission = buildLockdownFlatObjectPermissionMock({
      flatRole: createdFlatRole,
      flatObjectMetadata: fixture.flatObjectMetadatas.policy,
      canReadObjectRecords: true,
    });

    workspace.replaceRoleObjectPermissions({
      roleId: createdFlatRole.id,
      objectPermissions: [draftPolicyObjectPermission],
    });

    expect(isRoleLocked(createdFlatRole.id)).toBe(false);

    await settle();

    expect(isRoleLocked(createdFlatRole.id)).toBe(true);
    expect(workspace.state.objectPermissions).toContainEqual(
      draftPolicyObjectPermission,
    );

    await close();
  });

  it('should lock an app role and its grant copy again after an app sync drops the deny rows', async () => {
    const { fixture, workspace, service, settle, isRoleLocked, close } =
      await setup();

    await service.applyToAllNonAdminRoles({
      workspaceId: LOCKDOWN_WORKSPACE_ID,
    });
    await settle();

    const complianceQaRoleId = fixture.flatRoles.complianceQa.id;

    workspace.replaceRoleObjectPermissions({
      roleId: complianceQaRoleId,
      objectPermissions: workspace.state.objectPermissions.filter(
        ({ roleId, objectMetadataId }) =>
          roleId === complianceQaRoleId &&
          objectMetadataId === fixture.flatObjectMetadatas.policy.id,
      ),
    });
    await workspace.upsertGrantRole({
      workspaceId: LOCKDOWN_WORKSPACE_ID,
      applicationId: fixture.flatApplications.complianceQa.id,
    });

    expect(isRoleLocked(fixture.flatRoles.complianceQaGrant.id)).toBe(false);

    await settle();

    expect(isRoleLocked(complianceQaRoleId)).toBe(true);
    expect(isRoleLocked(fixture.flatRoles.complianceQaGrant.id)).toBe(true);

    await close();
  });

  it('should delete a rule created on a reconciliation object', async () => {
    const { fixture, workspace, emit, settle, isRoleLocked, close } =
      await setup();
    const rule = buildLockdownFlatRuleMock({
      flatRole: fixture.flatRoles.member,
      flatObjectMetadata: fixture.flatObjectMetadatas.reconciliation,
      canReadRecords: true,
    });

    workspace.state.rules = [...workspace.state.rules, rule];

    await emit({
      name: 'metadata.rowLevelPermissionRule.created',
      workspaceId: LOCKDOWN_WORKSPACE_ID,
      metadataName: 'rowLevelPermissionRule',
      type: 'created',
      events: [
        {
          type: 'created',
          metadataName: 'rowLevelPermissionRule',
          recordId: rule.id,
          properties: { after: rule },
        },
      ],
    });
    await settle();

    expect(workspace.state.rules).not.toContainEqual(rule);
    expect(isRoleLocked(fixture.flatRoles.member.id)).toBe(true);

    await close();
  });

  it('should ignore row level permission rules and predicates on other objects', async () => {
    const { fixture, service, emit, close } = await setup();
    const applyToRole = jest.spyOn(service, 'applyToRole');
    const rule = buildLockdownFlatRuleMock({
      flatRole: fixture.flatRoles.member,
      flatObjectMetadata: fixture.flatObjectMetadatas.policy,
      canUpdateRecords: true,
    });
    const predicate = buildLockdownFlatPredicateMock({
      flatRole: fixture.flatRoles.member,
      flatObjectMetadata: fixture.flatObjectMetadatas.policy,
      rowLevelPermissionRuleId: rule.id,
    });

    await emit({
      name: 'metadata.rowLevelPermissionRule.updated',
      workspaceId: LOCKDOWN_WORKSPACE_ID,
      metadataName: 'rowLevelPermissionRule',
      type: 'updated',
      events: [
        {
          type: 'updated',
          metadataName: 'rowLevelPermissionRule',
          recordId: rule.id,
          properties: {
            updatedFields: [],
            diff: {},
            before: rule,
            after: rule,
          },
        },
      ] as MetadataEventBatch['events'],
    });
    await emit({
      name: 'metadata.rowLevelPermissionPredicate.created',
      workspaceId: LOCKDOWN_WORKSPACE_ID,
      metadataName: 'rowLevelPermissionPredicate',
      type: 'created',
      events: [
        {
          type: 'created',
          metadataName: 'rowLevelPermissionPredicate',
          recordId: predicate.id,
          properties: { after: predicate },
        },
      ],
    });

    expect(applyToRole).not.toHaveBeenCalled();

    await close();
  });

  it('should log a failed lock at error level without throwing', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { fixture, service, emit, close } = await setup();

    jest
      .spyOn(service, 'applyToRole')
      .mockRejectedValueOnce(new Error('lock not acquired'));

    await expect(
      emit({
        name: 'metadata.role.created',
        workspaceId: LOCKDOWN_WORKSPACE_ID,
        metadataName: 'role',
        type: 'created',
        events: [
          {
            type: 'created',
            metadataName: 'role',
            recordId: fixture.flatRoles.agent.id,
            properties: { after: fixture.flatRoles.agent },
          },
        ],
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(fixture.flatRoles.agent.id),
    );

    await close();
  });

  it('should leave roles to the upgrade lockdown while the upgrade has not created the rule table', async () => {
    const { fixture, service, emit, close } = await setup();
    const applyToRole = jest.spyOn(service, 'applyToRole');

    jest
      .spyOn(UpgradeAwareRepositoryState.prototype, 'isEntityAvailable')
      .mockReturnValue(false);

    await emit({
      name: 'metadata.role.created',
      workspaceId: LOCKDOWN_WORKSPACE_ID,
      metadataName: 'role',
      type: 'created',
      events: [
        {
          type: 'created',
          metadataName: 'role',
          recordId: fixture.flatRoles.agent.id,
          properties: { after: fixture.flatRoles.agent },
        },
      ],
    });

    expect(applyToRole).not.toHaveBeenCalled();

    await close();
  });
});
