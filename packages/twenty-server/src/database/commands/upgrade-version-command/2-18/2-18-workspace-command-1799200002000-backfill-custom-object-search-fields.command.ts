import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { buildOmniaCustomObjectSearchFieldMetadataBackfillOperations } from 'src/database/commands/upgrade-version-command/2-18/utils/build-omnia-custom-object-search-field-metadata-backfill-operations.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

@RegisteredWorkspaceCommand('2.18.0', 1799200002000)
@Command({
  name: 'upgrade:2-18:backfill-custom-object-search-fields',
  description:
    'OMNIA: backfill searchFieldMetadata rows so every existing custom searchable object indexes ALL its active searchable fields (not just the label-identifier field upstream seeds). The migration runner rebuilds each affected searchVector column from the resulting rows. Idempotent: existing (object, field) rows are skipped.',
})
export class BackfillCustomObjectSearchFieldsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun ?? false;

    const {
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatSearchFieldMetadataMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatSearchFieldMetadataMaps',
    ]);

    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const {
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
    } = buildOmniaCustomObjectSearchFieldMetadataBackfillOperations({
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatSearchFieldMetadataMaps,
      customApplicationId: workspaceCustomFlatApplication.id,
    });

    const applicationUniversalIdentifiers = Object.keys(
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
    );

    const totalRowsToCreate = applicationUniversalIdentifiers.reduce(
      (total, applicationUniversalIdentifier) =>
        total +
        (flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier[
          applicationUniversalIdentifier
        ]?.length ?? 0),
      0,
    );

    if (totalRowsToCreate === 0) {
      this.logger.log(
        `No missing custom-object searchFieldMetadata rows for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    this.logger.log(
      `${isDryRun ? '[DRY RUN] ' : ''}Found ${totalRowsToCreate} missing custom-object searchFieldMetadata row(s) for workspace ${workspaceId} across ${applicationUniversalIdentifiers.length} application(s)`,
    );

    if (isDryRun) {
      return;
    }

    // One migration per application: the runner assigns applicationId from the single
    // application passed here, keeping custom-object rows tied to the custom application.
    for (const applicationUniversalIdentifier of applicationUniversalIdentifiers) {
      const flatSearchFieldMetadataToCreate =
        flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier[
          applicationUniversalIdentifier
        ];

      if (
        !isDefined(flatSearchFieldMetadataToCreate) ||
        flatSearchFieldMetadataToCreate.length === 0
      ) {
        continue;
      }

      const validateAndBuildResult =
        await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
          {
            isSystemBuild: true,
            allFlatEntityOperationByMetadataName: {
              searchFieldMetadata: {
                flatEntityToCreate: flatSearchFieldMetadataToCreate,
                flatEntityToDelete: [],
                flatEntityToUpdate: [],
              },
            },
            workspaceId,
            applicationUniversalIdentifier,
          },
        );

      if (validateAndBuildResult.status === 'fail') {
        this.logger.error(
          `Failed to persist custom-object searchFieldMetadata rows for application ${applicationUniversalIdentifier}:\n${JSON.stringify(
            validateAndBuildResult,
            null,
            2,
          )}`,
        );

        throw new Error(
          `Failed to persist custom-object searchFieldMetadata rows for workspace ${workspaceId}`,
        );
      }
    }

    this.logger.log(
      `Successfully backfilled ${totalRowsToCreate} custom-object searchFieldMetadata row(s) for workspace ${workspaceId}`,
    );
  }
}
