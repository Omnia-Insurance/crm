import { Command } from 'nest-commander';
import { isDefined, isPlainObject } from 'twenty-shared/utils';
import { In, IsNull } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import {
  BROKERAGE_ADOPTION_FIELDS,
  BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS,
  BROKERAGE_ADOPTION_OBJECTS,
  BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
  type BrokerageAdoptionNavigationMenuItem,
} from 'src/database/commands/custom/constants/brokerage-app-adoption.constants';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { NavigationMenuItemEntity } from 'src/engine/metadata-modules/navigation-menu-item/entities/navigation-menu-item.entity';
import { NavigationMenuItemType } from 'src/engine/metadata-modules/navigation-menu-item/enums/navigation-menu-item-type.enum';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

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
  nextSettings: FieldMetadataEntity['settings'];
};

type AdoptionPlan = {
  objectUpdates: MetadataUpdate[];
  fieldUpdates: FieldMetadataUpdate[];
  navigationMenuItemUpdates: MetadataUpdate[];
  missingObjects: string[];
  missingFields: string[];
  missingNavigationMenuItems: string[];
};

const BROKERAGE_ADOPTION_APPLY_DISABLED_MESSAGE =
  'workspace:adopt-brokerage-app is disabled on Twenty v2.58 until the Brokerage rewrite lands: adoption must copy row-level permission rules, not only predicates, and use v2.58 universal identifiers. Rerun with --dry-run to print the adoption plan.';
const DRY_RUN_BROKERAGE_APPLICATION_ID = '00000000-0000-0000-0000-000000000000';
const JUNCTION_TARGET_FIELD_UNIVERSAL_IDENTIFIER_KEY =
  'junctionTargetFieldUniversalIdentifier';

const mergeFieldSettingsPatch = ({
  currentSettings,
  settingsPatch,
}: {
  currentSettings: FieldMetadataEntity['settings'];
  settingsPatch?: Record<string, unknown>;
}): FieldMetadataEntity['settings'] => {
  if (!isDefined(settingsPatch)) {
    return currentSettings;
  }

  return {
    ...(isPlainObject(currentSettings) ? currentSettings : {}),
    ...settingsPatch,
  } as FieldMetadataEntity['settings'];
};

const hasFieldSettingsPatchDifference = ({
  currentSettings,
  settingsPatch,
}: {
  currentSettings: FieldMetadataEntity['settings'];
  settingsPatch?: Record<string, unknown>;
}) => {
  if (!isDefined(settingsPatch)) {
    return false;
  }

  if (!isPlainObject(currentSettings)) {
    return true;
  }

  const currentSettingsRecord = currentSettings as Record<string, unknown>;

  return Object.entries(settingsPatch).some(
    ([key, value]) => currentSettingsRecord[key] !== value,
  );
};

const resolveFieldSettingsPatch = ({
  fieldsByDesiredUniversalIdentifier,
  settingsPatch,
}: {
  fieldsByDesiredUniversalIdentifier: Map<string, FieldMetadataEntity>;
  settingsPatch?: Record<string, unknown>;
}): Record<string, unknown> | undefined => {
  if (!isDefined(settingsPatch)) {
    return undefined;
  }

  const {
    [JUNCTION_TARGET_FIELD_UNIVERSAL_IDENTIFIER_KEY]:
      junctionTargetFieldUniversalIdentifier,
    ...settingsPatchWithoutUniversalIdentifier
  } = settingsPatch;

  if (typeof junctionTargetFieldUniversalIdentifier !== 'string') {
    return settingsPatchWithoutUniversalIdentifier;
  }

  const junctionTargetField = fieldsByDesiredUniversalIdentifier.get(
    junctionTargetFieldUniversalIdentifier,
  );

  if (!isDefined(junctionTargetField)) {
    return settingsPatchWithoutUniversalIdentifier;
  }

  return {
    ...settingsPatchWithoutUniversalIdentifier,
    junctionTargetFieldId: junctionTargetField.id,
  };
};

const getFieldKey = ({
  objectMetadataId,
  fieldName,
}: {
  objectMetadataId: string;
  fieldName: string;
}) => `${objectMetadataId}:${fieldName}`;

const toMapByUniversalIdentifier = <
  TItem extends { universalIdentifier: string },
>(
  items: TItem[],
) => {
  const map = new Map<string, TItem>();

  for (const item of items) {
    map.set(item.universalIdentifier, item);
  }

  return map;
};

@Command({
  name: 'workspace:adopt-brokerage-app',
  description:
    'Plan the adoption of existing Omnia brokerage metadata into the Brokerage app. Dry run only until the v2.58 Brokerage rewrite lands.',
})
export class AdoptBrokerageAppCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectWorkspaceScopedRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: WorkspaceScopedRepository<ObjectMetadataEntity>,
    @InjectWorkspaceScopedRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: WorkspaceScopedRepository<FieldMetadataEntity>,
    @InjectWorkspaceScopedRepository(NavigationMenuItemEntity)
    private readonly navigationMenuItemRepository: WorkspaceScopedRepository<NavigationMenuItemEntity>,
    private readonly applicationService: ApplicationService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun === true;

    if (!isDryRun) {
      throw new Error(BROKERAGE_ADOPTION_APPLY_DISABLED_MESSAGE);
    }

    const brokerageApplicationId =
      await this.findBrokerageApplicationIdForPlan(workspaceId);

    const plan = await this.buildAdoptionPlan({
      brokerageApplicationId,
      workspaceId,
    });

    this.logPlan({
      plan,
      workspaceId,
      isVerbose: options.verbose === true,
    });
  }

  private async findBrokerageApplicationIdForPlan(
    workspaceId: string,
  ): Promise<string> {
    const brokerageApplication =
      await this.applicationService.findOneApplication({
        universalIdentifier: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
        workspaceId,
      });

    if (isDefined(brokerageApplication)) {
      return brokerageApplication.id;
    }

    this.logger.warn(
      `[DRY RUN] Brokerage app ${BROKERAGE_APP_UNIVERSAL_IDENTIFIER} is not installed in workspace ${workspaceId}; planning against a placeholder application id.`,
    );

    return DRY_RUN_BROKERAGE_APPLICATION_ID;
  }

  private async buildAdoptionPlan({
    brokerageApplicationId,
    workspaceId,
  }: {
    brokerageApplicationId: string;
    workspaceId: string;
  }): Promise<AdoptionPlan> {
    const objectUniversalIdentifiers = this.getObjectUniversalIdentifiers();
    const brokerageObjectNames = BROKERAGE_ADOPTION_OBJECTS.map(
      (desiredObject) => desiredObject.nameSingular,
    );
    const objectMetadatas = await this.objectMetadataRepository.find(
      workspaceId,
      {
        where: [
          { universalIdentifier: In(objectUniversalIdentifiers) },
          { nameSingular: In(brokerageObjectNames) },
        ],
      },
    );
    const objectMetadataByActualUniversalIdentifier =
      toMapByUniversalIdentifier(objectMetadatas);
    const objectMetadataByNameSingular = new Map<
      string,
      ObjectMetadataEntity
    >();

    for (const objectMetadata of objectMetadatas) {
      objectMetadataByNameSingular.set(
        objectMetadata.nameSingular,
        objectMetadata,
      );
    }

    const objectMetadataByDesiredUniversalIdentifier =
      this.buildObjectMetadataByDesiredUniversalIdentifier({
        objectMetadataByActualUniversalIdentifier,
        objectMetadataByNameSingular,
      });

    const objectUpdates = BROKERAGE_ADOPTION_OBJECTS.flatMap(
      (desiredObject) => {
        const objectMetadata = objectMetadataByDesiredUniversalIdentifier.get(
          desiredObject.universalIdentifier,
        );

        if (!isDefined(objectMetadata)) {
          return [];
        }

        if (
          objectMetadata.applicationId === brokerageApplicationId &&
          objectMetadata.universalIdentifier ===
            desiredObject.universalIdentifier
        ) {
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
        !objectMetadataByDesiredUniversalIdentifier.has(
          desiredObject.universalIdentifier,
        ),
    ).map((desiredObject) => desiredObject.nameSingular);

    const fieldUniversalIdentifiers = BROKERAGE_ADOPTION_FIELDS.map(
      (desiredField) => desiredField.universalIdentifier,
    );
    const fields = await this.fieldMetadataRepository.find(workspaceId, {
      where: [
        {
          objectMetadataId: In(
            objectMetadatas.map((objectMetadata) => objectMetadata.id),
          ),
        },
        { universalIdentifier: In(fieldUniversalIdentifiers) },
      ],
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

    const fieldsByDesiredUniversalIdentifier = new Map<
      string,
      FieldMetadataEntity
    >();

    for (const desiredField of BROKERAGE_ADOPTION_FIELDS) {
      const objectMetadata = objectMetadataByDesiredUniversalIdentifier.get(
        desiredField.objectUniversalIdentifier,
      );

      if (!isDefined(objectMetadata)) {
        continue;
      }

      const field = fieldsByObjectAndName.get(
        getFieldKey({
          objectMetadataId: objectMetadata.id,
          fieldName: desiredField.name,
        }),
      );

      if (!isDefined(field)) {
        continue;
      }

      fieldsByDesiredUniversalIdentifier.set(
        desiredField.universalIdentifier,
        field,
      );
    }

    const fieldUpdates: FieldMetadataUpdate[] = [];
    const missingFields: string[] = [];

    for (const desiredField of BROKERAGE_ADOPTION_FIELDS) {
      const objectMetadata = objectMetadataByDesiredUniversalIdentifier.get(
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

      const resolvedSettingsPatch = resolveFieldSettingsPatch({
        fieldsByDesiredUniversalIdentifier,
        settingsPatch: desiredField.settingsPatch,
      });

      const nextSettings = mergeFieldSettingsPatch({
        currentSettings: field.settings,
        settingsPatch: resolvedSettingsPatch,
      });

      if (
        field.universalIdentifier === desiredField.universalIdentifier &&
        field.applicationId === brokerageApplicationId &&
        field.description === desiredField.description &&
        field.isLabelSyncedWithName === desiredField.isLabelSyncedWithName &&
        field.isUnique === desiredField.isUnique &&
        !hasFieldSettingsPatchDifference({
          currentSettings: field.settings,
          settingsPatch: resolvedSettingsPatch,
        })
      ) {
        continue;
      }

      fieldUpdates.push({
        id: field.id,
        label: `${objectMetadata.nameSingular}.${desiredField.name}`,
        description: desiredField.description,
        isLabelSyncedWithName: desiredField.isLabelSyncedWithName,
        isUnique: desiredField.isUnique,
        nextSettings,
        currentUniversalIdentifier: field.universalIdentifier,
        nextUniversalIdentifier: desiredField.universalIdentifier,
        currentApplicationId: field.applicationId,
        nextApplicationId: brokerageApplicationId,
      });
    }

    const navigationMenuItems = await this.navigationMenuItemRepository.find(
      workspaceId,
      { where: { userWorkspaceId: IsNull() } },
    );

    const navigationMenuItemUpdates = this.buildNavigationMenuItemUpdates({
      brokerageApplicationId,
      navigationMenuItems,
      objectMetadataByUniversalIdentifier:
        objectMetadataByDesiredUniversalIdentifier,
    });

    const folderMatchesByUniversalIdentifier =
      this.buildFolderMatchesByUniversalIdentifier({
        navigationMenuItems,
        objectMetadataByUniversalIdentifier:
          objectMetadataByDesiredUniversalIdentifier,
      });
    const missingNavigationMenuItems =
      BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS.filter(
        (desiredNavigationMenuItem) =>
          !isDefined(
            this.findMatchingNavigationMenuItem({
              desiredNavigationMenuItem,
              navigationMenuItems,
              folderMatchesByUniversalIdentifier,
              objectMetadataByUniversalIdentifier:
                objectMetadataByDesiredUniversalIdentifier,
            }),
          ),
      ).map((desiredNavigationMenuItem) =>
        this.getNavigationMenuItemLabel({
          desiredNavigationMenuItem,
          objectMetadataByUniversalIdentifier:
            objectMetadataByDesiredUniversalIdentifier,
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

  private buildObjectMetadataByDesiredUniversalIdentifier({
    objectMetadataByActualUniversalIdentifier,
    objectMetadataByNameSingular,
  }: {
    objectMetadataByActualUniversalIdentifier: Map<
      string,
      ObjectMetadataEntity
    >;
    objectMetadataByNameSingular: Map<string, ObjectMetadataEntity>;
  }): Map<string, ObjectMetadataEntity> {
    const objectMetadataByDesiredUniversalIdentifier = new Map<
      string,
      ObjectMetadataEntity
    >();

    for (const desiredObject of BROKERAGE_ADOPTION_OBJECTS) {
      const objectMetadataByUniversalIdentifier =
        objectMetadataByActualUniversalIdentifier.get(
          desiredObject.universalIdentifier,
        );
      const objectMetadataByName = objectMetadataByNameSingular.get(
        desiredObject.nameSingular,
      );

      if (
        isDefined(objectMetadataByUniversalIdentifier) &&
        objectMetadataByUniversalIdentifier.nameSingular !==
          desiredObject.nameSingular
      ) {
        throw new Error(
          `Object universal identifier conflict for ${desiredObject.nameSingular}: ${desiredObject.universalIdentifier} already belongs to ${objectMetadataByUniversalIdentifier.nameSingular}`,
        );
      }

      if (
        isDefined(objectMetadataByUniversalIdentifier) &&
        isDefined(objectMetadataByName) &&
        objectMetadataByUniversalIdentifier.id !== objectMetadataByName.id
      ) {
        throw new Error(
          `Object match conflict for ${desiredObject.nameSingular}: ${desiredObject.universalIdentifier} belongs to ${objectMetadataByUniversalIdentifier.nameSingular}, but name matched ${objectMetadataByName.id}`,
        );
      }

      const objectMetadata =
        objectMetadataByUniversalIdentifier ?? objectMetadataByName;

      if (isDefined(objectMetadata)) {
        objectMetadataByDesiredUniversalIdentifier.set(
          desiredObject.universalIdentifier,
          objectMetadata,
        );
      }
    }

    for (const objectUniversalIdentifier of this.getObjectUniversalIdentifiers()) {
      if (
        objectMetadataByDesiredUniversalIdentifier.has(
          objectUniversalIdentifier,
        )
      ) {
        continue;
      }

      const objectMetadata = objectMetadataByActualUniversalIdentifier.get(
        objectUniversalIdentifier,
      );

      if (isDefined(objectMetadata)) {
        objectMetadataByDesiredUniversalIdentifier.set(
          objectUniversalIdentifier,
          objectMetadata,
        );
      }
    }

    return objectMetadataByDesiredUniversalIdentifier;
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

  private logPlan({
    plan,
    workspaceId,
    isVerbose,
  }: {
    plan: AdoptionPlan;
    workspaceId: string;
    isVerbose: boolean;
  }) {
    this.logger.log(
      `[DRY RUN] Brokerage adoption plan for workspace ${workspaceId}: ${plan.objectUpdates.length} objects, ${plan.fieldUpdates.length} fields, ${plan.navigationMenuItemUpdates.length} navigation items`,
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
