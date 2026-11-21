import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { isDefined } from 'twenty-shared/utils';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaReconciliationObjectLockdownCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command';
import {
  MEMBER_POLICY_HOP_PREDICATE_MOCK,
  MEMBER_POLICY_RULE_MOCK,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findMissingReconciliationLockdownViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-missing-reconciliation-lockdown-violations.util';
import { findRowLevelPermissionRuleWithoutGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-without-grant-violations.util';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import {
  buildLockdownFlatApplicationMock,
  buildLockdownFlatObjectPermissionMock,
  buildLockdownFlatPredicateMock,
  buildLockdownFlatRoleMock,
  buildLockdownFlatRuleMock,
  createLockdownServiceMock,
  createLockdownWorkspaceMock,
  LOCKDOWN_WORKSPACE_ID,
  type LockdownWorkspaceMock,
} from 'src/modules/reconciliation/listeners/__mocks__/reconciliation-object-lockdown-workspace.mock';
import { ReconciliationObjectLockdownService } from 'src/modules/reconciliation/services/object-lockdown.service';

const findObjectMetadataOrThrow = (nameSingular: string) => {
  const flatObjectMetadata = VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS.find(
    (objectMetadata) => objectMetadata.nameSingular === nameSingular,
  );

  if (!isDefined(flatObjectMetadata)) {
    throw new Error(`Missing ${nameSingular} fixture`);
  }

  return flatObjectMetadata;
};

const POLICY_OBJECT = findObjectMetadataOrThrow('policy');
const RECONCILIATION_OBJECT = findObjectMetadataOrThrow('reconciliation');
const REVIEW_ITEM_OBJECT = findObjectMetadataOrThrow('reviewItem');

const TWENTY_STANDARD_APPLICATION = buildLockdownFlatApplicationMock({
  id: '20202020-0000-4000-8000-0000000001a1',
  universalIdentifier: '20202020-0000-4000-8000-0000000001a1',
  name: 'Twenty Standard',
  defaultRoleId: VERIFY_PERMISSIONS_IDS.adminRole,
});
const WORKSPACE_CUSTOM_APPLICATION = buildLockdownFlatApplicationMock({
  id: '20202020-0000-4000-8000-0000000001a2',
  universalIdentifier: '20202020-0000-4000-8000-0000000001a2',
  name: 'Workspace custom',
});
const COMPLIANCE_QA_APPLICATION = buildLockdownFlatApplicationMock({
  id: '20202020-0000-4000-8000-0000000001a3',
  universalIdentifier: '20202020-0000-4000-8000-0000000001a3',
  name: 'Compliance QA',
  defaultRoleId: '20202020-0000-4000-8000-0000000001b4',
});

const ADMIN_ROLE = buildLockdownFlatRoleMock({
  id: VERIFY_PERMISSIONS_IDS.adminRole,
  universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
  label: 'Admin',
  isEditable: false,
  flatApplication: TWENTY_STANDARD_APPLICATION,
});
const MEMBER_ROLE = buildLockdownFlatRoleMock({
  id: VERIFY_PERMISSIONS_IDS.memberRole,
  universalIdentifier: '20202020-0000-4000-8000-0000000001c2',
  label: 'Member',
  flatApplication: WORKSPACE_CUSTOM_APPLICATION,
});
const AGENT_ROLE = buildLockdownFlatRoleMock({
  id: VERIFY_PERMISSIONS_IDS.agentRole,
  universalIdentifier: '20202020-0000-4000-8000-0000000001c3',
  label: 'Agent',
  flatApplication: WORKSPACE_CUSTOM_APPLICATION,
});
const COMPLIANCE_QA_ROLE = buildLockdownFlatRoleMock({
  id: '20202020-0000-4000-8000-0000000001b4',
  universalIdentifier: '20202020-0000-4000-8000-0000000001c4',
  label: 'Compliance QA default function role',
  isEditable: false,
  canBeAssignedToApplications: true,
  flatApplication: COMPLIANCE_QA_APPLICATION,
});
const COMPLIANCE_QA_GRANT_ROLE = buildLockdownFlatRoleMock({
  id: '20202020-0000-4000-8000-0000000001b5',
  universalIdentifier: '20202020-0000-4000-8000-0000000001c5',
  label: 'Compliance QA role',
  isEditable: false,
  canBeAssignedToApplications: true,
  flatApplication: WORKSPACE_CUSTOM_APPLICATION,
});
const TWENTY_STANDARD_GRANT_ROLE = buildLockdownFlatRoleMock({
  id: '20202020-0000-4000-8000-0000000001b6',
  universalIdentifier: '20202020-0000-4000-8000-0000000001c6',
  label: 'Twenty Standard role',
  isEditable: false,
  canBeAssignedToApplications: true,
  flatApplication: WORKSPACE_CUSTOM_APPLICATION,
});

const MEMBER_POLICY_RULE = buildLockdownFlatRuleMock({
  flatRole: MEMBER_ROLE,
  flatObjectMetadata: POLICY_OBJECT,
  id: MEMBER_POLICY_RULE_MOCK.id,
  universalIdentifier: MEMBER_POLICY_RULE_MOCK.id,
  canCreateRecords: MEMBER_POLICY_RULE_MOCK.canCreateRecords,
  canUpdateRecords: MEMBER_POLICY_RULE_MOCK.canUpdateRecords,
});
// A scope-blind translation can leave a rule granting nothing on a reconciliation object
const AGENT_RECONCILIATION_RULE = buildLockdownFlatRuleMock({
  flatRole: AGENT_ROLE,
  flatObjectMetadata: RECONCILIATION_OBJECT,
});
const AGENT_REVIEW_ITEM_RULE = buildLockdownFlatRuleMock({
  flatRole: AGENT_ROLE,
  flatObjectMetadata: REVIEW_ITEM_OBJECT,
  canReadRecords: true,
});

// Post-W1 prod shape: Member reads every policy and writes its own; the lockdown predates the app and grant roles
const buildProdShapedWorkspace = (): LockdownWorkspaceMock =>
  createLockdownWorkspaceMock({
    applications: [
      TWENTY_STANDARD_APPLICATION,
      WORKSPACE_CUSTOM_APPLICATION,
      COMPLIANCE_QA_APPLICATION,
    ],
    roles: [
      ADMIN_ROLE,
      MEMBER_ROLE,
      AGENT_ROLE,
      COMPLIANCE_QA_ROLE,
      COMPLIANCE_QA_GRANT_ROLE,
      TWENTY_STANDARD_GRANT_ROLE,
    ],
    grantRoleIdByApplicationId: {
      [TWENTY_STANDARD_APPLICATION.id]: TWENTY_STANDARD_GRANT_ROLE.id,
      [COMPLIANCE_QA_APPLICATION.id]: COMPLIANCE_QA_GRANT_ROLE.id,
    },
    objectMetadatas: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATAS,
    objectPermissions: [
      buildLockdownFlatObjectPermissionMock({
        flatRole: MEMBER_ROLE,
        flatObjectMetadata: POLICY_OBJECT,
        canCreateObjectRecords: false,
        canReadObjectRecords: true,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      }),
      buildLockdownFlatObjectPermissionMock({
        flatRole: MEMBER_ROLE,
        flatObjectMetadata: RECONCILIATION_OBJECT,
        canCreateObjectRecords: false,
        canReadObjectRecords: false,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        showInSidebar: false,
      }),
    ],
    fieldPermissions: [],
    rules: [
      MEMBER_POLICY_RULE,
      AGENT_RECONCILIATION_RULE,
      AGENT_REVIEW_ITEM_RULE,
    ],
    predicates: [
      buildLockdownFlatPredicateMock({
        flatRole: MEMBER_ROLE,
        flatObjectMetadata: POLICY_OBJECT,
        id: MEMBER_POLICY_HOP_PREDICATE_MOCK.id,
        universalIdentifier: MEMBER_POLICY_HOP_PREDICATE_MOCK.id,
        fieldMetadataId: MEMBER_POLICY_HOP_PREDICATE_MOCK.fieldMetadataId,
        relationFieldMetadataId:
          MEMBER_POLICY_HOP_PREDICATE_MOCK.relationFieldMetadataId,
        workspaceMemberFieldMetadataId:
          MEMBER_POLICY_HOP_PREDICATE_MOCK.workspaceMemberFieldMetadataId,
        rowLevelPermissionRuleId: MEMBER_POLICY_RULE.id,
      }),
      buildLockdownFlatPredicateMock({
        flatRole: AGENT_ROLE,
        flatObjectMetadata: REVIEW_ITEM_OBJECT,
        rowLevelPermissionRuleId: AGENT_REVIEW_ITEM_RULE.id,
      }),
    ],
    predicateGroups: [],
  });

// W9 checks 7 and 2, read the way the upgrade's verify step reads them
const findW9Violations = (workspace: LockdownWorkspaceMock) => [
  ...findMissingReconciliationLockdownViolations({
    roles: workspace.state.roles,
    objectMetadatas: workspace.state.objectMetadatas,
    objectPermissions: workspace.state.objectPermissions,
    rolesPermissions: workspace.computeRolesPermissions(),
  }),
  ...findRowLevelPermissionRuleWithoutGrantViolations({
    rules: workspace.state.rules,
  }),
];

const setup = async () => {
  const workspace = buildProdShapedWorkspace();
  const { service, dependencies } = createLockdownServiceMock(workspace);

  const module = await Test.createTestingModule({
    providers: [
      OmniaReconciliationObjectLockdownCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      { provide: ReconciliationObjectLockdownService, useValue: service },
    ],
  }).compile();

  const command = module.get(OmniaReconciliationObjectLockdownCommand);

  const run = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: LOCKDOWN_WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  return {
    workspace,
    run,
    validateBuildAndRunWorkspaceMigration: jest.spyOn(
      dependencies.workspaceMigrationValidateBuildAndRunService,
      'validateBuildAndRunWorkspaceMigration',
    ),
    upsertGrantRole: jest.spyOn(
      dependencies.applicationGrantRoleService,
      'upsertGrantRole',
    ),
    invalidateAndRecompute: jest.spyOn(
      dependencies.workspaceCacheService,
      'invalidateAndRecompute',
    ),
  };
};

describe('OmniaReconciliationObjectLockdownCommand', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should leave a prod-shaped workspace passing the W9 reconciliation lockdown and rule grant checks', async () => {
    const { workspace, run, invalidateAndRecompute } = await setup();

    expect(findW9Violations(workspace)).not.toEqual([]);

    await run();

    expect(findW9Violations(workspace)).toEqual([]);
    expect(workspace.state.rules).toEqual([MEMBER_POLICY_RULE]);
    expect(
      workspace.computeRolesPermissions()[ADMIN_ROLE.id]?.objects[
        RECONCILIATION_OBJECT.id
      ]?.canReadAllRecords,
    ).toBe(true);
    expect(invalidateAndRecompute).toHaveBeenCalledWith(LOCKDOWN_WORKSPACE_ID, [
      'rolesPermissions',
    ]);
  });

  it('should lock the app grant role through a re-sync and the twenty-standard grant role in place', async () => {
    const { workspace, run, upsertGrantRole } = await setup();

    await run();

    expect(upsertGrantRole).toHaveBeenCalledTimes(1);
    expect(upsertGrantRole).toHaveBeenCalledWith({
      workspaceId: LOCKDOWN_WORKSPACE_ID,
      applicationId: COMPLIANCE_QA_APPLICATION.id,
    });
    expect(
      workspace.state.objectPermissions.filter(
        ({ roleId }) => roleId === TWENTY_STANDARD_GRANT_ROLE.id,
      ),
    ).toHaveLength(2);
  });

  it('should log the locked role ids and counts, and no record values', async () => {
    const { run } = await setup();

    await run();

    const [message] = logSpy.mock.calls[logSpy.mock.calls.length - 1] ?? [];

    expect(message).toContain(`Workspace ${LOCKDOWN_WORKSPACE_ID}`);
    expect(message).toContain(AGENT_ROLE.id);
    expect(message).not.toContain(AGENT_ROLE.label);
  });

  it('should write nothing on a dry run', async () => {
    const { workspace, run, validateBuildAndRunWorkspaceMigration } =
      await setup();
    const objectPermissionsBefore = structuredClone(
      workspace.state.objectPermissions,
    );

    await run(true);

    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    expect(workspace.state.objectPermissions).toEqual(objectPermissionsBefore);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
  });

  it('should be a no-op once the workspace is locked', async () => {
    const { run, validateBuildAndRunWorkspaceMigration, upsertGrantRole } =
      await setup();

    await run();

    validateBuildAndRunWorkspaceMigration.mockClear();
    upsertGrantRole.mockClear();
    logSpy.mockClear();

    await run();

    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    expect(upsertGrantRole).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
