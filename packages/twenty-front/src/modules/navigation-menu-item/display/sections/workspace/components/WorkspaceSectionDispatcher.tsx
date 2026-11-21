import { OmniaMemberWorkspaceNavigationMenuItems } from '@/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems';
import { WorkspaceSection } from '@/navigation-menu-item/display/sections/workspace/components/WorkspaceSection';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const WorkspaceSectionDispatcher = () => {
  // OMNIA-CUSTOM: users without LAYOUTS get their role's object list (showInSidebar), not the curated tree.
  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);

  if (!hasLayoutsPermission) {
    return <OmniaMemberWorkspaceNavigationMenuItems />;
  }

  return <WorkspaceSection />;
};
