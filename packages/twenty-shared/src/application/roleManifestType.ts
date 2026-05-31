import { type PermissionFlagType } from '@/constants';
import { type SyncableEntityOptions } from '@/application/syncableEntityOptionsType';

export type ObjectPermissionManifest = SyncableEntityOptions & {
  objectUniversalIdentifier: string;
  canReadObjectRecords?: boolean;
  canUpdateObjectRecords?: boolean;
  canSoftDeleteObjectRecords?: boolean;
  canDestroyObjectRecords?: boolean;
  showInSidebar?: boolean;
  editWindowMinutes?: number | null;
};

export type FieldPermissionManifest = SyncableEntityOptions & {
  objectUniversalIdentifier: string;
  fieldUniversalIdentifier: string;
  canReadFieldValue?: boolean;
  canUpdateFieldValue?: boolean;
};

export type PermissionFlagManifest = SyncableEntityOptions & {
  flag: PermissionFlagType;
};

export type RoleManifest = SyncableEntityOptions & {
  label: string;
  description?: string;
  icon?: string;
  canUpdateAllSettings?: boolean;
  canAccessAllTools?: boolean;
  canReadAllObjectRecords?: boolean;
  canUpdateAllObjectRecords?: boolean;
  canSoftDeleteAllObjectRecords?: boolean;
  canDestroyAllObjectRecords?: boolean;
  showAllObjectsInSidebar?: boolean;
  canBeAssignedToUsers?: boolean;
  canBeAssignedToAgents?: boolean;
  canBeAssignedToApiKeys?: boolean;
  objectPermissions?: ObjectPermissionManifest[];
  fieldPermissions?: FieldPermissionManifest[];
  permissionFlags?: PermissionFlagManifest[];
};
