import { type WorkspaceMember } from '~/generated-metadata/graphql';
import { type OmniaRole } from '@/settings/roles/types/OmniaRoleExtensions';

export type PartialWorkspaceMember = Omit<
  WorkspaceMember,
  | 'colorScheme'
  | 'locale'
  | 'timeZone'
  | 'dateFormat'
  | 'timeFormat'
  | 'calendarStartDay'
  | 'createdAt'
  | 'updatedAt'
>;

export type RoleWithPartialMembers = Omit<OmniaRole, 'workspaceMembers'> & {
  workspaceMembers: PartialWorkspaceMember[];
};
