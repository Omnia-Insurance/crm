import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { ApplicationExceptionFilter } from 'src/engine/core-modules/application/application-exception-filter';
import { ApplicationUpgradeService } from 'src/engine/core-modules/application/application-upgrade/application-upgrade.service';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@MetadataResolver()
@UseFilters(ApplicationExceptionFilter)
@UseGuards(UserAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
export class ApplicationUpgradeResolver {
  constructor(
    private readonly applicationUpgradeService: ApplicationUpgradeService,
  ) {}

  @Mutation(() => Boolean)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.MARKETPLACE_APPS))
  async upgradeApplication(
    @Args('appRegistrationId') appRegistrationId: string,
    @Args('targetVersion') targetVersion: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser() user: AuthContextUser,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<boolean> {
    return this.applicationUpgradeService.upgradeApplication({
      appRegistrationId,
      targetVersion,
      workspaceId: workspace.id,
      userId: user.id,
      userWorkspaceId,
    });
  }
}
