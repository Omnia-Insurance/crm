import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { EntityManager, In, IsNull, Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import {
  BROKERAGE_ADOPTION_FIELDS,
  BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS,
  BROKERAGE_ADOPTION_OBJECTS,
  BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
  type BrokerageAdoptionField,
  type BrokerageAdoptionNavigationMenuItem,
} from 'src/database/commands/custom/constants/brokerage-app-adoption.constants';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { NavigationMenuItemEntity } from 'src/engine/metadata-modules/navigation-menu-item/entities/navigation-menu-item.entity';
import { NavigationMenuItemType } from 'src/engine/metadata-modules/navigation-menu-item/enums/navigation-menu-item-type.enum';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceCacheKeyName } from 'src/engine/workspace-cache/types/workspace-cache-key.type';

type MetadataUpdate = {
  id: string;
  label: string;
  currentUniversalIdentifier: string;
  nextUniversalIdentifier: string;
  currentApplicationId: string;
  nextApplicationId: string;
};

type FieldMetadataUpdate = MetadataUpdate & {
  description: string | null;
  isLabelSyncedWithName: boolean;
  isUnique: boolean;
};

type AdoptionPlan = {
  objectUpdates: MetadataUpdate[];
  fieldUpdates: FieldMetadataUpdate[];
  navigationMenuItemUpdates: MetadataUpdate[];
  missingObjects: string[];
  missingFields: string[];
  missingNavigationMenuItems: string[];
};

const CACHE_KEYS_TO_REFRESH = [
  'flatApplicationMaps',
  'flatObjectMetadataMaps',
  'flatFieldMetadataMaps',
  'flatNavigationMenuItemMaps',
  'ORMEntityMetadatas',
] satisfies WorkspaceCacheKeyName[];

const getFieldKey = ({
  objectMetadataId,
  fieldName,
}: {
  objectMetadataId: string;
  fieldName: string;
}) => `${objectMetadataId}:${fieldName}`;

const toMapByUniversalIdentifier = <T extends { universalIdentifier: string }>(
  items: T[],
) => {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(item.universalIdentifier, item);
  }

  return map;
};

@Command({
  name: 'workspace:adopt-brokerage-app',
  description:
    'Adopt existing Omnia brokerage metadata into the Brokerage app without recreating workspace data.',
})
export class AdoptBrokerageAppCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectRepository(NavigationMenuItemEntity)
    private readonly navigationMenuItemRepository: Repository<NavigationMenuItemEntity>,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun === true;
    const brokerageApplication =
      await this.applicationService.findByUniversalIdentifier({
        universalIdentifier: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
        workspaceId,
      });

    if (!isDefined(brokerageApplication)) {
      throw new Error(
        `Brokerage app ${BROKERAGE_APP_UNIVERSAL_IDENTIFIER} is not installed in workspace ${workspaceId}`,
      );
    }

    const plan = await this.buildAdoptionPlan({
      brokerageApplicationId: brokerageApplication.id,
      workspaceId,
    });

    this.logPlan({
      plan,
      workspaceId,
      isDryRun,
      isVerbose: options.verbose === true,
    });

    if (isDryRun) {
      return;
    }

    await this.objectMetadataRepository.manager.transaction(async (manager) => {
      await this.applyObjectUpdates({ manager, updates: plan.objectUpdates });
      await this.applyFieldUpdates({ manager, updates: plan.fieldUpdates });
      await this.applyNavigationMenuItemUpdates({
        manager,
        updates: plan.navigationMenuItemUpdates,
      });
    });

    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      CACHE_KEYS_TO_REFRESH,
    );
  }

  private async buildAdoptionPlan({
    brokerageApplicationId,
    workspaceId,
  }: {
    brokerageApplicationId: string;
    workspaceId: string;
  }): Promise<AdoptionPlan> {
    const objectUniversalIdentifiers = this.getObjectUniversalIdentifiers();
    const objectMetadatas = await this.objectMetadataRepository.find({
      where: {
        workspaceId,
        universalIdentifier: In(objectUniversalIdentifiers),
      },
    });
    const objectMetadataByUniversalIdentifier =
      toMapByUniversalIdentifier(objectMetadatas);

    const objectUpdates = BROKERAGE_ADOPTION_OBJECTS.flatMap(
      (desiredObject) => {
        const objectMetadata = objectMetadataByUniversalIdentifier.get(
          desiredObject.universalIdentifier,
        );

        if (!isDefined(objectMetadata)) {
          return [];
        }

        if (objectMetadata.applicationId === brokerageApplicationId) {
          return [];
        }

        return [
          {
            id: objectMetadata.id,
            label: desiredObject.nameSingular,
            currentUniversalIdentifier: objectMetadata.universalIdentifier,
            nextUniversalIdentifier: desiredObject.universalIdentifier,
            currentApplicationId: objectMetadata.applicationId,
            nextApplicationId: brokerageApplicationId,
          },
        ];
      },
    );

    const missingObjects = BROKERAGE_ADOPTION_OBJECTS.filter(
      (desiredObject) =>
        !objectMetadataByUniversalIdentifier.has(
          desiredObject.universalIdentifier,
        ),
    ).map((desiredObject) => desiredObject.nameSingular);

    const fields = await this.fieldMetadataRepository.find({
      where: {
        workspaceId,
        objectMetadataId: In(
          objectMetadatas.map((objectMetadata) => objectMetadata.id),
        ),
      },
    });

    const fieldsByUniversalIdentifier = toMapByUniversalIdentifier(fields);
    const fieldsByObjectAndName = new Map<string, FieldMetadataEntity>();

    for (const field of fields) {
      fieldsByObjectAndName.set(
        getFieldKey({
          objectMetadataId: field.objectMetadataId,
          fieldName: field.name,
        }),
        field,
      );
    }

    const fieldUpdates: FieldMetadataUpdate[] = [];
    const missingFields: string[] = [];

    for (const desiredField of BROKERAGE_ADOPTION_FIELDS) {
      const objectMetadata = objectMetadataByUniversalIdentifier.get(
        desiredField.objectUniversalIdentifier,
      );

      if (!isDefined(objectMetadata)) {
        missingFields.push(
          `${desiredField.objectUniversalIdentifier}.${desiredField.name}`,
        );
        continue;
      }

      const field = fieldsByObjectAndName.get(
        getFieldKey({
          objectMetadataId: objectMetadata.id,
          fieldName: desiredField.name,
        }),
      );

      if (!isDefined(field)) {
        missingFields.push(
          `${objectMetadata.nameSingular}.${desiredField.name}`,
        );
        continue;
      }

      const conflictingField = fieldsByUniversalIdentifier.get(
        desiredField.universalIdentifier,
      );

      if (isDefined(conflictingField) && conflictingField.id !== field.id) {
        throw new Error(
          `Field universal identifier conflict for ${objectMetadata.nameSingular}.${desiredField.name}: ${desiredField.universalIdentifier} already belongs to ${conflictingField.name}`,
        );
      }

      if (
        field.universalIdentifier === desiredField.universalIdentifier &&
        field.applicationId === brokerageApplicationId &&
        field.description === desiredField.description &&
        field.isLabelSyncedWithName === desiredField.isLabelSyncedWithName &&
        field.isUnique === desiredField.isUnique
      ) {
        continue;
      }

      fieldUpdates.push({
        id: field.id,
        label: `${objectMetadata.nameSingular}.${desiredField.name}`,
        description: desiredField.description,
        isLabelSyncedWithName: desiredField.isLabelSyncedWithName,
        isUnique: desiredField.isUnique,
        currentUniversalIdentifier: field.universalIdentifier,
        nextUniversalIdentifier: desiredField.universalIdentifier,
        currentApplicationId: field.applicationId,
        nextApplicationId: brokerageApplicationId,
      });
    }

    const navigationMenuItems = await this.navigationMenuItemRepository.find({
      where: { workspaceId, userWorkspaceId: IsNull() },
    });

    const navigationMenuItemUpdates = this.buildNavigationMenuItemUpdates({
      brokerageApplicationId,
      navigationMenuItems,
      objectMetadataByUniversalIdentifier,
    });

    const folderMatchesByUniversalIdentifier =
      this.buildFolderMatchesByUniversalIdentifier({
        navigationMenuItems,
        objectMetadataByUniversalIdentifier,
      });
    const missingNavigationMenuItems =
      BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS.filter(
        (desiredNavigationMenuItem) =>
          !isDefined(
            this.findMatchingNavigationMenuItem({
              desiredNavigationMenuItem,
              navigationMenuItems,
              folderMatchesByUniversalIdentifier,
              objectMetadataByUniversalIdentifier,
            }),
          ),
      ).map((desiredNavigationMenuItem) =>
        this.getNavigationMenuItemLabel({
          desiredNavigationMenuItem,
          objectMetadataByUniversalIdentifier,
        }),
      );

    return {
      objectUpdates,
      fieldUpdates,
      navigationMenuItemUpdates,
      missingObjects,
      missingFields,
      missingNavigationMenuItems,
    };
  }

  private getObjectUniversalIdentifiers(): string[] {
    const objectUniversalIdentifiers = new Set<string>();

    for (const desiredObject of BROKERAGE_ADOPTION_OBJECTS) {
      objectUniversalIdentifiers.add(desiredObject.universalIdentifier);
    }

    for (const desiredField of BROKERAGE_ADOPTION_FIELDS) {
      objectUniversalIdentifiers.add(desiredField.objectUniversalIdentifier);
    }

    for (const desiredNavigationMenuItem of BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS) {
      if (
        isDefined(desiredNavigationMenuItem.targetObjectUniversalIdentifier)
      ) {
        objectUniversalIdentifiers.add(
          desiredNavigationMenuItem.targetObjectUniversalIdentifier,
        );
      }
    }

    return Array.from(objectUniversalIdentifiers);
  }

  private buildNavigationMenuItemUpdates({
    brokerageApplicationId,
    navigationMenuItems,
    objectMetadataByUniversalIdentifier,
  }: {
    brokerageApplicationId: string;
    navigationMenuItems: NavigationMenuItemEntity[];
    objectMetadataByUniversalIdentifier: Map<string, ObjectMetadataEntity>;
  }): MetadataUpdate[] {
    const navigationMenuItemsByUniversalIdentifier =
      toMapByUniversalIdentifier(navigationMenuItems);
    const folderMatchesByUniversalIdentifier = new Map<
      string,
      NavigationMenuItemEntity
    >();
    const updates: MetadataUpdate[] = [];

    for (const desiredNavigationMenuItem of BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS) {
      if (desiredNavigationMenuItem.type !== NavigationMenuItemType.FOLDER) {
        continue;
      }

      const navigationMenuItem = this.findMatchingNavigationMenuItem({
        desiredNavigationMenuItem,
        navigationMenuItems,
        folderMatchesByUniversalIdentifier,
        objectMetadataByUniversalIdentifier,
      });

      if (!isDefined(navigationMenuItem)) {
        continue;
      }

      folderMatchesByUniversalIdentifier.set(
        desiredNavigationMenuItem.universalIdentifier,
        navigationMenuItem,
      );

      updates.push(
        this.buildNavigationMenuItemUpdate({
          brokerageApplicationId,
          desiredNavigationMenuItem,
          navigationMenuItem,
          navigationMenuItemsByUniversalIdentifier,
          objectMetadataByUniversalIdentifier,
        }),
      );
    }

    for (const desiredNavigationMenuItem of BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS) {
      if (desiredNavigationMenuItem.type === NavigationMenuItemType.FOLDER) {
        continue;
      }

      const navigationMenuItem = this.findMatchingNavigationMenuItem({
        desiredNavigationMenuItem,
        navigationMenuItems,
        folderMatchesByUniversalIdentifier,
        objectMetadataByUniversalIdentifier,
      });

      if (!isDefined(navigationMenuItem)) {
        continue;
      }

      updates.push(
        this.buildNavigationMenuItemUpdate({
          brokerageApplicationId,
          desiredNavigationMenuItem,
          navigationMenuItem,
          navigationMenuItemsByUniversalIdentifier,
          objectMetadataByUniversalIdentifier,
        }),
      );
    }

    return updates.filter(
      (update) =>
        update.currentUniversalIdentifier !== update.nextUniversalIdentifier ||
        update.currentApplicationId !== update.nextApplicationId,
    );
  }

  private buildFolderMatchesByUniversalIdentifier({
    navigationMenuItems,
    objectMetadataByUniversalIdentifier,
  }: {
    navigationMenuItems: NavigationMenuItemEntity[];
    objectMetadataByUniversalIdentifier: Map<string, ObjectMetadataEntity>;
  }) {
    const folderMatchesByUniversalIdentifier = new Map<
      string,
      NavigationMenuItemEntity
    >();

    for (const desiredNavigationMenuItem of BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS) {
      if (desiredNavigationMenuItem.type !== NavigationMenuItemType.FOLDER) {
        continue;
      }

      const navigationMenuItem = this.findMatchingNavigationMenuItem({
        desiredNavigationMenuItem,
        navigationMenuItems,
        folderMatchesByUniversalIdentifier,
        objectMetadataByUniversalIdentifier,
      });

      if (isDefined(navigationMenuItem)) {
        folderMatchesByUniversalIdentifier.set(
          desiredNavigationMenuItem.universalIdentifier,
          navigationMenuItem,
        );
      }
    }

    return folderMatchesByUniversalIdentifier;
  }

  private buildNavigationMenuItemUpdate({
    brokerageApplicationId,
    desiredNavigationMenuItem,
    navigationMenuItem,
    navigationMenuItemsByUniversalIdentifier,
    objectMetadataByUniversalIdentifier,
  }: {
    brokerageApplicationId: string;
    desiredNavigationMenuItem: BrokerageAdoptionNavigationMenuItem;
    navigationMenuItem: NavigationMenuItemEntity;
    navigationMenuItemsByUniversalIdentifier: Map<
      string,
      NavigationMenuItemEntity
    >;
    objectMetadataByUniversalIdentifier: Map<string, ObjectMetadataEntity>;
  }): MetadataUpdate {
    const conflictingNavigationMenuItem =
      navigationMenuItemsByUniversalIdentifier.get(
        desiredNavigationMenuItem.universalIdentifier,
      );

    if (
      isDefined(conflictingNavigationMenuItem) &&
      conflictingNavigationMenuItem.id !== navigationMenuItem.id
    ) {
      throw new Error(
        `Navigation menu item universal identifier conflict for ${this.getNavigationMenuItemLabel(
          { desiredNavigationMenuItem, objectMetadataByUniversalIdentifier },
        )}: ${desiredNavigationMenuItem.universalIdentifier} already belongs to ${conflictingNavigationMenuItem.id}`,
      );
    }

    return {
      id: navigationMenuItem.id,
      label: this.getNavigationMenuItemLabel({
        desiredNavigationMenuItem,
        objectMetadataByUniversalIdentifier,
      }),
      currentUniversalIdentifier: navigationMenuItem.universalIdentifier,
      nextUniversalIdentifier: desiredNavigationMenuItem.universalIdentifier,
      currentApplicationId: navigationMenuItem.applicationId,
      nextApplicationId: brokerageApplicationId,
    };
  }

  private findMatchingNavigationMenuItem({
    desiredNavigationMenuItem,
    navigationMenuItems,
    folderMatchesByUniversalIdentifier,
    objectMetadataByUniversalIdentifier,
  }: {
    desiredNavigationMenuItem: BrokerageAdoptionNavigationMenuItem;
    navigationMenuItems: NavigationMenuItemEntity[];
    folderMatchesByUniversalIdentifier: Map<string, NavigationMenuItemEntity>;
    objectMetadataByUniversalIdentifier: Map<string, ObjectMetadataEntity>;
  }): NavigationMenuItemEntity | undefined {
    const existingByUniversalIdentifier = navigationMenuItems.find(
      (navigationMenuItem) =>
        navigationMenuItem.universalIdentifier ===
        desiredNavigationMenuItem.universalIdentifier,
    );

    if (isDefined(existingByUniversalIdentifier)) {
      return existingByUniversalIdentifier;
    }

    if (desiredNavigationMenuItem.type === NavigationMenuItemType.FOLDER) {
      return navigationMenuItems.find(
        (navigationMenuItem) =>
          navigationMenuItem.type === NavigationMenuItemType.FOLDER &&
          navigationMenuItem.name === desiredNavigationMenuItem.name &&
          !isDefined(navigationMenuItem.folderId),
      );
    }

    const targetObjectUniversalIdentifier =
      desiredNavigationMenuItem.targetObjectUniversalIdentifier;

    if (!isDefined(targetObjectUniversalIdentifier)) {
      return undefined;
    }

    const targetObjectMetadata = objectMetadataByUniversalIdentifier.get(
      targetObjectUniversalIdentifier,
    );

    if (!isDefined(targetObjectMetadata)) {
      return undefined;
    }

    const folderId = isDefined(
      desiredNavigationMenuItem.folderUniversalIdentifier,
    )
      ? folderMatchesByUniversalIdentifier.get(
          desiredNavigationMenuItem.folderUniversalIdentifier,
        )?.id
      : null;

    return navigationMenuItems.find(
      (navigationMenuItem) =>
        navigationMenuItem.type === NavigationMenuItemType.OBJECT &&
        navigationMenuItem.targetObjectMetadataId === targetObjectMetadata.id &&
        navigationMenuItem.folderId === folderId,
    );
  }

  private getNavigationMenuItemLabel({
    desiredNavigationMenuItem,
    objectMetadataByUniversalIdentifier,
  }: {
    desiredNavigationMenuItem: BrokerageAdoptionNavigationMenuItem;
    objectMetadataByUniversalIdentifier: Map<string, ObjectMetadataEntity>;
  }): string {
    if (isDefined(desiredNavigationMenuItem.name)) {
      return desiredNavigationMenuItem.name;
    }

    if (!isDefined(desiredNavigationMenuItem.targetObjectUniversalIdentifier)) {
      return desiredNavigationMenuItem.universalIdentifier;
    }

    return (
      objectMetadataByUniversalIdentifier.get(
        desiredNavigationMenuItem.targetObjectUniversalIdentifier,
      )?.nameSingular ??
      desiredNavigationMenuItem.targetObjectUniversalIdentifier
    );
  }

  private async applyObjectUpdates({
    manager,
    updates,
  }: {
    manager: EntityManager;
    updates: MetadataUpdate[];
  }) {
    const objectMetadataRepository =
      manager.getRepository(ObjectMetadataEntity);

    for (const update of updates) {
      await objectMetadataRepository.update(
        { id: update.id },
        { applicationId: update.nextApplicationId },
      );
    }
  }

  private async applyFieldUpdates({
    manager,
    updates,
  }: {
    manager: EntityManager;
    updates: FieldMetadataUpdate[];
  }) {
    const fieldMetadataRepository = manager.getRepository(FieldMetadataEntity);

    for (const update of updates) {
      await fieldMetadataRepository.update(
        { id: update.id },
        {
          applicationId: update.nextApplicationId,
          description: update.description,
          isLabelSyncedWithName: update.isLabelSyncedWithName,
          isUnique: update.isUnique,
          universalIdentifier: update.nextUniversalIdentifier,
        },
      );
    }
  }

  private async applyNavigationMenuItemUpdates({
    manager,
    updates,
  }: {
    manager: EntityManager;
    updates: MetadataUpdate[];
  }) {
    const navigationMenuItemRepository = manager.getRepository(
      NavigationMenuItemEntity,
    );

    for (const update of updates) {
      await navigationMenuItemRepository.update(
        { id: update.id },
        {
          applicationId: update.nextApplicationId,
          universalIdentifier: update.nextUniversalIdentifier,
        },
      );
    }
  }

  private logPlan({
    plan,
    workspaceId,
    isDryRun,
    isVerbose,
  }: {
    plan: AdoptionPlan;
    workspaceId: string;
    isDryRun: boolean;
    isVerbose: boolean;
  }) {
    const prefix = isDryRun ? '[DRY RUN] ' : '';

    this.logger.log(
      `${prefix}Brokerage adoption plan for workspace ${workspaceId}: ${plan.objectUpdates.length} objects, ${plan.fieldUpdates.length} fields, ${plan.navigationMenuItemUpdates.length} navigation items`,
    );

    if (isVerbose) {
      this.logUpdates('objects', plan.objectUpdates);
      this.logUpdates('fields', plan.fieldUpdates);
      this.logUpdates('navigation items', plan.navigationMenuItemUpdates);
    }

    if (plan.missingObjects.length > 0) {
      this.logger.warn(`Missing objects: ${plan.missingObjects.join(', ')}`);
    }

    if (plan.missingFields.length > 0) {
      this.logger.warn(`Missing fields: ${plan.missingFields.join(', ')}`);
    }

    if (plan.missingNavigationMenuItems.length > 0) {
      this.logger.warn(
        `Missing navigation items: ${plan.missingNavigationMenuItems.join(', ')}`,
      );
    }
  }

  private logUpdates(label: string, updates: MetadataUpdate[]) {
    for (const update of updates) {
      this.logger.log(
        `  ${label}: ${update.label} ${update.currentUniversalIdentifier} -> ${update.nextUniversalIdentifier}`,
      );
    }
  }
}
