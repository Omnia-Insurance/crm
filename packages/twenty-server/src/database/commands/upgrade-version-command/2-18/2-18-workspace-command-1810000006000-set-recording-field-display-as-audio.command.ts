// OMNIA-CUSTOM: Durable replacement for the retired TypeORM migration
// 1771800000000-set-recording-field-display-as-audio (now parked in
// legacy-typeorm-migrations-do-not-add and no longer on the active path after
// the v2.19 upstream merge). Without it the Omnia call `recording` LINKS field
// keeps settings=null, so LinksDisplay renders a plain link instead of the
// inline AudioLink player (it only switches to AudioLink when
// settings.displayAs === 'audio'). Upstream now routes schema/data backfills to
// workspace upgrade-version commands rather than migrations, so this reapplies
// the same jsonb merge per workspace on upgrade.
import { InjectDataSource } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { DataSource } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@RegisteredWorkspaceCommand('2.18.0', 1810000006000)
@Command({
  name: 'upgrade:2-18:set-recording-field-display-as-audio',
  description:
    "OMNIA: set settings.displayAs='audio' on the call object's `recording` LINKS field so it renders the inline AudioLink player instead of a plain link. Idempotent jsonb merge, scoped per workspace; a no-op for workspaces without the call/recording field.",
})
export class SetRecordingFieldDisplayAsAudioCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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
    const isDryRun = options.dryRun ?? false;

    // Only this workspace's call `recording` field(s) that do not already opt
    // into the inline audio player. Empty for already-healthy workspaces, so the
    // update below never runs and the command stays idempotent.
    const fieldsNeedingUpdate: { id: string }[] =
      await this.coreDataSource.query(
        `SELECT fm."id"
       FROM "core"."fieldMetadata" fm
       JOIN "core"."objectMetadata" om ON om."id" = fm."objectMetadataId"
       WHERE fm."workspaceId" = $1
         AND om."workspaceId" = $1
         AND fm."name" = 'recording'
         AND om."nameSingular" = 'call'
         AND (fm."settings" IS NULL OR fm."settings"->>'displayAs' IS DISTINCT FROM 'audio')`,
        [workspaceId],
      );

    if (fieldsNeedingUpdate.length === 0) {
      this.logger.log(
        `Call 'recording' field already renders as inline audio for workspace ${workspaceId}`,
      );

      return;
    }

    this.logger.log(
      `${isDryRun ? '[DRY RUN] ' : ''}Setting settings.displayAs='audio' on ${fieldsNeedingUpdate.length} call 'recording' field(s) for workspace ${workspaceId}`,
    );

    if (isDryRun) {
      return;
    }

    // settings.displayAs is a UI-render flag stored directly on the
    // core.fieldMetadata jsonb column - no workspace-schema migration is needed.
    // COALESCE + jsonb merge preserves any other settings keys already present.
    await this.coreDataSource.query(
      `UPDATE "core"."fieldMetadata" fm
       SET "settings" = COALESCE(fm."settings", '{}'::jsonb) || '{"displayAs": "audio"}'::jsonb,
           "updatedAt" = now()
       FROM "core"."objectMetadata" om
       WHERE om."id" = fm."objectMetadataId"
         AND fm."workspaceId" = $1
         AND om."workspaceId" = $1
         AND fm."name" = 'recording'
         AND om."nameSingular" = 'call'
         AND (fm."settings" IS NULL OR fm."settings"->>'displayAs' IS DISTINCT FROM 'audio')`,
      [workspaceId],
    );

    // The raw write bypasses the metadata cache, so invalidate the flat field
    // maps the app reads field settings from (after the write). The change is
    // already persisted, so a cache hiccup must not fail the upgrade - a stale
    // cache self-heals on the next flush / version bump.
    try {
      await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
        'flatFieldMetadataMaps',
      ]);
    } catch (cacheError) {
      this.logger.warn(
        `Set call 'recording' displayAs for workspace ${workspaceId} but failed to invalidate the metadata cache: ${
          cacheError instanceof Error ? cacheError.message : String(cacheError)
        }`,
      );
    }

    this.logger.log(
      `Set settings.displayAs='audio' on the call 'recording' field for workspace ${workspaceId}`,
    );
  }
}
