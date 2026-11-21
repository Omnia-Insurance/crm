import { Test } from '@nestjs/testing';
import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaConsolidateStandardDeleteCommandMenuItemsCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500003000-omnia-consolidate-standard-delete-command-menu-items.command';
import { LEGACY_SPLIT_RECORD_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIERS } from 'src/database/commands/upgrade-version-command/omnia/utils/legacy-split-record-command-menu-item-universal-identifiers.constant';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_COMMAND_MENU_ITEMS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant';
import { createStandardCommandMenuItemFlatMetadata } from 'src/engine/workspace-manager/twenty-standard-application/utils/command-menu-item/create-standard-command-menu-item-flat-metadata.util';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-4000-8000-0000000000a1';
const WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-4000-8000-0000000000c1';
const OTHER_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-4000-8000-0000000000d1';

const DELETE_RECORDS_UNIVERSAL_IDENTIFIER =
  STANDARD_COMMAND_MENU_ITEMS.deleteRecords.universalIdentifier;
const CREATE_NEW_RECORD_UNIVERSAL_IDENTIFIER =
  STANDARD_COMMAND_MENU_ITEMS.createNewRecord.universalIdentifier;

const CONSOLIDATED_UNIVERSAL_IDENTIFIERS = [
  DELETE_RECORDS_UNIVERSAL_IDENTIFIER,
  STANDARD_COMMAND_MENU_ITEMS.restoreRecords.universalIdentifier,
  STANDARD_COMMAND_MENU_ITEMS.destroyRecords.universalIdentifier,
];

const buildStandardFlatCommandMenuItem = (
  commandMenuItemName: keyof typeof STANDARD_COMMAND_MENU_ITEMS,
  overrides: FlatCommandMenuItem['overrides'] = null,
): FlatCommandMenuItem => ({
  ...createStandardCommandMenuItemFlatMetadata({
    commandMenuItemName,
    commandMenuItemId: `${commandMenuItemName}-id`,
    workspaceId: WORKSPACE_ID,
    twentyStandardApplicationId: STANDARD_APPLICATION_ID,
    dependencyFlatEntityMaps: {
      flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
    },
    now: '2026-11-01T00:00:00.000Z',
  }),
  overrides,
  universalOverrides: overrides,
});

const LEGACY_FLAT_COMMAND_MENU_ITEMS: FlatCommandMenuItem[] = Object.entries(
  LEGACY_SPLIT_RECORD_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIERS,
).map(([legacyName, universalIdentifier]) => ({
  ...buildStandardFlatCommandMenuItem('deleteRecords'),
  id: `${legacyName}-id`,
  universalIdentifier,
}));

const CONSOLIDATED_FLAT_COMMAND_MENU_ITEMS: FlatCommandMenuItem[] = [
  buildStandardFlatCommandMenuItem('deleteRecords', {
    [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: { isPinned: true },
  }),
  buildStandardFlatCommandMenuItem('restoreRecords'),
  buildStandardFlatCommandMenuItem('destroyRecords'),
  buildStandardFlatCommandMenuItem('createNewRecord', {
    [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: {
      shortLabel: 'Create {objectLabelSingular}',
    },
  }),
];

const setup = async (flatCommandMenuItems: FlatCommandMenuItem[]) => {
  const validateBuildAndRunLegacyWorkspaceMigration = jest
    .fn()
    .mockResolvedValue({ status: 'success' });

  const module = await Test.createTestingModule({
    providers: [
      OmniaConsolidateStandardDeleteCommandMenuItemsCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      {
        provide: ApplicationService,
        useValue: {
          findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
            .fn()
            .mockResolvedValue({
              twentyStandardFlatApplication: {
                id: STANDARD_APPLICATION_ID,
                universalIdentifier:
                  TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
              },
              workspaceCustomFlatApplication: {
                id: 'workspace-custom-application-id',
                universalIdentifier:
                  WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
              },
            }),
        },
      },
      {
        provide: WorkspaceCacheService,
        useValue: {
          getOrRecompute: jest.fn().mockResolvedValue({
            flatCommandMenuItemMaps: {
              ...createEmptyFlatEntityMaps(),
              byUniversalIdentifier: Object.fromEntries(
                flatCommandMenuItems.map((flatCommandMenuItem) => [
                  flatCommandMenuItem.universalIdentifier,
                  flatCommandMenuItem,
                ]),
              ),
            },
            flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
            flatPageLayoutMaps: createEmptyFlatEntityMaps(),
          }),
        },
      },
      {
        provide: WorkspaceMigrationValidateBuildAndRunService,
        useValue: { validateBuildAndRunLegacyWorkspaceMigration },
      },
    ],
  }).compile();

  const command = module.get(
    OmniaConsolidateStandardDeleteCommandMenuItemsCommand,
  );

  const runOnWorkspace = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  return { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration };
};

const getCommandMenuItemOperations = (
  validateBuildAndRunLegacyWorkspaceMigration: jest.Mock,
) =>
  validateBuildAndRunLegacyWorkspaceMigration.mock.calls[0][0]
    .allFlatEntityOperationByMetadataName.commandMenuItem;

describe('OmniaConsolidateStandardDeleteCommandMenuItemsCommand', () => {
  it('replaces the legacy split items and sets the workspace overrides', async () => {
    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup([
        ...LEGACY_FLAT_COMMAND_MENU_ITEMS,
        buildStandardFlatCommandMenuItem('createNewRecord'),
      ]);

    await runOnWorkspace();

    expect(validateBuildAndRunLegacyWorkspaceMigration).toHaveBeenCalledTimes(
      1,
    );
    expect(
      validateBuildAndRunLegacyWorkspaceMigration.mock.calls[0][0],
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      isSystemBuild: true,
      applicationUniversalIdentifier:
        TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    });

    const { flatEntityToCreate, flatEntityToDelete, flatEntityToUpdate } =
      getCommandMenuItemOperations(validateBuildAndRunLegacyWorkspaceMigration);

    expect(
      flatEntityToDelete.map(
        ({ universalIdentifier }: FlatCommandMenuItem) => universalIdentifier,
      ),
    ).toEqual(
      Object.values(
        LEGACY_SPLIT_RECORD_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIERS,
      ),
    );

    expect(
      flatEntityToCreate.map(
        ({ universalIdentifier }: FlatCommandMenuItem) => universalIdentifier,
      ),
    ).toEqual(CONSOLIDATED_UNIVERSAL_IDENTIFIERS);
    expect(flatEntityToCreate[0]).toMatchObject({
      applicationId: STANDARD_APPLICATION_ID,
      isPinned: false,
      overrides: {
        [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: { isPinned: true },
      },
      universalOverrides: {
        [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: { isPinned: true },
      },
    });
    expect(flatEntityToCreate[1].overrides).toBeNull();
    expect(flatEntityToCreate[2].overrides).toBeNull();

    expect(flatEntityToUpdate).toHaveLength(1);
    expect(flatEntityToUpdate[0]).toMatchObject({
      universalIdentifier: CREATE_NEW_RECORD_UNIVERSAL_IDENTIFIER,
      shortLabel: STANDARD_COMMAND_MENU_ITEMS.createNewRecord.shortLabel,
      overrides: {
        [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: {
          shortLabel: 'Create {objectLabelSingular}',
        },
      },
      universalOverrides: {
        [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: {
          shortLabel: 'Create {objectLabelSingular}',
        },
      },
    });
  });

  it('writes nothing once the workspace is consolidated', async () => {
    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup(CONSOLIDATED_FLAT_COMMAND_MENU_ITEMS);

    await runOnWorkspace();

    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('keeps existing override entries and the values the workspace already chose', async () => {
    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup([
        buildStandardFlatCommandMenuItem('deleteRecords', {
          [OTHER_APPLICATION_UNIVERSAL_IDENTIFIER]: { position: 10 },
          [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: {
            hotKeys: ['D'],
          },
        }),
        buildStandardFlatCommandMenuItem('restoreRecords'),
        buildStandardFlatCommandMenuItem('destroyRecords'),
        buildStandardFlatCommandMenuItem('createNewRecord', {
          [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: {
            shortLabel: 'New',
          },
        }),
      ]);

    await runOnWorkspace();

    const { flatEntityToCreate, flatEntityToDelete, flatEntityToUpdate } =
      getCommandMenuItemOperations(validateBuildAndRunLegacyWorkspaceMigration);

    expect(flatEntityToCreate).toEqual([]);
    expect(flatEntityToDelete).toEqual([]);
    expect(flatEntityToUpdate).toHaveLength(1);
    expect(flatEntityToUpdate[0].universalIdentifier).toBe(
      DELETE_RECORDS_UNIVERSAL_IDENTIFIER,
    );
    expect(flatEntityToUpdate[0].overrides).toEqual({
      [OTHER_APPLICATION_UNIVERSAL_IDENTIFIER]: { position: 10 },
      [WORKSPACE_CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: {
        hotKeys: ['D'],
        isPinned: true,
      },
    });
  });

  it('only deletes the legacy items the standard application owns', async () => {
    const [otherApplicationLegacyFlatCommandMenuItem, ...standardLegacyItems] =
      LEGACY_FLAT_COMMAND_MENU_ITEMS;

    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup([
        {
          ...otherApplicationLegacyFlatCommandMenuItem,
          applicationUniversalIdentifier:
            OTHER_APPLICATION_UNIVERSAL_IDENTIFIER,
        },
        ...standardLegacyItems,
        ...CONSOLIDATED_FLAT_COMMAND_MENU_ITEMS,
      ]);

    await runOnWorkspace();

    const { flatEntityToCreate, flatEntityToDelete, flatEntityToUpdate } =
      getCommandMenuItemOperations(validateBuildAndRunLegacyWorkspaceMigration);

    expect(
      flatEntityToDelete.map(
        ({ universalIdentifier }: FlatCommandMenuItem) => universalIdentifier,
      ),
    ).toEqual(
      standardLegacyItems.map(({ universalIdentifier }) => universalIdentifier),
    );
    expect(flatEntityToCreate).toEqual([]);
    expect(flatEntityToUpdate).toEqual([]);
  });

  it('writes nothing in a dry run', async () => {
    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup([
        ...LEGACY_FLAT_COMMAND_MENU_ITEMS,
        buildStandardFlatCommandMenuItem('createNewRecord'),
      ]);

    await runOnWorkspace(true);

    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });
});
