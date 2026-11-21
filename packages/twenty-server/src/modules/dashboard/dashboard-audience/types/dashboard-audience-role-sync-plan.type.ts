import { type DashboardAudienceGrants } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-grants.type';
import { type DashboardAudienceObjectPermissionGrants } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-object-permission-grants.type';

// null leaves the role's dashboard object permission or audience rule as it is
export type DashboardAudienceRoleSyncPlan = {
  objectPermissionGrants: DashboardAudienceObjectPermissionGrants | null;
  audienceRuleGrants: DashboardAudienceGrants | null;
  shouldRemoveRowLevelPermissions: boolean;
};
