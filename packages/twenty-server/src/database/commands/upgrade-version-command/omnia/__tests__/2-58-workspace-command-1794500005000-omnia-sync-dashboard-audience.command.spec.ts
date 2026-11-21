import { Test } from '@nestjs/testing';

import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import {
  FeatureFlagKey,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaSyncDashboardAudienceCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command';
import {
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/brokerage-agent-role-universal-identifier.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { findMissingReconciliationLockdownViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-missing-reconciliation-lockdown-violations.util';
import { findPhiAllRecordsGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-phi-all-records-grant-violations.util';
import { findPolicyAgentOwnershipViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util';
import { findRecordAccessFeatureFlagViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-record-access-feature-flag-violations.util';
import { findRowLevelPermissionRuleMatchingEveryRecordViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-matching-every-record-violations.util';
import { findRowLevelPermissionRuleWithoutGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-without-grant-violations.util';
import { findRowLevelPermissionTreeIntegrityViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-tree-integrity-violations.util';
import { findUnlinkedRowLevelPermissionViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-unlinked-row-level-permission-violations.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { BillingService } from 'src/engine/core-modules/billing/services/billing.service';
import { EnterprisePlanService } from 'src/engine/core-modules/enterprise/services/enterprise-plan.service';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { RowLevelPermissionPredicateService } from 'src/engine/metadata-modules/row-level-permission-predicate/services/row-level-permission-predicate.service';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import {
  buildAudienceFieldMock,
  buildAudienceOptionMock,
  buildAudiencePredicateMock,
  buildFlatEntityMaps,
  buildFlatRoleMock,
  buildObjectPermissionMock,
  buildRuleMock,
  computeRolesPermissionsMock,
  createDashboardAudienceWorkspaceFake,
  DASHBOARD_AUDIENCE_TEST_IDS,
  DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
  DENY_ALL_OBJECT_PERMISSION_GRANTS,
  type DashboardAudienceWorkspaceState,
  type MigrationCallMock,
} from 'src/modules/dashboard/dashboard-audience/__mocks__/dashboard-audience-workspace.mock';
import { DashboardAudienceRoleSyncService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service';

const WORKSPACE_ID = DASHBOARD_AUDIENCE_TEST_IDS.workspace;

const findObjectMetadata = (nameSingular: string): FlatObjectMetadata => {
  const objectMetadata = VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS.find(
    (candidate) => candidate.nameSingular === nameSingular,
  );

  if (!isDefined(objectMetadata)) {
    throw new Error(`Missing ${nameSingular} fixture`);
  }

  return objectMetadata;
};

const policyObject = findObjectMetadata('policy');
const reconciliationObjects = [
  findObjectMetadata('reconciliation'),
  findObjectMetadata('reviewItem'),
];

const adminRole = buildFlatRoleMock({
  id: VERIFY_PERMISSIONS_IDS.adminRole,
  universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
  label: 'Admin',
  isEditable: false,
  canUpdateAllSettings: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: true,
});
const memberRole = buildFlatRoleMock({
  id: VERIFY_PERMISSIONS_IDS.memberRole,
  universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Member',
});
const agentRole = buildFlatRoleMock({
  id: VERIFY_PERMISSIONS_IDS.agentRole,
  universalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
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
// Created in Settings after the translation, so it has no audience rule yet
const coachRole = buildFlatRoleMock({
  id: '00000000-0000-4000-8000-0000000000c0',
  label: 'Coach',
});
// The grant role 2-57 copies from an application's default role
const grantRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.grantRole,
  label: 'Compliance',
  isEditable: false,
  canReadAllObjectRecords: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApplications: true,
});

const ALL_ROLES = [
  adminRole,
  memberRole,
  agentRole,
  suspendedRole,
  coachRole,
  grantRole,
];

// Contract C1 "read all, write own" on policy, as the translation writes it
const buildPolicyRows = (flatRole: FlatRole) => {
  const rule = buildRuleMock({
    flatRole,
    flatObjectMetadata: policyObject,
    grants: { canCreateRecords: true, canUpdateRecords: true },
  });
  const hopPredicate: FlatRowLevelPermissionPredicate = {
    ...buildAudiencePredicateMock({ flatRole, rule }),
    id: `${flatRole.id}-policy-hop-predicate-id`,
    universalIdentifier: `${flatRole.id}-policy-hop-predicate-id`,
    objectMetadataId: policyObject.id,
    objectMetadataUniversalIdentifier: policyObject.universalIdentifier,
    relationFieldMetadataId: VERIFY_PERMISSIONS_IDS.policyAgentField,
    fieldMetadataId: VERIFY_PERMISSIONS_IDS.agentProfileWorkspaceMemberField,
    workspaceMemberFieldMetadataId: VERIFY_PERMISSIONS_IDS.workspaceMemberIdField,
    operand: RowLevelPermissionPredicateOperand.IS,
    value: null,
  };

  return {
    rule,
    hopPredicate,
    objectPermission: buildObjectPermissionMock({
      flatRole,
      flatObjectMetadata: policyObject,
      grants: {
        ...DENY_ALL_OBJECT_PERMISSION_GRANTS,
        canReadObjectRecords: true,
      },
    }),
  };
};

const memberPolicyRows = buildPolicyRows(memberRole);
const agentPolicyRows = buildPolicyRows(agentRole);

const memberAudienceRule = buildRuleMock({
  flatRole: memberRole,
  grants: { canReadRecords: true },
});
const agentAudienceRule = buildRuleMock({
  flatRole: agentRole,
  grants: { canReadRecords: true },
});
// A role-only translation leftover: a rule that grants nothing fails the verification
const suspendedAudienceRule = buildRuleMock({
  flatRole: suspendedRole,
  grants: {},
});

const buildProdShapedWorkspaceState = (): Partial<DashboardAudienceWorkspaceState> => ({
  roles: ALL_ROLES,
  objectMetadatas: [
    ...VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
    DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
  ],
  fieldMetadatas: [
    ...VERIFY_PERMISSIONS_FLAT_FIELD_METADATAS,
    buildAudienceFieldMock(
      [memberRole, agentRole, suspendedRole].map((flatRole, position) =>
        buildAudienceOptionMock({
          roleId: flatRole.id,
          label: flatRole.label,
          position,
        }),
      ),
    ),
  ],
  objectPermissions: [
    // A role settings save reopened Member's dashboards at object level
    buildObjectPermissionMock({
      flatRole: memberRole,
      grants: { canReadObjectRecords: true },
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
    memberPolicyRows.objectPermission,
    agentPolicyRows.objectPermission,
    ...ALL_ROLES.filter(({ id }) => id !== adminRole.id).flatMap((flatRole) =>
      reconciliationObjects.map((flatObjectMetadata) =>
        buildObjectPermissionMock({
          flatRole,
          flatObjectMetadata,
          grants: DENY_ALL_OBJECT_PERMISSION_GRANTS,
        }),
      ),
    ),
  ],
  rules: [
    memberAudienceRule,
    agentAudienceRule,
    suspendedAudienceRule,
    memberPolicyRows.rule,
    agentPolicyRows.rule,
  ],
  predicates: [
    buildAudiencePredicateMock({ flatRole: memberRole, rule: memberAudienceRule }),
    buildAudiencePredicateMock({ flatRole: agentRole, rule: agentAudienceRule }),
    buildAudiencePredicateMock({
      flatRole: suspendedRole,
      rule: suspendedAudienceRule,
    }),
    memberPolicyRows.hopPredicate,
    agentPolicyRows.hopPredicate,
  ],
  featureFlagsMap: {
    [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
  },
});

// The checks of the permission verification that runs after this command
const findVerificationViolations = (
  state: DashboardAudienceWorkspaceState,
): OmniaPermissionsViolation[] => {
  const predicates = state.predicates.filter(
    ({ deletedAt }) => !isDefined(deletedAt),
  );
  const predicateGroups = state.predicateGroups.filter(
    ({ deletedAt }) => !isDefined(deletedAt),
  );
  const flatFieldMetadataMaps = buildFlatEntityMaps(state.fieldMetadatas);
  const flatObjectMetadataMaps = buildFlatEntityMaps(state.objectMetadatas);
  const rolesPermissions = computeRolesPermissionsMock(state);

  return [
    ...findUnlinkedRowLevelPermissionViolations({
      predicates,
      predicateGroups,
      rules: state.rules,
    }),
    ...findRowLevelPermissionRuleWithoutGrantViolations({ rules: state.rules }),
    ...findRowLevelPermissionRuleMatchingEveryRecordViolations({
      rules: state.rules,
      predicates,
      predicateGroups,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
    }),
    ...findRowLevelPermissionTreeIntegrityViolations({
      predicates,
      predicateGroups: state.predicateGroups,
    }),
    ...findPhiAllRecordsGrantViolations({
      objectMetadatas: state.objectMetadatas,
      rules: state.rules,
      rolesPermissions,
      featureFlagsMap: state.featureFlagsMap,
    }),
    ...findPolicyAgentOwnershipViolations({
      roles: state.roles,
      objectMetadatas: state.objectMetadatas,
      rules: state.rules,
      predicates,
      predicateGroups,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
      rolesPermissions,
      featureFlagsMap: state.featureFlagsMap,
    }),
    ...findMissingReconciliationLockdownViolations({
      roles: state.roles,
      objectMetadatas: state.objectMetadatas,
      objectPermissions: state.objectPermissions,
      rolesPermissions,
    }),
    ...findRecordAccessFeatureFlagViolations({
      featureFlagsMap: state.featureFlagsMap,
      predicates,
    }),
  ];
};

const setup = async () => {
  const workspace = createDashboardAudienceWorkspaceFake(
    buildProdShapedWorkspaceState(),
  );

  const module = await Test.createTestingModule({
    providers: [
      OmniaSyncDashboardAudienceCommand,
      DashboardAudienceRoleSyncService,
      RowLevelPermissionPredicateService,
      { provide: WorkspaceIteratorService, useValue: {} },
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
      { provide: FieldMetadataService, useValue: workspace.fieldMetadataService },
      { provide: ApplicationService, useValue: workspace.applicationService },
      { provide: BillingService, useValue: workspace.billingService },
      {
        provide: EnterprisePlanService,
        useValue: workspace.enterprisePlanService,
      },
    ],
  }).compile();

  const command = module.get(OmniaSyncDashboardAudienceCommand);

  const run = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  return { run, workspace };
};

describe('OmniaSyncDashboardAudienceCommand', () => {
  it('leaves a prod-shaped workspace passing every permission verification check', async () => {
    const { run, workspace } = await setup();

    expect(
      findVerificationViolations(workspace.state).map(({ check }) => check),
    ).toEqual(['rule-grants']);

    await run();

    expect(findVerificationViolations(workspace.state)).toEqual([]);

    const dashboardRules = workspace.state.rules.filter(
      ({ objectMetadataId }) =>
        objectMetadataId === DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
    );

    expect(
      dashboardRules.map(({ roleId, canReadRecords }) => ({
        roleId,
        canReadRecords,
      })),
    ).toEqual(
      expect.arrayContaining([
        { roleId: memberRole.id, canReadRecords: true },
        { roleId: agentRole.id, canReadRecords: true },
        { roleId: coachRole.id, canReadRecords: true },
      ]),
    );
    expect(dashboardRules).toHaveLength(3);
    expect(
      workspace.state.objectPermissions.filter(
        ({ objectMetadataId, roleId }) =>
          objectMetadataId === DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject &&
          [memberRole.id, agentRole.id, coachRole.id].includes(roleId),
      ),
    ).toEqual([
      expect.objectContaining({
        ...DENY_ALL_OBJECT_PERMISSION_GRANTS,
        roleId: memberRole.id,
        showInSidebar: true,
      }),
      expect.objectContaining({
        ...DENY_ALL_OBJECT_PERMISSION_GRANTS,
        roleId: agentRole.id,
      }),
      expect.objectContaining({
        ...DENY_ALL_OBJECT_PERMISSION_GRANTS,
        roleId: coachRole.id,
      }),
    ]);
  });

  it("gives a role created in Settings its original grants when a re-run follows a failed rule write", async () => {
    const { run, workspace } = await setup();
    const migrationMock =
      workspace.workspaceMigrationValidateBuildAndRunService
        .validateBuildAndRunWorkspaceMigration;
    const applyMigration = migrationMock.getMockImplementation();
    const isCoachRuleWrite = ({
      allFlatEntityOperationByMetadataName,
    }: MigrationCallMock) =>
      (
        allFlatEntityOperationByMetadataName.rowLevelPermissionRule
          ?.flatEntityToCreate ?? []
      ).some(
        ({ roleUniversalIdentifier }) =>
          roleUniversalIdentifier === coachRole.universalIdentifier,
      );
    const findCoachDashboardRows = () => ({
      objectPermissions: workspace.state.objectPermissions.filter(
        ({ objectMetadataId, roleId }) =>
          objectMetadataId === DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject &&
          roleId === coachRole.id,
      ),
      rules: workspace.state.rules.filter(
        ({ objectMetadataId, roleId }) =>
          objectMetadataId === DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject &&
          roleId === coachRole.id,
      ),
    });

    if (!isDefined(applyMigration)) {
      throw new Error('The workspace fake has no migration implementation');
    }

    migrationMock.mockImplementation(async (call) => {
      if (isCoachRuleWrite(call)) {
        throw new Error('lock timeout');
      }

      return applyMigration(call);
    });

    await expect(run()).rejects.toThrow(coachRole.id);
    expect(findCoachDashboardRows()).toEqual({
      objectPermissions: [],
      rules: [],
    });

    migrationMock.mockImplementation(applyMigration);
    await run();

    expect(findVerificationViolations(workspace.state)).toEqual([]);
    expect(findCoachDashboardRows()).toEqual({
      objectPermissions: [
        expect.objectContaining(DENY_ALL_OBJECT_PERMISSION_GRANTS),
      ],
      rules: [expect.objectContaining({ canReadRecords: true })],
    });
  });

  it('is a no-op on a second run', async () => {
    const { run, workspace } = await setup();

    await run();

    workspace.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration.mockClear();
    workspace.fieldMetadataService.updateOneField.mockClear();

    await run();

    expect(workspace.getMigrationCalls()).toEqual([]);
    expect(workspace.fieldMetadataService.updateOneField).not.toHaveBeenCalled();
  });

  it('reads fresh caches and writes nothing on a dry run', async () => {
    const { run, workspace } = await setup();
    const stateBeforeRun = structuredClone(workspace.state);

    await run(true);

    expect(
      workspace.workspaceCacheService.invalidateAndRecompute,
    ).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining([
        'flatObjectPermissionMaps',
        'flatRowLevelPermissionRuleMaps',
        'rolesPermissions',
      ]),
    );
    expect(workspace.getMigrationCalls()).toEqual([]);
    expect(workspace.fieldMetadataService.updateOneField).not.toHaveBeenCalled();
    expect(workspace.state).toEqual(stateBeforeRun);
  });
});
