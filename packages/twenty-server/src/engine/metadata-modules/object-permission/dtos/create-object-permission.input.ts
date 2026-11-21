export type CreateObjectPermissionInput = {
  roleId: string;
  objectMetadataId: string;
  canReadObjectRecords?: boolean;
  canUpdateObjectRecords?: boolean;
  canSoftDeleteObjectRecords?: boolean;
  canDestroyObjectRecords?: boolean;
  // OMNIA-CUSTOM: per-object sidebar visibility and policy edit window (C3, C4)
  showInSidebar?: boolean | null;
  editWindowMinutes?: number | null;
};
