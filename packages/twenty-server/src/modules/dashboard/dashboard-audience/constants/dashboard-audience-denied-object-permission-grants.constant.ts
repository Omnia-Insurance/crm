import { type DashboardAudienceObjectPermissionGrants } from 'src/modules/dashboard/dashboard-audience/types/dashboard-audience-object-permission-grants.type';

// Contract C1 step 2: an object-level grant would open every dashboard past the audience rule
export const DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS: DashboardAudienceObjectPermissionGrants =
  {
    canCreateObjectRecords: false,
    canReadObjectRecords: false,
    canUpdateObjectRecords: false,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
  };
