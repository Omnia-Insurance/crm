import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-instance-command-fast-1794500000000-omnia-add-user-workspace-id-to-import-job';
import { OmniaTranslateScopedRowLevelPermissionsCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command';
import { OmniaBackfillCustomObjectSearchFieldsCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command';
import { OmniaSetRecordingFieldDisplayAsAudioCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command';
import { OmniaConsolidateStandardDeleteCommandMenuItemsCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500003000-omnia-consolidate-standard-delete-command-menu-items.command';
import { OmniaMigrateOneToManyViewFiltersCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500004000-omnia-migrate-one-to-many-view-filters.command';
import { OmniaSyncDashboardAudienceCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command';
import { OmniaReconciliationObjectLockdownCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command';
import { OmniaPurgeLegacyExportFilesCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command';
import { OmniaRestoreStandardObjectPermissionLockdownCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500008000-omnia-restore-standard-object-permission-lockdown.command';
import { OmniaVerifyPermissionsUpgradeCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500009000-omnia-verify-permissions.command';
import { OmniaPrioritizeInitialObjectViewsCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1795231988000-omnia-prioritize-initial-object-views.command';
import { OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand } from 'src/database/commands/upgrade-version-command/omnia/2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up';
import { OmniaPermissionsVerificationService } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { DashboardAudienceModule } from 'src/modules/dashboard/dashboard-audience/dashboard-audience.module';
import { ReconciliationObjectLockdownModule } from 'src/modules/reconciliation/reconciliation-object-lockdown.module';

@Module({
  imports: [
    ApplicationModule,
    DashboardAudienceModule,
    ReconciliationObjectLockdownModule,
    WorkspaceCacheModule,
    WorkspaceIteratorModule,
    WorkspaceMigrationModule,
  ],
  providers: [
    OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand,
    OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand,
    OmniaTranslateScopedRowLevelPermissionsCommand,
    OmniaBackfillCustomObjectSearchFieldsCommand,
    OmniaSetRecordingFieldDisplayAsAudioCommand,
    OmniaConsolidateStandardDeleteCommandMenuItemsCommand,
    OmniaMigrateOneToManyViewFiltersCommand,
    OmniaSyncDashboardAudienceCommand,
    OmniaReconciliationObjectLockdownCommand,
    OmniaPurgeLegacyExportFilesCommand,
    OmniaRestoreStandardObjectPermissionLockdownCommand,
    OmniaVerifyPermissionsUpgradeCommand,
    OmniaPrioritizeInitialObjectViewsCommand,
    OmniaPermissionsVerificationService,
  ],
})
export class OmniaUpgradeVersionCommandModule {}
