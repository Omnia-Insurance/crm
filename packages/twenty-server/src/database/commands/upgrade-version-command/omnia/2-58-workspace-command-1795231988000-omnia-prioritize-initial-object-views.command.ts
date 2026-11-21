import { InjectDataSource } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { computeOmniaInitialObjectViewPositionUpdates } from 'src/database/commands/upgrade-version-command/omnia/utils/compute-omnia-initial-object-view-position-updates.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// v2.58 opens the first non-INDEX view, and 2.41 seeds "All <records>" at position 1,
// behind views like DNT or Today, so users would stop landing on all records.
@RegisteredWorkspaceCommand('2.58.0', 1795231988000)
@Command({
  name: 'upgrade:2-58:omnia-prioritize-initial-object-views',
  description:
    'Move each object\'s seeded "All <records>" view ahead of its other views so users keep landing on all records',
})
export class OmniaPrioritizeInitialObjectViewsCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly applicationService: ApplicationService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { flatObjectMetadataMaps, flatViewMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatViewMaps',
      ]);

    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const positionUpdates = computeOmniaInitialObjectViewPositionUpdates({
      flatObjectMetadatas: Object.values(
        flatObjectMetadataMaps.byUniversalIdentifier,
      ).filter(isDefined),
      flatViewsByUniversalIdentifier: flatViewMaps.byUniversalIdentifier,
      initialViewApplicationUniversalIdentifier:
        workspaceCustomFlatApplication.universalIdentifier,
    });

    if (!isNonEmptyArray(positionUpdates)) {
      return;
    }

    this.logger.log(
      `${options.dryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}: moving the "All <records>" view first on ${positionUpdates.length} object(s) (${positionUpdates.map(({ objectNameSingular }) => objectNameSingular).join(', ')})`,
    );

    if (options.dryRun) {
      return;
    }

    for (const { viewId, position } of positionUpdates) {
      await this.coreDataSource.query(
        `UPDATE "core"."view"
         SET "position" = $3,
             "updatedAt" = now()
         WHERE "workspaceId" = $1
           AND "id" = $2`,
        [workspaceId, viewId, position],
      );
    }

    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'flatViewMaps',
    ]);
  }
}
