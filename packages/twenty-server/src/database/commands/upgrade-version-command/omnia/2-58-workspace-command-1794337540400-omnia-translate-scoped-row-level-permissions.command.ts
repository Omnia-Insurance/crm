import { Command, Option } from 'nest-commander';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import {
  ProvisionedWorkspaceCommandRunner,
  type ProvisionedWorkspaceCommandOptions,
} from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { type ScopedRowLevelPermissionTranslationPlan } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type';
import { type ScopedRowLevelPermissionTranslationSource } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type';
import { applyScopedRowLevelPermissionTranslationPlan } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/apply-scoped-row-level-permission-translation-plan.util';
import { formatScopedRowLevelPermissionTranslationReport } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/format-scoped-row-level-permission-translation-report.util';
import { loadScopedRowLevelPermissionTranslationSource } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/load-scoped-row-level-permission-translation-source.util';
import { planScopedRowLevelPermissionTranslation } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { withDerivedFieldMetadataMaps } from 'src/engine/metadata-modules/flat-entity/utils/with-derived-field-metadata-maps.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

type OmniaTranslateScopedRowLevelPermissionsCommandOptions =
  ProvisionedWorkspaceCommandOptions & {
    mergeMixedScopesFailClosed?: boolean;
  };

const hasPlannedWrites = (plan: ScopedRowLevelPermissionTranslationPlan) =>
  plan.rowLevelPermissionRulesToInsert.length > 0 ||
  plan.rootPredicateGroupsToInsert.length > 0 ||
  plan.predicateUpdates.length > 0 ||
  plan.predicateGroupUpdates.length > 0 ||
  plan.fieldPermissionRuleLinks.length > 0 ||
  plan.objectPermissionGrantsUpserts.length > 0 ||
  plan.predicateIdsToSoftDelete.length > 0 ||
  plan.predicateGroupIdsToSoftDelete.length > 0 ||
  plan.shouldEnableRelationHop;

// Sorts before upstream's scope-blind backfill (1794337540466), which then finds these rules by the
// identifiers it derives itself, so it neither re-creates them nor zeroes the grants kept here
@RegisteredWorkspaceCommand('2.58.0', 1794337540400)
@Command({
  name: 'upgrade:2-58:omnia-translate-scoped-row-level-permissions',
  description:
    'Translate Omnia scoped row level permissions (ALL, READ, WRITE) into one rule per role and object, and turn linked-record "Me" predicates into relation hops',
})
export class OmniaTranslateScopedRowLevelPermissionsCommand extends ProvisionedWorkspaceCommandRunner<OmniaTranslateScopedRowLevelPermissionsCommandOptions> {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  // The upgrade runner forwards only its own options, so this applies only when the command runs alone
  @Option({
    flags: '--merge-mixed-scopes-fail-closed',
    description:
      'Merge a role and object that mixes scopes into one AND rule granting its previous access, instead of aborting',
    required: false,
  })
  parseMergeMixedScopesFailClosed(): boolean {
    return true;
  }

  override async runOnWorkspace({
    workspaceId,
    options,
    dataSource,
  }: RunOnWorkspaceArgs<OmniaTranslateScopedRowLevelPermissionsCommandOptions>): Promise<void> {
    if (!isDefined(dataSource)) {
      return;
    }

    const logPrefix = `${options.dryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}:`;
    const source = await loadScopedRowLevelPermissionTranslationSource({
      dataSource,
      workspaceId,
    });

    if (!isDefined(source)) {
      this.logger.log(`${logPrefix} no scope column, nothing to translate`);

      return;
    }

    const hasLiveRows =
      source.predicates.length > 0 ||
      source.predicateGroups.some(({ isDeleted }) => !isDeleted);
    const plan = hasLiveRows
      ? await this.planTranslation({ workspaceId, source, options, logPrefix })
      : undefined;

    if (options.dryRun) {
      return;
    }

    if (isDefined(plan) && hasPlannedWrites(plan)) {
      await dataSource.transaction(async (entityManager) =>
        applyScopedRowLevelPermissionTranslationPlan({
          entityManager,
          workspaceId,
          plan,
        }),
      );
    }

    // Also when nothing is planned: a retried run may follow one that committed but failed to refresh these,
    // and upstream's backfill would then re-insert the rules it cannot see
    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      withDerivedFieldMetadataMaps([
        'flatRowLevelPermissionPredicateMaps',
        'flatRowLevelPermissionPredicateGroupMaps',
        'flatRowLevelPermissionRuleMaps',
        'flatObjectPermissionMaps',
        'flatFieldPermissionMaps',
        'flatRoleMaps',
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
        'rolesPermissions',
        'featureFlagsMap',
      ]),
    );
  }

  private async planTranslation({
    workspaceId,
    source,
    options,
    logPrefix,
  }: {
    workspaceId: string;
    source: ScopedRowLevelPermissionTranslationSource;
    options: OmniaTranslateScopedRowLevelPermissionsCommandOptions;
    logPrefix: string;
  }): Promise<ScopedRowLevelPermissionTranslationPlan> {
    // A cache computed before the upgrade forces all records off where predicates exist,
    // which would zero the grants copied into the rules
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'rolesPermissions',
    ]);

    const { rolesPermissions } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'rolesPermissions',
      ]);

    const plan = planScopedRowLevelPermissionTranslation({
      workspaceId,
      source,
      rolesPermissions,
      shouldMergeMixedScopesFailClosed:
        options.mergeMixedScopesFailClosed === true,
    });

    for (const reportLine of formatScopedRowLevelPermissionTranslationReport(
      plan,
    )) {
      this.logger.log(`${logPrefix} ${reportLine}`);
    }

    if (isNonEmptyArray(plan.aborts)) {
      throw new Error(
        `${logPrefix} scoped row level permission translation aborted before any write:\n${plan.aborts.join('\n')}`,
      );
    }

    return plan;
  }
}
