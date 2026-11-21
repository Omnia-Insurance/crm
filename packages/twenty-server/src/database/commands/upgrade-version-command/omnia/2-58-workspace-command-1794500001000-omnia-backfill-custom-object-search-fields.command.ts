import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { buildOmniaCustomObjectSearchFieldMetadataBackfillOperations } from 'src/database/commands/upgrade-version-command/omnia/utils/build-omnia-custom-object-search-field-metadata-backfill-operations.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

@RegisteredWorkspaceCommand('2.58.0', 1794500001000)
@Command({
  name: 'upgrade:2-58:omnia-backfill-custom-object-search-fields',
  description:
    'OMNIA (one-time, runs inside upgrade): give every active, searchable-type, non-system field of the workspace custom application objects a searchFieldMetadata row, restoring the search surface (policy numbers, application ids) that 2.18 shrank to the name field. Fields that any role cannot read stay out of search. The migration runner rebuilds each affected searchVector. Running it again later re-adds fields that admins removed from search, so only run it by hand to recover a skipped upgrade, with --dry-run first.',
})
export class OmniaBackfillCustomObjectSearchFieldsCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun ?? false;

    // Earlier upgrade commands can leave these maps stale; a stale id re-emits an existing
    // row and trips IDX_SEARCH_FIELD_METADATA_FIELD_OBJECT_UNIQUE (see upstream 2-16).
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatSearchFieldMetadataMaps',
      'flatFieldPermissionMaps',
    ]);

    const {
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatSearchFieldMetadataMaps,
      flatFieldPermissionMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatSearchFieldMetadataMaps',
      'flatFieldPermissionMaps',
    ]);

    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const {
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
      readRestrictedFieldCount,
    } = buildOmniaCustomObjectSearchFieldMetadataBackfillOperations({
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatSearchFieldMetadataMaps,
      flatFieldPermissionMaps,
      customApplicationId: workspaceCustomFlatApplication.id,
    });

    if (readRestrictedFieldCount > 0) {
      this.logger.log(
        `Workspace ${workspaceId}: left ${readRestrictedFieldCount} custom-object field(s) out of search because some role cannot read them`,
      );
    }

    const flatSearchFieldMetadatasToCreate = Object.values(
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
    ).flat();

    if (flatSearchFieldMetadatasToCreate.length === 0) {
      this.logger.log(
        `No missing custom-object searchFieldMetadata rows for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    const objectCount = new Set(
      flatSearchFieldMetadatasToCreate.map(
        ({ objectMetadataUniversalIdentifier }) =>
          objectMetadataUniversalIdentifier,
      ),
    ).size;

    this.logger.log(
      `${isDryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}: creating ${flatSearchFieldMetadatasToCreate.length} custom-object searchFieldMetadata row(s) on ${objectCount} object(s)`,
    );

    if (isDryRun) {
      return;
    }

    // One migration per application: the runner assigns applicationId from the single
    // application passed here, keeping the rows tied to the custom application.
    for (const [
      applicationUniversalIdentifier,
      flatSearchFieldMetadatasToCreateForApplication,
    ] of Object.entries(
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
    )) {
      const result =
        await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunLegacyWorkspaceMigration(
          {
            shouldDeferActions: false,
            isSystemBuild: true,
            workspaceId,
            applicationUniversalIdentifier,
            allFlatEntityOperationByMetadataName: {
              searchFieldMetadata: {
                flatEntityToCreate:
                  flatSearchFieldMetadatasToCreateForApplication,
                flatEntityToDelete: [],
                flatEntityToUpdate: [],
              },
            },
          },
        );

      if (result.status === 'fail') {
        throw new WorkspaceMigrationBuilderException(result);
      }
    }

    this.logger.log(
      `Workspace ${workspaceId}: created ${flatSearchFieldMetadatasToCreate.length} custom-object searchFieldMetadata row(s)`,
    );
  }
}
