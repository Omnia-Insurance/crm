import { Test } from '@nestjs/testing';

import { isDefined } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { BillingService } from 'src/engine/core-modules/billing/services/billing.service';
import { EnterprisePlanService } from 'src/engine/core-modules/enterprise/services/enterprise-plan.service';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { RowLevelPermissionPredicateService } from 'src/engine/metadata-modules/row-level-permission-predicate/services/row-level-permission-predicate.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import {
  buildAudienceFieldMock,
  buildAudienceOptionMock,
  buildAudiencePredicateMock,
  buildFlatRoleMock,
  buildObjectPermissionMock,
  buildRuleMock,
  createDashboardAudienceWorkspaceFake,
  DASHBOARD_AUDIENCE_TEST_IDS,
  DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
  DENY_ALL_OBJECT_PERMISSION_GRANTS,
  type DashboardAudienceWorkspaceState,
} from 'src/modules/dashboard/dashboard-audience/__mocks__/dashboard-audience-workspace.mock';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';
import { getDashboardAudiencePredicateIds } from 'src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-predicate-ids.util';

const WORKSPACE_ID = DASHBOARD_AUDIENCE_TEST_IDS.workspace;

const adminRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.adminRole,
  label: 'Admin',
  isEditable: false,
  canUpdateAllSettings: true,
  canUpdateAllObjectRecords: true,
});
const memberRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.memberRole,
  label: 'Member',
});
const agentRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.agentRole,
  label: 'Agent',
  applicationId: DASHBOARD_AUDIENCE_TEST_IDS.brokerageApplication,
  applicationUniversalIdentifier:
    DASHBOARD_AUDIENCE_TEST_IDS.brokerageApplicationUniversalIdentifier,
});
const suspendedRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.suspendedRole,
  label: 'Suspended',
  canReadAllObjectRecords: false,
});
const grantRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.grantRole,
  label: 'Brokerage',
  isEditable: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApplications: true,
});

const READ_GRANTS = { canReadRecords: true };

const memberRule = buildRuleMock({ flatRole: memberRole, grants: READ_GRANTS });
const agentRule = buildRuleMock({ flatRole: agentRole, grants: READ_GRANTS });

// What the scoped-permission translation leaves: audience rules carrying the old grants, dashboard object
// permissions denying everything, and a soft-deleted predicate for the role that had no dashboard access
const buildTranslatedWorkspaceState =
  (): Partial<DashboardAudienceWorkspaceState> => ({
    roles: [adminRole, memberRole, agentRole, suspendedRole, grantRole],
    fieldMetadatas: [
      buildAudienceFieldMock([
        buildAudienceOptionMock({
          roleId: memberRole.id,
          label: 'Member',
          position: 0,
        }),
        buildAudienceOptionMock({
          roleId: agentRole.id,
          label: 'Agent',
          position: 1,
        }),
        buildAudienceOptionMock({
          roleId: suspendedRole.id,
          label: 'Suspended',
          position: 2,
        }),
      ]),
    ],
    objectPermissions: [
      buildObjectPermissionMock({
        flatRole: memberRole,
        grants: DENY_ALL_OBJECT_PERMISSION_GRANTS,
        showInSidebar: true,
      }),
      buildObjectPermissionMock({
        flatRole: agentRole,
        grants: DENY_ALL_OBJECT_PERMISSION_GRANTS,
      }),
      buildObjectPermissionMock({
        flatRole: suspendedRole,
        grants: DENY_ALL_OBJECT_PERMISSION_GRANTS,
      }),
    ],
    rules: [memberRule, agentRule],
    predicates: [
      buildAudiencePredicateMock({ flatRole: memberRole, rule: memberRule }),
      buildAudiencePredicateMock({ flatRole: agentRole, rule: agentRule }),
      buildAudiencePredicateMock({
        flatRole: suspendedRole,
        rule: null,
        deletedAt: '2026-11-01T00:00:00.000Z',
      }),
    ],
  });

const setup = async (
  initialState: Partial<DashboardAudienceWorkspaceState>,
) => {
  const workspace = createDashboardAudienceWorkspaceFake(initialState);

  const module = await Test.createTestingModule({
    providers: [
      DashboardAudienceRoleSyncService,
      RowLevelPermissionPredicateService,
      {
        provide: WorkspaceCacheService,
        useValue: workspace.workspaceCacheService,
      },
      {
        provide: WorkspaceManyOrAllFlatEntityMapsCacheService,
        useValue: workspace.workspaceManyOrAllFlatEntityMapsCacheService,
      },
      {
        provide: WorkspaceMigrationValidateBuildAndRunService,
        useValue: workspace.workspaceMigrationValidateBuildAndRunService,
      },
      {
        provide: FieldMetadataService,
        useValue: workspace.fieldMetadataService,
      },
      { provide: ApplicationService, useValue: workspace.applicationService },
      { provide: BillingService, useValue: workspace.billingService },
      {
        provide: EnterprisePlanService,
        useValue: workspace.enterprisePlanService,
      },
    ],
  }).compile();

  return {
    service: module.get(DashboardAudienceRoleSyncService),
    workspace,
  };
};

const findDashboardRows = (
  state: DashboardAudienceWorkspaceState,
  flatRole: FlatRole,
) => ({
  objectPermission: state.objectPermissions.find(
    ({ roleId, objectMetadataId }) =>
      roleId === flatRole.id &&
      objectMetadataId === DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
  ),
  rules: state.rules.filter(
    ({ roleId, objectMetadataId }) =>
      roleId === flatRole.id &&
      objectMetadataId === DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
  ),
  livePredicates: state.predicates.filter(
    ({ roleId, objectMetadataId, deletedAt }) =>
      roleId === flatRole.id &&
      objectMetadataId === DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject &&
      !isDefined(deletedAt),
  ),
});

describe('DashboardAudienceRoleSyncService', () => {
  it('leaves a translated workspace exactly as it is', async () => {
    const { service, workspace } = await setup(buildTranslatedWorkspaceState());

    await service.syncWorkspace(WORKSPACE_ID);

    expect(workspace.getMigrationCalls()).toEqual([]);
    expect(
      workspace.fieldMetadataService.updateOneField,
    ).not.toHaveBeenCalled();
    expect(
      workspace.fieldMetadataService.createOneField,
    ).not.toHaveBeenCalled();
  });

  it('creates the audience field, one rule per gated role and the dashboard denials, then stays idempotent', async () => {
    const { service, workspace } = await setup({
      roles: [adminRole, memberRole, agentRole, suspendedRole, grantRole],
    });

    await service.syncWorkspace(WORKSPACE_ID);

    expect(workspace.fieldMetadataService.createOneField).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        createFieldInput: expect.objectContaining({
          name: 'audience',
          options: [
            expect.objectContaining({
              value: encodeDashboardAudienceRoleToken(agentRole.id),
              position: 0,
            }),
            expect.objectContaining({
              value: encodeDashboardAudienceRoleToken(memberRole.id),
              position: 1,
            }),
            expect.objectContaining({
              value: encodeDashboardAudienceRoleToken(suspendedRole.id),
              position: 2,
            }),
          ],
        }),
      }),
    );

    for (const gatedRole of [memberRole, agentRole]) {
      const { objectPermission, rules, livePredicates } = findDashboardRows(
        workspace.state,
        gatedRole,
      );

      expect(objectPermission).toMatchObject(DENY_ALL_OBJECT_PERMISSION_GRANTS);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        canCreateRecords: false,
        canReadRecords: true,
        canUpdateRecords: false,
        canSoftDeleteRecords: false,
        canDestroyRecords: false,
      });
      expect(livePredicates).toEqual([
        expect.objectContaining({
          fieldMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.audienceField,
          value: JSON.stringify([
            encodeDashboardAudienceRoleToken(gatedRole.id),
          ]),
          rowLevelPermissionRuleId: rules[0].id,
        }),
      ]);
    }

    for (const untouchedRole of [adminRole, suspendedRole, grantRole]) {
      expect(findDashboardRows(workspace.state, untouchedRole)).toEqual({
        objectPermission: undefined,
        rules: [],
        livePredicates: [],
      });
    }

    workspace.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration.mockClear();
    workspace.fieldMetadataService.updateOneField.mockClear();

    await service.syncWorkspace(WORKSPACE_ID);

    expect(workspace.getMigrationCalls()).toEqual([]);
    expect(
      workspace.fieldMetadataService.updateOneField,
    ).not.toHaveBeenCalled();
  });

  it("writes an application-owned role's dashboard object permission as that application", async () => {
    const { service, workspace } = await setup({
      ...buildTranslatedWorkspaceState(),
      objectPermissions: [],
    });

    await service.syncWorkspace(WORKSPACE_ID);

    const agentObjectPermissionCall = workspace
      .getMigrationCalls()
      .find(({ allFlatEntityOperationByMetadataName }) =>
        allFlatEntityOperationByMetadataName.objectPermission?.flatEntityToCreate.some(
          ({ roleUniversalIdentifier }) =>
            roleUniversalIdentifier === agentRole.universalIdentifier,
        ),
      );

    expect(agentObjectPermissionCall).toMatchObject({
      isSystemBuild: false,
      applicationUniversalIdentifier:
        DASHBOARD_AUDIENCE_TEST_IDS.brokerageApplicationUniversalIdentifier,
    });
    expect(
      findDashboardRows(workspace.state, agentRole).objectPermission,
    ).toMatchObject(DENY_ALL_OBJECT_PERMISSION_GRANTS);
  });

  it('removes an audience rule that grants nothing', async () => {
    const translatedState = buildTranslatedWorkspaceState();
    const suspendedRule = buildRuleMock({
      flatRole: suspendedRole,
      grants: {},
    });

    const { service, workspace } = await setup({
      ...translatedState,
      rules: [...(translatedState.rules ?? []), suspendedRule],
      predicates: [
        buildAudiencePredicateMock({ flatRole: memberRole, rule: memberRule }),
        buildAudiencePredicateMock({ flatRole: agentRole, rule: agentRule }),
        buildAudiencePredicateMock({
          flatRole: suspendedRole,
          rule: suspendedRule,
        }),
      ],
    });

    await service.syncWorkspace(WORKSPACE_ID);

    expect(findDashboardRows(workspace.state, suspendedRole)).toMatchObject({
      rules: [],
      livePredicates: [],
    });
    expect(workspace.state.rules).toEqual([memberRule, agentRule]);
  });

  it("never deletes or rewrites another object's permission rows", async () => {
    const reconciliationObject = getFlatObjectMetadataMock({
      id: 'reconciliation-object-id',
      universalIdentifier: 'reconciliation-object-universal-identifier',
      nameSingular: 'reconciliation',
      namePlural: 'reconciliations',
    });
    const reconciliationDenial = buildObjectPermissionMock({
      flatRole: memberRole,
      flatObjectMetadata: reconciliationObject,
      grants: DENY_ALL_OBJECT_PERMISSION_GRANTS,
    });
    const translatedState = buildTranslatedWorkspaceState();

    const { service, workspace } = await setup({
      ...translatedState,
      objectMetadatas: [
        DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
        reconciliationObject,
      ],
      objectPermissions: [
        reconciliationDenial,
        buildObjectPermissionMock({
          flatRole: memberRole,
          grants: { canReadObjectRecords: true },
          showInSidebar: true,
        }),
      ],
    });

    await service.syncWorkspace(WORKSPACE_ID);

    for (const {
      allFlatEntityOperationByMetadataName,
    } of workspace.getMigrationCalls()) {
      const objectPermissionOperations =
        allFlatEntityOperationByMetadataName.objectPermission;

      expect(objectPermissionOperations?.flatEntityToDelete ?? []).toEqual([]);
      expect(
        [
          ...(objectPermissionOperations?.flatEntityToCreate ?? []),
          ...(objectPermissionOperations?.flatEntityToUpdate ?? []),
        ].map(
          ({ objectMetadataUniversalIdentifier }) =>
            objectMetadataUniversalIdentifier,
        ),
      ).not.toContain(reconciliationObject.universalIdentifier);
    }

    expect(workspace.state.objectPermissions).toContainEqual(
      reconciliationDenial,
    );
    expect(
      findDashboardRows(workspace.state, memberRole).objectPermission,
    ).toMatchObject({
      ...DENY_ALL_OBJECT_PERMISSION_GRANTS,
      showInSidebar: true,
    });
  });

  it('denies a dashboard grant reopened by a role settings save and ignores other objects', async () => {
    const translatedState = buildTranslatedWorkspaceState();
    const { service, workspace } = await setup({
      ...translatedState,
      objectPermissions: [
        buildObjectPermissionMock({
          flatRole: memberRole,
          grants: { canReadObjectRecords: true, canUpdateObjectRecords: true },
        }),
      ],
    });

    await service.syncDashboardObjectPermissionChanges({
      workspaceId: WORKSPACE_ID,
      objectPermissions: [
        { roleId: memberRole.id, objectMetadataId: 'another-object-id' },
      ],
    });

    expect(workspace.getMigrationCalls()).toEqual([]);

    await service.syncDashboardObjectPermissionChanges({
      workspaceId: WORKSPACE_ID,
      objectPermissions: [
        {
          roleId: memberRole.id,
          objectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
        },
      ],
    });

    const { objectPermission, rules } = findDashboardRows(
      workspace.state,
      memberRole,
    );

    expect(objectPermission).toMatchObject(DENY_ALL_OBJECT_PERMISSION_GRANTS);
    expect(rules).toEqual([memberRule]);
  });

  it('writes a new audience predicate under the second id when the first is a soft-deleted row', async () => {
    const translatedState = buildTranslatedWorkspaceState();
    const reopenedSuspendedRole = {
      ...suspendedRole,
      canReadAllObjectRecords: true,
    };

    const { service, workspace } = await setup({
      ...translatedState,
      roles: [adminRole, memberRole, agentRole, reopenedSuspendedRole],
      objectPermissions: [],
    });

    await service.syncWorkspace(WORKSPACE_ID);

    const [, secondPredicateId] = getDashboardAudiencePredicateIds({
      roleId: suspendedRole.id,
      dashboardObjectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
    });

    expect(
      findDashboardRows(workspace.state, reopenedSuspendedRole).livePredicates,
    ).toEqual([expect.objectContaining({ id: secondPredicateId })]);
  });

  it('follows role renames and removals in the audience options, keeping option ids', async () => {
    const translatedState = buildTranslatedWorkspaceState();

    const { service, workspace } = await setup({
      ...translatedState,
      roles: [adminRole, { ...memberRole, label: 'Members' }, agentRole],
      objectPermissions: [],
      rules: [memberRule, agentRule],
    });

    await service.syncWorkspace(WORKSPACE_ID);

    expect(workspace.fieldMetadataService.updateOneField).toHaveBeenCalledWith({
      updateFieldInput: {
        id: DASHBOARD_AUDIENCE_TEST_IDS.audienceField,
        options: [
          expect.objectContaining({
            id: `option-${memberRole.id}`,
            label: 'Members',
            position: 0,
          }),
          expect.objectContaining({
            id: `option-${agentRole.id}`,
            label: 'Agent',
            position: 1,
          }),
        ],
      },
      workspaceId: WORKSPACE_ID,
    });
  });

  it('gives a role promoted to update all settings every dashboard back', async () => {
    const translatedState = buildTranslatedWorkspaceState();
    const promotedMemberRole = { ...memberRole, canUpdateAllSettings: true };

    const { service, workspace } = await setup({
      ...translatedState,
      roles: [adminRole, promotedMemberRole, agentRole, suspendedRole],
    });

    await service.syncWorkspace(WORKSPACE_ID);

    expect(findDashboardRows(workspace.state, memberRole)).toEqual({
      objectPermission: expect.objectContaining({
        canCreateObjectRecords: null,
        canReadObjectRecords: null,
        canUpdateObjectRecords: null,
        canSoftDeleteObjectRecords: null,
        canDestroyObjectRecords: null,
        showInSidebar: true,
      }),
      rules: [],
      livePredicates: [],
    });
    expect(
      workspace.state.fieldMetadatas[0].options?.map(({ value }) => value),
    ).toEqual([
      encodeDashboardAudienceRoleToken(agentRole.id),
      encodeDashboardAudienceRoleToken(suspendedRole.id),
    ]);
  });

  describe('a gated role whose dashboard grants still sit in its object permission', () => {
    const memberAudienceField = buildAudienceFieldMock([
      buildAudienceOptionMock({
        roleId: memberRole.id,
        label: 'Member',
        position: 0,
      }),
    ]);
    const memberReadObjectPermission = buildObjectPermissionMock({
      flatRole: memberRole,
      grants: { canReadObjectRecords: true },
      showInSidebar: true,
    });

    const setupMemberWorkspace = () =>
      setup({
        roles: [adminRole, memberRole],
        fieldMetadatas: [memberAudienceField],
        objectPermissions: [memberReadObjectPermission],
      });

    // Makes every write of one kind fail, as a lock timeout or a validation error would
    const failMigrationsWith = (
      workspace: Awaited<ReturnType<typeof setup>>['workspace'],
      metadataName: 'objectPermission' | 'rowLevelPermissionRule',
    ) => {
      const migrationMock =
        workspace.workspaceMigrationValidateBuildAndRunService
          .validateBuildAndRunWorkspaceMigration;
      const applyMigration = migrationMock.getMockImplementation();

      migrationMock.mockImplementation(async (call) => {
        if (
          isDefined(call.allFlatEntityOperationByMetadataName[metadataName])
        ) {
          throw new Error(`${metadataName} write failed`);
        }

        if (!isDefined(applyMigration)) {
          throw new Error('The workspace fake has no migration implementation');
        }

        return applyMigration(call);
      });

      return () => {
        if (isDefined(applyMigration)) {
          migrationMock.mockImplementation(applyMigration);
        }
      };
    };

    const expectMemberGatedWithReadOnly = (
      state: DashboardAudienceWorkspaceState,
    ) => {
      const { objectPermission, rules, livePredicates } = findDashboardRows(
        state,
        memberRole,
      );

      expect(objectPermission).toMatchObject({
        ...DENY_ALL_OBJECT_PERMISSION_GRANTS,
        showInSidebar: true,
      });
      expect(rules).toEqual([
        expect.objectContaining({
          canCreateRecords: false,
          canReadRecords: true,
          canUpdateRecords: false,
          canSoftDeleteRecords: false,
          canDestroyRecords: false,
        }),
      ]);
      expect(livePredicates).toEqual([
        expect.objectContaining({ rowLevelPermissionRuleId: rules[0].id }),
      ]);
    };

    it('leaves a predicate the scoped-permission translation has not linked yet untouched', async () => {
      const untranslatedPredicate = buildAudiencePredicateMock({
        flatRole: memberRole,
        rule: null,
      });
      const { service, workspace } = await setup({
        roles: [adminRole, memberRole],
        fieldMetadatas: [memberAudienceField],
        objectPermissions: [memberReadObjectPermission],
        predicates: [untranslatedPredicate],
      });

      await service.syncWorkspace(WORKSPACE_ID);

      expect(workspace.getMigrationCalls()).toEqual([]);
      expect(workspace.state.predicates).toEqual([untranslatedPredicate]);
      expect(workspace.state.objectPermissions).toEqual([
        memberReadObjectPermission,
      ]);
    });

    it('keeps the role grants when the denial fails after the rule write, and a retry completes the gate', async () => {
      const { service, workspace } = await setupMemberWorkspace();
      const restoreMigrations = failMigrationsWith(
        workspace,
        'objectPermission',
      );

      await expect(service.syncWorkspace(WORKSPACE_ID)).rejects.toThrow(
        memberRole.id,
      );

      expect(
        findDashboardRows(workspace.state, memberRole).objectPermission,
      ).toEqual(memberReadObjectPermission);

      restoreMigrations();
      await service.syncWorkspace(WORKSPACE_ID);

      expectMemberGatedWithReadOnly(workspace.state);
    });

    it('writes nothing when the rule write fails, and a retry gates the role with its original grants', async () => {
      const { service, workspace } = await setupMemberWorkspace();
      const restoreMigrations = failMigrationsWith(
        workspace,
        'rowLevelPermissionRule',
      );

      await expect(service.syncWorkspace(WORKSPACE_ID)).rejects.toThrow(
        memberRole.id,
      );

      expect(findDashboardRows(workspace.state, memberRole)).toEqual({
        objectPermission: memberReadObjectPermission,
        rules: [],
        livePredicates: [],
      });

      restoreMigrations();
      await service.syncWorkspace(WORKSPACE_ID);

      expectMemberGatedWithReadOnly(workspace.state);
    });
  });

  it('writes nothing on a dry run', async () => {
    const { service, workspace } = await setup({
      roles: [adminRole, memberRole, agentRole],
    });

    await service.syncWorkspace(WORKSPACE_ID, { dryRun: true });

    expect(
      workspace.fieldMetadataService.createOneField,
    ).not.toHaveBeenCalled();
    expect(workspace.getMigrationCalls()).toEqual([]);
  });

  it('leaves the workspace alone when row level permissions are unavailable', async () => {
    const { service, workspace } = await setup({
      roles: [adminRole, memberRole],
    });

    workspace.billingService.hasEntitlement.mockResolvedValue(false);

    await service.syncWorkspace(WORKSPACE_ID);

    expect(
      workspace.fieldMetadataService.createOneField,
    ).not.toHaveBeenCalled();
    expect(workspace.getMigrationCalls()).toEqual([]);
  });
});
