import { gql } from '@apollo/client';

export const ROLE_FRAGMENT = gql`
  fragment RoleFragment on Role {
    id
    label
    description
    icon
    canUpdateAllSettings
    canAccessAllTools
    canAccessAllAgentChatChannels
    isEditable
    canReadAllObjectRecords
    canUpdateAllObjectRecords
    canSoftDeleteAllObjectRecords
    canDestroyAllObjectRecords
    # OMNIA-CUSTOM: role-wide edit window default (contract C3)
    editWindowMinutes
    canBeAssignedToUsers
    canBeAssignedToAgents
    canBeAssignedToApiKeys
    applicationId
    universalIdentifier
    # OMNIA-CUSTOM: role-wide sidebar default (contract C4)
    showAllObjectsInSidebar
  }
`;
