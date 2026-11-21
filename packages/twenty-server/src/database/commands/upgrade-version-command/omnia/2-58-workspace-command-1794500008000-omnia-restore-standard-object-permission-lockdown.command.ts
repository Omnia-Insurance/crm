import { InjectDataSource } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { computeOmniaMissingStandardObjectDisabledActions } from 'src/database/commands/upgrade-version-command/omnia/utils/compute-omnia-missing-standard-object-disabled-actions.util';
import { getStandardObjectDisabledPermissionActionsByUniversalIdentifier } from 'src/database/commands/upgrade-version-command/omnia/utils/get-standard-object-disabled-permission-actions-by-universal-identifier.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// Standard objects synced after 2.53 (recordShare, shortLink, ...) arrive without the lockdown a fresh
// install gives them, so every role could write them, including record shares on private AI threads.
// Runs before W9, which fails the upgrade on any remaining drift.
@RegisteredWorkspaceCommand('2.58.0', 1794500008000)
@Command({
  name: 'upgrade:2-58:omnia-restore-standard-object-permission-lockdown',
  description:
    'Give standard objects the disabled record actions a fresh v2.58 workspace has, adding actions only',
})
export class OmniaRestoreStandardObjectPermissionLockdownCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
      ]);

    const objectsMissingActions =
      computeOmniaMissingStandardObjectDisabledActions({
        objectMetadatas: Object.values(
          flatObjectMetadataMaps.byUniversalIdentifier,
        ).filter(isDefined),
        expectedDisabledActionsByUniversalIdentifier:
          getStandardObjectDisabledPermissionActionsByUniversalIdentifier(),
      });

    if (!isNonEmptyArray(objectsMissingActions)) {
      return;
    }

    this.logger.log(
      `${options.dryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}: restoring the standard lockdown on ${objectsMissingActions.length} object(s) (${objectsMissingActions.map(({ nameSingular, missingActions }) => `${nameSingular}: ${missingActions.join(', ')}`).join('; ')})`,
    );

    if (options.dryRun) {
      return;
    }

    for (const { objectMetadataId, missingActions } of objectsMissingActions) {
      await this.coreDataSource.query(
        `UPDATE "core"."objectMetadata"
         SET "disabledObjectPermissionActions" = (
               SELECT jsonb_agg(DISTINCT "action" ORDER BY "action")
               FROM jsonb_array_elements_text(
                 COALESCE("disabledObjectPermissionActions", '[]'::jsonb) || $3::jsonb
               ) AS "action"
             ),
             "updatedAt" = now()
         WHERE "workspaceId" = $1
           AND "id" = $2`,
        [workspaceId, objectMetadataId, JSON.stringify(missingActions)],
      );
    }

    // rolesPermissions is derived from the object maps but cached on its own
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      getMetadataFlatEntityMapsKey('objectMetadata'),
      'rolesPermissions',
    ]);
  }
}
