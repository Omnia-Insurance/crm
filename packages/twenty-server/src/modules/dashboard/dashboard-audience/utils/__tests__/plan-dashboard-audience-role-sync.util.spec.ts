import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type FlatRowLevelPermissionRule } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-rule.type';
import {
  buildAudiencePredicateMock,
  buildFlatRoleMock,
  buildObjectPermissionMock,
  buildRuleMock,
  DASHBOARD_AUDIENCE_TEST_IDS,
  DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
  DENY_ALL_OBJECT_PERMISSION_GRANTS,
} from 'src/modules/dashboard/dashboard-audience/__mocks__/dashboard-audience-workspace.mock';
import { DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-denied-object-permission-grants.constant';
import { DASHBOARD_AUDIENCE_INHERITED_OBJECT_PERMISSION_GRANTS } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-inherited-object-permission-grants.constant';
import { type DashboardAudienceRoleRows } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-rows.type';
import { getDashboardAudiencePredicateIds } from 'src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-predicate-ids.util';
import { planDashboardAudienceRoleSync } from 'src/modules/dashboard/dashboard-audience/utils/plan-dashboard-audience-role-sync.util';

const NO_RULE_GRANTS = {
  canCreateRecords: false,
  canReadRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
};
const READ_GRANTS = { ...NO_RULE_GRANTS, canReadRecords: true };

const memberRole = buildFlatRoleMock({
  id: DASHBOARD_AUDIENCE_TEST_IDS.memberRole,
  label: 'Member',
});

const plan = ({
  flatRole = memberRole,
  isGated = true,
  roleRows,
  dashboardFlatObjectMetadata = DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
}: {
  flatRole?: FlatRole;
  isGated?: boolean;
  roleRows: Partial<DashboardAudienceRoleRows>;
  dashboardFlatObjectMetadata?: typeof DASHBOARD_FLAT_OBJECT_METADATA_MOCK;
}) =>
  planDashboardAudienceRoleSync({
    flatRole,
    isGated,
    dashboardFlatObjectMetadata,
    audienceFieldMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.audienceField,
    audiencePredicateIds: getDashboardAudiencePredicateIds({
      roleId: flatRole.id,
      dashboardObjectMetadataId: DASHBOARD_AUDIENCE_TEST_IDS.dashboardObject,
    }),
    roleRows: {
      objectPermission: undefined,
      rules: [],
      predicates: [],
      predicateGroups: [],
      ...roleRows,
    },
  });

const buildAudienceRuleRows = ({
  flatRole = memberRole,
  grants,
}: {
  flatRole?: FlatRole;
  grants: Partial<FlatRowLevelPermissionRule>;
}): Partial<DashboardAudienceRoleRows> => {
  const rule = buildRuleMock({ flatRole, grants });

  return {
    rules: [rule],
    predicates: [buildAudiencePredicateMock({ flatRole, rule })],
    objectPermission: buildObjectPermissionMock({
      flatRole,
      grants: DENY_ALL_OBJECT_PERMISSION_GRANTS,
    }),
  };
};

describe('planDashboardAudienceRoleSync', () => {
  it('changes nothing once the audience rule and the object denial are in place', () => {
    expect(
      plan({ roleRows: buildAudienceRuleRows({ grants: READ_GRANTS }) }),
    ).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: false,
    });
  });

  it('moves the dashboard object grants into a new audience rule and denies them at object level', () => {
    expect(plan({ roleRows: {} })).toEqual({
      objectPermissionGrants:
        DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS,
      audienceRuleGrants: READ_GRANTS,
      shouldRemoveRowLevelPermissions: false,
    });
  });

  it('keeps the grants of the existing audience rule although the object permission denies everything', () => {
    const roleRows = buildAudienceRuleRows({
      grants: { canReadRecords: true, canUpdateRecords: true },
    });

    expect(
      plan({
        roleRows: {
          ...roleRows,
          predicates: [
            buildAudiencePredicateMock({
              flatRole: memberRole,
              rule: roleRows.rules?.[0] ?? null,
              value: JSON.stringify(['ROLE_SOMEONE_ELSE']),
            }),
          ],
        },
      }),
    ).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: {
        canCreateRecords: true,
        canReadRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: false,
        canDestroyRecords: false,
      },
      shouldRemoveRowLevelPermissions: false,
    });
  });

  it('denies a dashboard grant reopened at object level while keeping the rule grants', () => {
    expect(
      plan({
        roleRows: {
          ...buildAudienceRuleRows({ grants: READ_GRANTS }),
          objectPermission: buildObjectPermissionMock({
            flatRole: memberRole,
            grants: { canReadObjectRecords: true },
            showInSidebar: true,
          }),
        },
      }),
    ).toEqual({
      objectPermissionGrants:
        DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: false,
    });
  });

  it('writes nothing for a role without dashboard access and without rules', () => {
    expect(
      plan({
        flatRole: buildFlatRoleMock({
          id: DASHBOARD_AUDIENCE_TEST_IDS.suspendedRole,
          label: 'Suspended',
          canReadAllObjectRecords: false,
        }),
        roleRows: {},
      }),
    ).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: false,
    });
  });

  it('removes an audience rule that grants nothing instead of rewriting it', () => {
    expect(
      plan({
        roleRows: buildAudienceRuleRows({
          grants: NO_RULE_GRANTS,
        }),
      }),
    ).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: true,
    });
  });

  it('denies the object grants when a rule granting nothing sits next to an open object permission', () => {
    expect(
      plan({
        roleRows: {
          ...buildAudienceRuleRows({ grants: NO_RULE_GRANTS }),
          objectPermission: buildObjectPermissionMock({
            flatRole: memberRole,
            grants: { canReadObjectRecords: true },
          }),
        },
      }),
    ).toEqual({
      objectPermissionGrants:
        DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: true,
    });
  });

  it('writes no rule when the only grant is an action disabled on dashboards', () => {
    expect(
      plan({
        flatRole: buildFlatRoleMock({
          id: DASHBOARD_AUDIENCE_TEST_IDS.memberRole,
          label: 'Member',
          canReadAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: true,
        }),
        dashboardFlatObjectMetadata: {
          ...DASHBOARD_FLAT_OBJECT_METADATA_MOCK,
          disabledObjectPermissionActions: ['canSoftDeleteObjectRecords'],
        },
        roleRows: {},
      }).audienceRuleGrants,
    ).toBeNull();
  });

  it('lets a role that now updates all settings inherit its role-wide grants on every dashboard', () => {
    expect(
      plan({
        isGated: false,
        roleRows: buildAudienceRuleRows({ grants: READ_GRANTS }),
      }),
    ).toEqual({
      objectPermissionGrants:
        DASHBOARD_AUDIENCE_INHERITED_OBJECT_PERMISSION_GRANTS,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: true,
    });
  });

  it('leaves admin-like roles without an audience rule alone', () => {
    expect(plan({ isGated: false, roleRows: {} })).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: false,
    });
  });

  it('leaves a pre-2.58 audience predicate to the scoped-permission translation', () => {
    const untranslatedRoleRows: Partial<DashboardAudienceRoleRows> = {
      predicates: [
        buildAudiencePredicateMock({ flatRole: memberRole, rule: null }),
      ],
      objectPermission: buildObjectPermissionMock({
        flatRole: memberRole,
        grants: { canReadObjectRecords: true },
      }),
    };

    expect(plan({ roleRows: untranslatedRoleRows })).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: false,
    });
    expect(plan({ isGated: false, roleRows: untranslatedRoleRows })).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: false,
    });
  });

  it('never touches a role that is not editable', () => {
    expect(
      plan({
        flatRole: buildFlatRoleMock({
          id: DASHBOARD_AUDIENCE_TEST_IDS.grantRole,
          label: 'Brokerage',
          isEditable: false,
        }),
        isGated: false,
        roleRows: buildAudienceRuleRows({ grants: READ_GRANTS }),
      }),
    ).toEqual({
      objectPermissionGrants: null,
      audienceRuleGrants: null,
      shouldRemoveRowLevelPermissions: false,
    });
  });
});
