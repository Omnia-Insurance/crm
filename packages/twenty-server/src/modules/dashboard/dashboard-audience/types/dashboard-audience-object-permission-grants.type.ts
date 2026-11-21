import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';

// null inherits the role-wide default
export type DashboardAudienceObjectPermissionGrants = Record<
  keyof Pick<
    FlatObjectPermission,
    | 'canCreateObjectRecords'
    | 'canReadObjectRecords'
    | 'canUpdateObjectRecords'
    | 'canSoftDeleteObjectRecords'
    | 'canDestroyObjectRecords'
  >,
  boolean | null
>;
