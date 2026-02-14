import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { IsNull, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { ActiveOrSuspendedWorkspacesMigrationCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspaces-migration.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/services/application.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DataSourceService } from 'src/engine/metadata-modules/data-source/data-source.service';
import { NavigationMenuItemEntity } from 'src/engine/metadata-modules/navigation-menu-item/entities/navigation-menu-item.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { ViewKey } from 'src/engine/metadata-modules/view/enums/view-key.enum';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// Navigation items in order, referencing object nameSingular values.
// null nameSingular means a folder (e.g. Workflows).
const INSURANCE_NAVIGATION_ITEMS: {
  nameSingular: string | null;
  label: string;
  isFolder?: boolean;
  children?: { nameSingular: string; label: string }[];
}[] = [
  { nameSingular: 'dashboard', label: 'Dashboards' },
  { nameSingular: 'lead', label: 'Leads' },
  { nameSingular: 'agent', label: 'Agents' },
  { nameSingular: 'call', label: 'Calls' },
  { nameSingular: 'policy', label: 'Policies' },
  { nameSingular: 'product', label: 'Products' },
  { nameSingular: 'carrier', label: 'Carriers' },
  { nameSingular: 'carrierProduct', label: 'Carrier Products' },
  { nameSingular: 'familyMember', label: 'Family Members' },
  { nameSingular: 'productType', label: 'Product Types' },
  { nameSingular: 'leadSource', label: 'Lead Sources' },
  { nameSingular: 'note', label: 'Notes' },
  { nameSingular: 'task', label: 'Tasks' },
  {
    nameSingular: null,
    label: 'Workflows',
    isFolder: true,
    children: [
      { nameSingular: 'workflow', label: 'Workflows' },
      { nameSingular: 'workflowRun', label: 'Workflow Runs' },
      { nameSingular: 'workflowVersion', label: 'Workflow Versions' },
    ],
  },
];

@Command({
  name: 'workspace:seed-insurance-navigation',
  description:
    'Seed workspace navigation menu items with insurance CRM objects.',
})
export class SeedInsuranceNavigationCommand extends ActiveOrSuspendedWorkspacesMigrationCommandRunner {
  protected override readonly logger = new Logger(
    SeedInsuranceNavigationCommand.name,
  );

  constructor(
    @InjectRepository(WorkspaceEntity)
    protected readonly workspaceRepository: Repository<WorkspaceEntity>,
    protected readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    protected readonly dataSourceService: DataSourceService,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(ViewEntity)
    private readonly viewRepository: Repository<ViewEntity>,
    @InjectRepository(NavigationMenuItemEntity)
    private readonly navigationMenuItemRepository: Repository<NavigationMenuItemEntity>,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceRepository, globalWorkspaceOrmManager, dataSourceService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    this.logger.log(
      `Seeding insurance navigation items for workspace ${workspaceId}`,
    );

    // Find standard and custom application IDs
    const { twentyStandardFlatApplication, workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    // Load all active object metadata for this workspace
    const objectMetadataItems = await this.objectMetadataRepository.find({
      where: { workspaceId, isActive: true },
    });

    const objectMetadataByName = new Map(
      objectMetadataItems.map((item) => [item.nameSingular, item]),
    );

    // Load all INDEX (default "All") views for this workspace
    const indexViews = await this.viewRepository.find({
      where: { workspaceId, key: ViewKey.INDEX, deletedAt: IsNull() },
    });

    const indexViewByObjectMetadataId = new Map(
      indexViews.map((view) => [view.objectMetadataId, view]),
    );

    if (options.dryRun) {
      this.logger.log('[DRY RUN] Would create the following navigation items:');

      for (const [index, item] of INSURANCE_NAVIGATION_ITEMS.entries()) {
        if (item.isFolder) {
          this.logger.log(`  Position ${index}: ${item.label} (folder)`);

          for (const [childIndex, child] of (item.children ?? []).entries()) {
            const objectMeta = objectMetadataByName.get(child.nameSingular);
            const found = isDefined(objectMeta)
              ? `objectMetadataId=${objectMeta.id}`
              : 'NOT FOUND';

            this.logger.log(
              `    Position ${childIndex}: ${child.label} (${found})`,
            );
          }
        } else if (isDefined(item.nameSingular)) {
          const objectMeta = objectMetadataByName.get(item.nameSingular);
          const found = isDefined(objectMeta)
            ? `objectMetadataId=${objectMeta.id}`
            : 'NOT FOUND';

          this.logger.log(`  Position ${index}: ${item.label} (${found})`);
        }
      }

      return;
    }

    // Delete existing workspace-level navigation items (those with userWorkspaceId IS NULL)
    const deleted = await this.navigationMenuItemRepository.delete({
      workspaceId,
      userWorkspaceId: IsNull(),
    });

    this.logger.log(
      `Deleted ${deleted.affected ?? 0} existing workspace-level navigation items`,
    );

    // Build and insert new navigation items
    const itemsToInsert: Partial<NavigationMenuItemEntity>[] = [];

    for (const [position, item] of INSURANCE_NAVIGATION_ITEMS.entries()) {
      if (item.isFolder) {
        // Create folder item
        const folderId = uuidv4();

        itemsToInsert.push({
          id: folderId,
          universalIdentifier: folderId,
          workspaceId,
          applicationId: twentyStandardFlatApplication.id,
          userWorkspaceId: null,
          viewId: null,
          targetRecordId: null,
          targetObjectMetadataId: null,
          folderId: null,
          name: item.label,
          position,
          link: null,
        });

        // Create folder children
        for (const [childPosition, child] of (item.children ?? []).entries()) {
          const objectMeta = objectMetadataByName.get(child.nameSingular);

          if (!isDefined(objectMeta)) {
            this.logger.warn(
              `Skipping folder child "${child.label}" - object "${child.nameSingular}" not found`,
            );

            continue;
          }

          const view = indexViewByObjectMetadataId.get(objectMeta.id);

          if (!isDefined(view)) {
            this.logger.warn(
              `Skipping folder child "${child.label}" - no INDEX view found for object "${child.nameSingular}"`,
            );

            continue;
          }

          const childApplicationId = isDefined(objectMeta.applicationId)
            ? objectMeta.applicationId
            : workspaceCustomFlatApplication.id;

          const childId = uuidv4();

          itemsToInsert.push({
            id: childId,
            universalIdentifier: childId,
            workspaceId,
            applicationId: childApplicationId,
            userWorkspaceId: null,
            viewId: view.id,
            targetRecordId: null,
            targetObjectMetadataId: null,
            folderId,
            name: null,
            position: childPosition,
            link: null,
          });
        }
      } else if (isDefined(item.nameSingular)) {
        const objectMeta = objectMetadataByName.get(item.nameSingular);

        if (!isDefined(objectMeta)) {
          this.logger.warn(
            `Skipping "${item.label}" - object "${item.nameSingular}" not found`,
          );

          continue;
        }

        const view = indexViewByObjectMetadataId.get(objectMeta.id);

        if (!isDefined(view)) {
          this.logger.warn(
            `Skipping "${item.label}" - no INDEX view found for object "${item.nameSingular}"`,
          );

          continue;
        }

        const applicationId = isDefined(objectMeta.applicationId)
          ? objectMeta.applicationId
          : workspaceCustomFlatApplication.id;

        const itemId = uuidv4();

        itemsToInsert.push({
          id: itemId,
          universalIdentifier: itemId,
          workspaceId,
          applicationId,
          userWorkspaceId: null,
          viewId: view.id,
          targetRecordId: null,
          targetObjectMetadataId: null,
          folderId: null,
          name: null,
          position,
          link: null,
        });
      }
    }

    if (itemsToInsert.length > 0) {
      await this.navigationMenuItemRepository.save(itemsToInsert);

      this.logger.log(
        `Created ${itemsToInsert.length} navigation menu items for workspace ${workspaceId}`,
      );
    } else {
      this.logger.warn(
        `No navigation menu items to create for workspace ${workspaceId}`,
      );
    }

    // Invalidate the workspace cache so changes are picked up
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'flatNavigationMenuItemMaps',
    ]);

    this.logger.log(
      `Finished seeding insurance navigation for workspace ${workspaceId}`,
    );
  }
}
