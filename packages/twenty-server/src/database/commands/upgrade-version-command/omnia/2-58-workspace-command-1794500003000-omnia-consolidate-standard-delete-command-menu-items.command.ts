import { Command } from 'nest-commander';
import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { LEGACY_SPLIT_RECORD_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIERS } from 'src/database/commands/upgrade-version-command/omnia/utils/legacy-split-record-command-menu-item-universal-identifiers.constant';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type CommandMenuItemOverrides } from 'src/engine/metadata-modules/command-menu-item/entities/command-menu-item.entity';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { fromCommandMenuItemOverridesToUniversalOverrides } from 'src/engine/metadata-modules/flat-command-menu-item/utils/from-command-menu-item-overrides-to-universal-overrides.util';
import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { dispatchUpdateToAuthoredOverride } from 'src/engine/metadata-modules/overrides/utils/dispatch-update-to-authored-override.util';
import { readAuthoredOverrideEntry } from 'src/engine/metadata-modules/overrides/utils/read-authored-override-entry.util';
import { belongsToTwentyStandardApp } from 'src/engine/metadata-modules/utils/belongs-to-twenty-standard-app.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_COMMAND_MENU_ITEMS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant';
import { createStandardCommandMenuItemFlatMetadata } from 'src/engine/workspace-manager/twenty-standard-application/utils/command-menu-item/create-standard-command-menu-item-flat-metadata.util';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

type WorkspaceCommandMenuItemOverride = Pick<
  CommandMenuItemOverrides,
  'isPinned' | 'shortLabel'
>;

const CONSOLIDATED_RECORD_COMMAND_MENU_ITEM_NAMES = [
  'deleteRecords',
  'restoreRecords',
  'destroyRecords',
] as const satisfies (keyof typeof STANDARD_COMMAND_MENU_ITEMS)[];

// Authored by the workspace custom application, like an admin edit, so
// "Reset to default" in the command menu editor removes them.
const WORKSPACE_OVERRIDE_BY_UNIVERSAL_IDENTIFIER: Partial<
  Record<string, WorkspaceCommandMenuItemOverride>
> = {
  [STANDARD_COMMAND_MENU_ITEMS.deleteRecords.universalIdentifier]: {
    isPinned: true,
  },
  [STANDARD_COMMAND_MENU_ITEMS.createNewRecord.universalIdentifier]: {
    shortLabel: 'Create {objectLabelSingular}',
  },
};

@RegisteredWorkspaceCommand('2.58.0', 1794500003000)
@Command({
  name: 'upgrade:2-58:omnia-consolidate-standard-delete-command-menu-items',
  description:
    'OMNIA: replace the legacy split delete, restore and destroy command menu items with the consolidated standard ones, then pin Delete and label the index create button "Create <object>" through workspace overrides. Overrides the workspace already set are kept, so a second run writes nothing.',
})
export class OmniaConsolidateStandardDeleteCommandMenuItemsCommand extends ProvisionedWorkspaceCommandRunner {
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

    const { twentyStandardFlatApplication, workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const {
      flatCommandMenuItemMaps,
      flatObjectMetadataMaps,
      flatPageLayoutMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatCommandMenuItemMaps',
      'flatObjectMetadataMaps',
      'flatPageLayoutMaps',
    ]);

    const now = new Date().toISOString();

    const applyWorkspaceOverride = (flatCommandMenuItem: FlatCommandMenuItem) =>
      this.buildWithWorkspaceOverride({
        flatCommandMenuItem,
        workspaceCustomApplicationUniversalIdentifier:
          workspaceCustomFlatApplication.universalIdentifier,
        flatObjectMetadataMaps,
        flatPageLayoutMaps,
        now,
      });

    const legacyFlatCommandMenuItems = Object.values(
      LEGACY_SPLIT_RECORD_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIERS,
    )
      .map(
        (universalIdentifier) =>
          flatCommandMenuItemMaps.byUniversalIdentifier[universalIdentifier],
      )
      .filter(isDefined);

    const flatCommandMenuItemsToDelete = legacyFlatCommandMenuItems.filter(
      belongsToTwentyStandardApp,
    );

    const legacyCommandMenuItemIdsLeftInPlace = legacyFlatCommandMenuItems
      .filter(
        (flatCommandMenuItem) =>
          !belongsToTwentyStandardApp(flatCommandMenuItem),
      )
      .map(({ id }) => id);

    if (isNonEmptyArray(legacyCommandMenuItemIdsLeftInPlace)) {
      this.logger.warn(
        `Workspace ${workspaceId}: leaving legacy split command menu item(s) ${legacyCommandMenuItemIdsLeftInPlace.join(', ')} in place, they belong to another application`,
      );
    }

    const flatCommandMenuItemsToCreate =
      CONSOLIDATED_RECORD_COMMAND_MENU_ITEM_NAMES.filter(
        (commandMenuItemName) =>
          !isDefined(
            flatCommandMenuItemMaps.byUniversalIdentifier[
              STANDARD_COMMAND_MENU_ITEMS[commandMenuItemName]
                .universalIdentifier
            ],
          ),
      )
        .map((commandMenuItemName) =>
          createStandardCommandMenuItemFlatMetadata({
            commandMenuItemName,
            commandMenuItemId: v4(),
            workspaceId,
            twentyStandardApplicationId: twentyStandardFlatApplication.id,
            dependencyFlatEntityMaps: { flatObjectMetadataMaps },
            now,
          }),
        )
        .map(
          (flatCommandMenuItem) =>
            applyWorkspaceOverride(flatCommandMenuItem) ?? flatCommandMenuItem,
        );

    const flatCommandMenuItemsToUpdate = Object.keys(
      WORKSPACE_OVERRIDE_BY_UNIVERSAL_IDENTIFIER,
    )
      .map(
        (universalIdentifier) =>
          flatCommandMenuItemMaps.byUniversalIdentifier[universalIdentifier],
      )
      .filter(isDefined)
      .filter(belongsToTwentyStandardApp)
      .map(applyWorkspaceOverride)
      .filter(isDefined);

    const workspaceOverrideCount =
      flatCommandMenuItemsToUpdate.length +
      flatCommandMenuItemsToCreate.filter(({ overrides }) =>
        isDefined(overrides),
      ).length;

    if (
      flatCommandMenuItemsToDelete.length === 0 &&
      flatCommandMenuItemsToCreate.length === 0 &&
      flatCommandMenuItemsToUpdate.length === 0
    ) {
      this.logger.log(
        `No standard delete command menu item consolidation needed for workspace ${workspaceId}`,
      );

      return;
    }

    this.logger.log(
      `${isDryRun ? '[DRY RUN] ' : ''}Workspace ${workspaceId}: deleting ${flatCommandMenuItemsToDelete.length} legacy split command menu item(s), creating ${flatCommandMenuItemsToCreate.length} consolidated item(s), setting ${workspaceOverrideCount} workspace override(s)`,
    );

    if (isDryRun) {
      return;
    }

    const validateAndBuildResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunLegacyWorkspaceMigration(
        {
          shouldDeferActions: false,
          isSystemBuild: true,
          workspaceId,
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          allFlatEntityOperationByMetadataName: {
            commandMenuItem: {
              flatEntityToCreate: flatCommandMenuItemsToCreate,
              flatEntityToDelete: flatCommandMenuItemsToDelete,
              flatEntityToUpdate: flatCommandMenuItemsToUpdate,
            },
          },
        },
      );

    if (validateAndBuildResult.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(validateAndBuildResult);
    }
  }

  private buildWithWorkspaceOverride({
    flatCommandMenuItem,
    workspaceCustomApplicationUniversalIdentifier,
    flatObjectMetadataMaps,
    flatPageLayoutMaps,
    now,
  }: {
    flatCommandMenuItem: FlatCommandMenuItem;
    workspaceCustomApplicationUniversalIdentifier: string;
    now: string;
  } & Pick<
    AllFlatEntityMaps,
    'flatObjectMetadataMaps' | 'flatPageLayoutMaps'
  >): FlatCommandMenuItem | undefined {
    const workspaceOverride =
      WORKSPACE_OVERRIDE_BY_UNIVERSAL_IDENTIFIER[
        flatCommandMenuItem.universalIdentifier
      ];

    if (!isDefined(workspaceOverride)) {
      return undefined;
    }

    const overriddenProperties = Object.keys(
      workspaceOverride,
    ) as (keyof WorkspaceCommandMenuItemOverride)[];

    const existingWorkspaceOverrideEntry =
      readAuthoredOverrideEntry<CommandMenuItemOverrides>({
        metadataName: 'commandMenuItem',
        overrides: flatCommandMenuItem.overrides,
        authorUniversalIdentifier:
          workspaceCustomApplicationUniversalIdentifier,
        workspaceCustomApplicationUniversalIdentifier,
      });

    // A value the workspace already set is an admin's choice, null included.
    if (
      overriddenProperties.some(
        (property) => existingWorkspaceOverrideEntry?.[property] !== undefined,
      )
    ) {
      return undefined;
    }

    const { overrides } = dispatchUpdateToAuthoredOverride<
      WorkspaceCommandMenuItemOverride,
      CommandMenuItemOverrides
    >({
      metadataName: 'commandMenuItem',
      updatedProperties: workspaceOverride,
      existingEntity: flatCommandMenuItem,
      existingOverrides: flatCommandMenuItem.overrides,
      authorUniversalIdentifier: workspaceCustomApplicationUniversalIdentifier,
      authorContext: {
        workspaceCustomApplicationUniversalIdentifier,
        ownerApplicationUniversalIdentifier:
          flatCommandMenuItem.applicationUniversalIdentifier,
      },
    });

    const workspaceOverrideEntry =
      overrides?.[workspaceCustomApplicationUniversalIdentifier];

    // The dispatch drops a value equal to the one underneath: nothing to write.
    if (
      !isDefined(overrides) ||
      overriddenProperties.some(
        (property) =>
          workspaceOverrideEntry?.[property] !== workspaceOverride[property],
      )
    ) {
      return undefined;
    }

    return {
      ...flatCommandMenuItem,
      overrides,
      universalOverrides: fromCommandMenuItemOverridesToUniversalOverrides({
        overrides,
        objectMetadataUniversalIdentifierById:
          flatObjectMetadataMaps.universalIdentifierById,
        pageLayoutUniversalIdentifierById:
          flatPageLayoutMaps.universalIdentifierById,
        shouldThrowOnMissingIdentifier: false,
      }),
      updatedAt: now,
    };
  }
}
