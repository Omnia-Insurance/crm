import { type OmniaObjectPermission } from '@/settings/roles/types/OmniaRoleExtensions';

export type ObjectPermissions = {
  [K in keyof Omit<
    OmniaObjectPermission,
    'objectMetadataId' | '__typename' | 'editWindowMinutes' | 'showInSidebar' | 'restrictedFields' | 'rowLevelPermissionPredicates' | 'rowLevelPermissionPredicateGroups'
  >]-?: boolean;
};
