import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import type { ApplicationService } from 'src/engine/core-modules/application/application.service';
import type { RecordPositionService } from 'src/engine/core-modules/record-position/services/record-position.service';
import type { PageLayoutTabService } from 'src/engine/metadata-modules/page-layout-tab/services/page-layout-tab.service';
import type { PageLayoutWidgetService } from 'src/engine/metadata-modules/page-layout-widget/services/page-layout-widget.service';
import type { PageLayoutService } from 'src/engine/metadata-modules/page-layout/services/page-layout.service';
import type { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import type { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
// OMNIA-CUSTOM: dashboard audience token for gated creators
import type { DashboardAudienceCreatorService } from 'src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service';

export type DashboardToolDependencies = {
  pageLayoutService: PageLayoutService;
  pageLayoutTabService: PageLayoutTabService;
  pageLayoutWidgetService: PageLayoutWidgetService;
  flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService;
  workspaceOrmManager: WorkspaceOrmManager;
  recordPositionService: RecordPositionService;
  applicationService: ApplicationService;
  // OMNIA-CUSTOM: tags a gated creator's dashboard with its audience token
  dashboardAudienceCreatorService: DashboardAudienceCreatorService;
};

export type DashboardToolContext = {
  workspaceId: string;
};

export type DashboardToolContextWithPermissions = DashboardToolContext & {
  authContext: WorkspaceAuthContext;
};
