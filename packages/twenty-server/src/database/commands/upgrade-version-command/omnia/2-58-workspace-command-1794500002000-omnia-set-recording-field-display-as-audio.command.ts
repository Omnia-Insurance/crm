import { InjectDataSource } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { DataSource } from 'typeorm';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { withDerivedFieldMetadataMaps } from 'src/engine/metadata-modules/flat-entity/utils/with-derived-field-metadata-maps.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// LinksDisplay renders the inline AudioLink player only when the field's
// settings carry displayAs 'audio'.
@RegisteredWorkspaceCommand('2.58.0', 1794500002000)
@Command({
  name: 'upgrade:2-58:omnia-set-recording-field-display-as-audio',
  description:
    'Render the call recording links field as the inline audio player',
})
export class OmniaSetRecordingFieldDisplayAsAudioCommand extends ProvisionedWorkspaceCommandRunner {
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
    const recordingFieldsToUpdate = await this.coreDataSource.query<
      { id: string }[]
    >(
      `SELECT "fieldMetadata"."id"
       FROM "core"."fieldMetadata" "fieldMetadata"
       JOIN "core"."objectMetadata" "objectMetadata"
         ON "objectMetadata"."id" = "fieldMetadata"."objectMetadataId"
       WHERE "fieldMetadata"."workspaceId" = $1
         AND "objectMetadata"."workspaceId" = $1
         AND "objectMetadata"."nameSingular" = 'call'
         AND "fieldMetadata"."name" = 'recording'
         AND ("fieldMetadata"."settings" IS NULL
           OR "fieldMetadata"."settings"->>'displayAs' IS DISTINCT FROM 'audio')`,
      [workspaceId],
    );

    if (!isNonEmptyArray(recordingFieldsToUpdate)) {
      return;
    }

    const recordingFieldIds = recordingFieldsToUpdate.map(({ id }) => id);

    this.logger.log(
      `${options.dryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}: setting displayAs to audio on ${recordingFieldIds.length} call recording field(s) (${recordingFieldIds.join(', ')})`,
    );

    if (options.dryRun) {
      return;
    }

    await this.coreDataSource.query(
      `UPDATE "core"."fieldMetadata"
       SET "settings" = COALESCE("settings", '{}'::jsonb) || '{"displayAs": "audio"}'::jsonb,
           "updatedAt" = now()
       WHERE "workspaceId" = $1
         AND "id" = ANY($2::uuid[])`,
      [workspaceId, recordingFieldIds],
    );

    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      withDerivedFieldMetadataMaps(['flatFieldMetadataMaps']),
    );
  }
}
