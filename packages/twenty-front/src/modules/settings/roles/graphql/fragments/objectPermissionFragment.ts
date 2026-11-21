import { gql } from '@apollo/client';

export const OBJECT_PERMISSION_FRAGMENT = gql`
  fragment ObjectPermissionFragment on ObjectPermission {
    objectMetadataId
    canReadObjectRecords
    canUpdateObjectRecords
    canSoftDeleteObjectRecords
    canDestroyObjectRecords
    unreadableFields
    uneditableFields
    # OMNIA-CUSTOM: sidebar visibility and edit window per object (contracts C3/C4)
    showInSidebar
    editWindowMinutes
  }
`;
