import { type RoleManifest } from 'twenty-shared/application';

import { type UniversalFlatRole } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/universal-flat-role.type';

export const fromRoleManifestToUniversalFlatRole = ({
  roleManifest,
  applicationUniversalIdentifier,
  now,
}: {
  roleManifest: RoleManifest;
  applicationUniversalIdentifier: string;
  now: string;
}): UniversalFlatRole => {
  return {
    universalIdentifier: roleManifest.universalIdentifier,
    applicationUniversalIdentifier,
    label: roleManifest.label,
    description: roleManifest.description ?? null,
    icon: roleManifest.icon ?? null,
    canUpdateAllSettings: roleManifest.canUpdateAllSettings ?? false,
    canAccessAllTools: roleManifest.canAccessAllTools ?? false,
    canAccessAllAgentChatChannels:
      roleManifest.canAccessAllAgentChatChannels ?? false,
    canReadAllObjectRecords: roleManifest.canReadAllObjectRecords ?? false,
    canCreateAllObjectRecords: roleManifest.canUpdateAllObjectRecords ?? false,
    canUpdateAllObjectRecords: roleManifest.canUpdateAllObjectRecords ?? false,
    canSoftDeleteAllObjectRecords:
      roleManifest.canSoftDeleteAllObjectRecords ?? false,
    canDestroyAllObjectRecords:
      roleManifest.canDestroyAllObjectRecords ?? false,
    // OMNIA-CUSTOM: role-wide sidebar default and policy edit window (C3, C4)
    showAllObjectsInSidebar: roleManifest.showAllObjectsInSidebar ?? true,
    editWindowMinutes: roleManifest.editWindowMinutes ?? null,
    isEditable: true,
    canBeAssignedToUsers: roleManifest.canBeAssignedToUsers ?? true,
    canBeAssignedToAgents: roleManifest.canBeAssignedToAgents ?? true,
    canBeAssignedToApiKeys: roleManifest.canBeAssignedToApiKeys ?? true,
    canBeAssignedToApplications: false,
    roleTargetUniversalIdentifiers: [],
    objectPermissionUniversalIdentifiers: [],
    fieldPermissionUniversalIdentifiers: [],
    rowLevelPermissionRuleUniversalIdentifiers: [],
    rolePermissionFlagUniversalIdentifiers: [],
    rowLevelPermissionPredicateUniversalIdentifiers: [],
    agentChatChannelRoleUniversalIdentifiers: [],
    rowLevelPermissionPredicateGroupUniversalIdentifiers: [],
    createdAt: now,
    updatedAt: now,
  };
};
