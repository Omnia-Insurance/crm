import { Module } from '@nestjs/common';

import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { UserWorkspaceSidebarVisibilityResolver } from 'src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver';

@Module({
  imports: [WorkspaceCacheModule],
  providers: [UserWorkspaceSidebarVisibilityResolver],
})
export class RoleObjectSettingsModule {}
