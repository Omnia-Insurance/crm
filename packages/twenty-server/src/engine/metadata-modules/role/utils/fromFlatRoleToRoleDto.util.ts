import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type RoleDTO } from 'src/engine/metadata-modules/role/dtos/role.dto';

export const fromFlatRoleToRoleDto = ({
  canAccessAllAgentChatChannels,
  canAccessAllTools,
  canBeAssignedToAgents,
  canBeAssignedToApiKeys,
  canBeAssignedToUsers,
  canDestroyAllObjectRecords,
  canReadAllObjectRecords,
  canSoftDeleteAllObjectRecords,
  canUpdateAllObjectRecords,
  canUpdateAllSettings,
  // OMNIA-CUSTOM: role-wide sidebar default and policy edit window (C3, C4)
  showAllObjectsInSidebar,
  editWindowMinutes,
  id,
  isEditable,
  label,
  description,
  icon,
  universalIdentifier,
  applicationId,
}: FlatRole): RoleDTO => {
  return {
    canAccessAllAgentChatChannels,
    canAccessAllTools,
    canBeAssignedToAgents,
    canBeAssignedToApiKeys,
    canBeAssignedToUsers,
    canDestroyAllObjectRecords,
    canReadAllObjectRecords,
    canSoftDeleteAllObjectRecords,
    canUpdateAllObjectRecords,
    canUpdateAllSettings,
    // OMNIA-CUSTOM: getRoles/getRole build every Role DTO here; without the
    // window the settings save sends null and clears it.
    showAllObjectsInSidebar,
    editWindowMinutes,
    id,
    isEditable,
    label,
    description: description ?? undefined,
    icon: icon ?? undefined,
    universalIdentifier,
    applicationId,
  };
};
