import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { EntityManager, In, IsNull, Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import {
  BROKERAGE_AGENT_ROLE_FIELD_PERMISSION_ADOPTION,
  BROKERAGE_AGENT_ROLE_OBJECT_PERMISSION_ADOPTION,
  BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  BROKERAGE_ADOPTION_FIELDS,
  BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS,
  BROKERAGE_ADOPTION_OBJECTS,
  BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
  type BrokerageAdoptionNavigationMenuItem,
} from 'src/database/commands/custom/constants/brokerage-app-adoption.constants';
import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
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

type AgentRoleMemberSyncResult =
  | {
      status: 'synced';
      objectPermissionCount: number;
      fieldPermissionCount: number;
      permissionFlagCount: number;
      rowLevelPermissionPredicateCount: number;
      rowLevelPermissionPredicateGroupCount: number;
    }
  | {
      status: 'skipped';
      reason: string;
    };

type AgentRoleMemberRoleIdsRow = {
  agent_role_id: string | null;
  member_role_id: string | null;
};

type AgentRoleMemberSyncCountRow = {
  object_permissions: string;
  field_permissions: string;
  permission_flags: string;
  rls_predicates: string;
  rls_groups: string;
};

const CACHE_KEYS_TO_REFRESH = [
  'flatApplicationMaps',
  'flatObjectMetadataMaps',
  'flatFieldMetadataMaps',
  'flatNavigationMenuItemMaps',
  'flatRoleMaps',
  'flatPermissionFlagMaps',
  'flatObjectPermissionMaps',
  'flatFieldPermissionMaps',
  'flatRowLevelPermissionPredicateMaps',
  'flatRowLevelPermissionPredicateGroupMaps',
  'rolesPermissions',
  'ORMEntityMetadatas',
] satisfies WorkspaceCacheKeyName[];

const DRY_RUN_BROKERAGE_APPLICATION_ID = '00000000-0000-0000-0000-000000000000';
const JUNCTION_TARGET_FIELD_UNIVERSAL_IDENTIFIER_KEY =
  'junctionTargetFieldUniversalIdentifier';

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    ...(isJsonObject(currentSettings) ? currentSettings : {}),
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

  if (!isJsonObject(currentSettings)) {
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
    const brokerageApplicationId = await this.getOrCreateBrokerageApplicationId(
      {
        isDryRun,
        workspaceId,
      },
    );

    const plan = await this.buildAdoptionPlan({
      brokerageApplicationId,
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

    let agentRoleMemberSyncResult: AgentRoleMemberSyncResult = {
      status: 'skipped',
      reason: 'transaction did not run',
    };

    await this.objectMetadataRepository.manager.transaction(async (manager) => {
      await this.applyObjectUpdates({ manager, updates: plan.objectUpdates });
      await this.applyFieldUpdates({ manager, updates: plan.fieldUpdates });
      await this.applyNavigationMenuItemUpdates({
        manager,
        updates: plan.navigationMenuItemUpdates,
      });
      agentRoleMemberSyncResult = await this.syncAgentRoleFromMemberRole({
        brokerageApplicationId,
        manager,
        workspaceId,
      });
    });

    this.logAgentRoleMemberSyncResult({
      result: agentRoleMemberSyncResult,
      workspaceId,
    });

    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      CACHE_KEYS_TO_REFRESH,
    );
  }

  private async getOrCreateBrokerageApplicationId({
    isDryRun,
    workspaceId,
  }: {
    isDryRun: boolean;
    workspaceId: string;
  }): Promise<string> {
    const brokerageApplication =
      await this.applicationService.findByUniversalIdentifier({
        universalIdentifier: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
        workspaceId,
      });

    if (isDefined(brokerageApplication)) {
      return brokerageApplication.id;
    }

    if (isDryRun) {
      this.logger.warn(
        `[DRY RUN] Brokerage app ${BROKERAGE_APP_UNIVERSAL_IDENTIFIER} is not installed in workspace ${workspaceId}; apply will create an empty app shell before adopting metadata.`,
      );

      return DRY_RUN_BROKERAGE_APPLICATION_ID;
    }

    const createdApplication = await this.applicationService.create({
      universalIdentifier: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
      name: 'Brokerage',
      description: 'Core insurance brokerage CRM model for Twenty workspaces.',
      sourcePath: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
      sourceType: ApplicationRegistrationSourceType.LOCAL,
      workspaceId,
    });

    this.logger.log(
      `Created Brokerage app shell ${createdApplication.id} in workspace ${workspaceId} before metadata adoption.`,
    );

    return createdApplication.id;
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
    const objectMetadatas = await this.objectMetadataRepository.find({
      where: [
        {
          workspaceId,
          universalIdentifier: In(objectUniversalIdentifiers),
        },
        {
          workspaceId,
          nameSingular: In(brokerageObjectNames),
        },
      ],
    });
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
    const fields = await this.fieldMetadataRepository.find({
      where: [
        {
          workspaceId,
          objectMetadataId: In(
            objectMetadatas.map((objectMetadata) => objectMetadata.id),
          ),
        },
        {
          workspaceId,
          universalIdentifier: In(fieldUniversalIdentifiers),
        },
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

    const navigationMenuItems = await this.navigationMenuItemRepository.find({
      where: { workspaceId, userWorkspaceId: IsNull() },
    });

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
        {
          applicationId: update.nextApplicationId,
          universalIdentifier: update.nextUniversalIdentifier,
        },
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
          settings: update.nextSettings,
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

  private async syncAgentRoleFromMemberRole({
    brokerageApplicationId,
    manager,
    workspaceId,
  }: {
    brokerageApplicationId: string;
    manager: EntityManager;
    workspaceId: string;
  }): Promise<AgentRoleMemberSyncResult> {
    const [roleIds] = await manager.query<AgentRoleMemberRoleIdsRow[]>(
      `
        SELECT
          agent_role.id::text AS agent_role_id,
          member_role.id::text AS member_role_id
        FROM core.role agent_role
        LEFT JOIN core.role member_role
          ON member_role."workspaceId" = agent_role."workspaceId"
         AND member_role.label = 'Member'
        WHERE agent_role."workspaceId" = $1
          AND agent_role."universalIdentifier" = $2
        LIMIT 1
      `,
      [workspaceId, BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER],
    );

    if (!isDefined(roleIds?.agent_role_id)) {
      return {
        status: 'skipped',
        reason: 'Brokerage Agent role was not found',
      };
    }

    if (!isDefined(roleIds.member_role_id)) {
      return {
        status: 'skipped',
        reason: 'Omnia Member role was not found',
      };
    }

    const agentRoleId = roleIds.agent_role_id;
    const memberRoleId = roleIds.member_role_id;

    await manager.query(
      `
        UPDATE core.role agent_role
        SET
          label = 'Agent',
          description = 'Agent role',
          icon = member_role.icon,
          "canUpdateAllSettings" = member_role."canUpdateAllSettings",
          "canAccessAllTools" = member_role."canAccessAllTools",
          "canReadAllObjectRecords" = member_role."canReadAllObjectRecords",
          "canUpdateAllObjectRecords" = member_role."canUpdateAllObjectRecords",
          "canSoftDeleteAllObjectRecords" =
            member_role."canSoftDeleteAllObjectRecords",
          "canDestroyAllObjectRecords" =
            member_role."canDestroyAllObjectRecords",
          "isEditable" = member_role."isEditable",
          "canBeAssignedToUsers" = member_role."canBeAssignedToUsers",
          "canBeAssignedToAgents" = member_role."canBeAssignedToAgents",
          "canBeAssignedToApiKeys" = member_role."canBeAssignedToApiKeys",
          "showAllObjectsInSidebar" = member_role."showAllObjectsInSidebar",
          "editWindowMinutes" = member_role."editWindowMinutes",
          "updatedAt" = now()
        FROM core.role member_role
        WHERE agent_role.id = $1
          AND member_role.id = $2
      `,
      [agentRoleId, memberRoleId],
    );

    await manager.query(
      `DELETE FROM core."rowLevelPermissionPredicate" WHERE "roleId" = $1`,
      [agentRoleId],
    );
    await manager.query(
      `DELETE FROM core."rowLevelPermissionPredicateGroup" WHERE "roleId" = $1`,
      [agentRoleId],
    );
    await manager.query(
      `DELETE FROM core."rolePermissionFlag" WHERE "roleId" = $1`,
      [agentRoleId],
    );
    await manager.query(
      `DELETE FROM core."fieldPermission" WHERE "roleId" = $1`,
      [agentRoleId],
    );
    await manager.query(
      `DELETE FROM core."objectPermission" WHERE "roleId" = $1`,
      [agentRoleId],
    );

    await manager.query(
      `
        INSERT INTO core."objectPermission" (
          id,
          "roleId",
          "objectMetadataId",
          "canReadObjectRecords",
          "canUpdateObjectRecords",
          "canSoftDeleteObjectRecords",
          "canDestroyObjectRecords",
          "workspaceId",
          "createdAt",
          "updatedAt",
          "showInSidebar",
          "editWindowMinutes",
          "universalIdentifier",
          "applicationId"
        )
        SELECT
          uuid_generate_v4(),
          $1,
          source_permission."objectMetadataId",
          source_permission."canReadObjectRecords",
          source_permission."canUpdateObjectRecords",
          source_permission."canSoftDeleteObjectRecords",
          source_permission."canDestroyObjectRecords",
          source_permission."workspaceId",
          now(),
          now(),
          source_permission."showInSidebar",
          source_permission."editWindowMinutes",
          uuid_generate_v4(),
          source_permission."applicationId"
        FROM core."objectPermission" source_permission
        WHERE source_permission."roleId" = $2
      `,
      [agentRoleId, memberRoleId],
    );

    await manager.query(
      `
        INSERT INTO core."fieldPermission" (
          id,
          "roleId",
          "objectMetadataId",
          "fieldMetadataId",
          "canReadFieldValue",
          "canUpdateFieldValue",
          "workspaceId",
          "createdAt",
          "updatedAt",
          "universalIdentifier",
          "applicationId"
        )
        SELECT
          uuid_generate_v4(),
          $1,
          source_permission."objectMetadataId",
          source_permission."fieldMetadataId",
          source_permission."canReadFieldValue",
          source_permission."canUpdateFieldValue",
          source_permission."workspaceId",
          now(),
          now(),
          uuid_generate_v4(),
          source_permission."applicationId"
        FROM core."fieldPermission" source_permission
        WHERE source_permission."roleId" = $2
      `,
      [agentRoleId, memberRoleId],
    );

    await manager.query(
      `
        WITH manifest_object_permissions AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb)
            AS mapping(
              "objectUniversalIdentifier" uuid,
              "universalIdentifier" uuid
            )
        )
        UPDATE core."objectPermission" object_permission
        SET
          "universalIdentifier" =
            manifest_object_permissions."universalIdentifier",
          "applicationId" = $3,
          "updatedAt" = now()
        FROM core."objectMetadata" object_metadata,
          manifest_object_permissions
        WHERE object_permission."roleId" = $1
          AND object_permission."objectMetadataId" = object_metadata.id
          AND object_metadata."universalIdentifier" =
            manifest_object_permissions."objectUniversalIdentifier"
      `,
      [
        agentRoleId,
        JSON.stringify(BROKERAGE_AGENT_ROLE_OBJECT_PERMISSION_ADOPTION),
        brokerageApplicationId,
      ],
    );

    await manager.query(
      `
        WITH manifest_field_permissions AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb)
            AS mapping(
              "objectUniversalIdentifier" uuid,
              "fieldUniversalIdentifier" uuid,
              "universalIdentifier" uuid
            )
        )
        UPDATE core."fieldPermission" field_permission
        SET
          "universalIdentifier" =
            manifest_field_permissions."universalIdentifier",
          "applicationId" = $3,
          "updatedAt" = now()
        FROM core."objectMetadata" object_metadata,
          core."fieldMetadata" field_metadata,
          manifest_field_permissions
        WHERE field_permission."roleId" = $1
          AND field_permission."objectMetadataId" = object_metadata.id
          AND field_permission."fieldMetadataId" = field_metadata.id
          AND object_metadata."universalIdentifier" =
            manifest_field_permissions."objectUniversalIdentifier"
          AND field_metadata."universalIdentifier" =
            manifest_field_permissions."fieldUniversalIdentifier"
      `,
      [
        agentRoleId,
        JSON.stringify(BROKERAGE_AGENT_ROLE_FIELD_PERMISSION_ADOPTION),
        brokerageApplicationId,
      ],
    );

    await manager.query(
      `
        INSERT INTO core."rolePermissionFlag" (
          id,
          "roleId",
          flag,
          "workspaceId",
          "createdAt",
          "updatedAt",
          "universalIdentifier",
          "applicationId",
          "permissionFlagId"
        )
        SELECT
          uuid_generate_v4(),
          $1,
          source_flag.flag,
          source_flag."workspaceId",
          now(),
          now(),
          uuid_generate_v4(),
          source_flag."applicationId",
          source_flag."permissionFlagId"
        FROM core."rolePermissionFlag" source_flag
        WHERE source_flag."roleId" = $2
      `,
      [agentRoleId, memberRoleId],
    );

    await manager.query(
      `DROP TABLE IF EXISTS brokerage_agent_member_rls_group_map`,
    );
    await manager.query(
      `
        CREATE TEMP TABLE brokerage_agent_member_rls_group_map
        ON COMMIT DROP
        AS
        SELECT
          source_group.id AS source_group_id,
          uuid_generate_v4() AS target_group_id
        FROM core."rowLevelPermissionPredicateGroup" source_group
        WHERE source_group."roleId" = $1
          AND source_group."deletedAt" IS NULL
      `,
      [memberRoleId],
    );

    await manager.query(
      `
        INSERT INTO core."rowLevelPermissionPredicateGroup" (
          "universalIdentifier",
          "applicationId",
          id,
          "parentRowLevelPermissionPredicateGroupId",
          "logicalOperator",
          "positionInRowLevelPermissionPredicateGroup",
          "workspaceId",
          "roleId",
          "createdAt",
          "updatedAt",
          "deletedAt",
          "objectMetadataId",
          scope
        )
        SELECT
          uuid_generate_v4(),
          source_group."applicationId",
          group_map.target_group_id,
          parent_group_map.target_group_id,
          source_group."logicalOperator",
          source_group."positionInRowLevelPermissionPredicateGroup",
          source_group."workspaceId",
          $1,
          now(),
          now(),
          NULL,
          source_group."objectMetadataId",
          source_group.scope
        FROM core."rowLevelPermissionPredicateGroup" source_group
        JOIN brokerage_agent_member_rls_group_map group_map
          ON group_map.source_group_id = source_group.id
        LEFT JOIN brokerage_agent_member_rls_group_map parent_group_map
          ON parent_group_map.source_group_id =
            source_group."parentRowLevelPermissionPredicateGroupId"
        WHERE source_group."roleId" = $2
          AND source_group."deletedAt" IS NULL
      `,
      [agentRoleId, memberRoleId],
    );

    await manager.query(
      `
        INSERT INTO core."rowLevelPermissionPredicate" (
          "universalIdentifier",
          "applicationId",
          id,
          "fieldMetadataId",
          "objectMetadataId",
          operand,
          value,
          "subFieldName",
          "workspaceMemberFieldMetadataId",
          "workspaceMemberSubFieldName",
          "rowLevelPermissionPredicateGroupId",
          "positionInRowLevelPermissionPredicateGroup",
          "workspaceId",
          "roleId",
          "createdAt",
          "updatedAt",
          "deletedAt",
          scope
        )
        SELECT
          uuid_generate_v4(),
          source_predicate."applicationId",
          uuid_generate_v4(),
          source_predicate."fieldMetadataId",
          source_predicate."objectMetadataId",
          source_predicate.operand,
          source_predicate.value,
          source_predicate."subFieldName",
          source_predicate."workspaceMemberFieldMetadataId",
          source_predicate."workspaceMemberSubFieldName",
          group_map.target_group_id,
          source_predicate."positionInRowLevelPermissionPredicateGroup",
          source_predicate."workspaceId",
          $1,
          now(),
          now(),
          NULL,
          source_predicate.scope
        FROM core."rowLevelPermissionPredicate" source_predicate
        LEFT JOIN brokerage_agent_member_rls_group_map group_map
          ON group_map.source_group_id =
            source_predicate."rowLevelPermissionPredicateGroupId"
        WHERE source_predicate."roleId" = $2
          AND source_predicate."deletedAt" IS NULL
      `,
      [agentRoleId, memberRoleId],
    );

    const [syncCounts] = await manager.query<AgentRoleMemberSyncCountRow[]>(
      `
        SELECT
          (
            SELECT count(*)
            FROM core."objectPermission"
            WHERE "roleId" = $1
          )::text AS object_permissions,
          (
            SELECT count(*)
            FROM core."fieldPermission"
            WHERE "roleId" = $1
          )::text AS field_permissions,
          (
            SELECT count(*)
            FROM core."rolePermissionFlag"
            WHERE "roleId" = $1
          )::text AS permission_flags,
          (
            SELECT count(*)
            FROM core."rowLevelPermissionPredicate"
            WHERE "roleId" = $1
              AND "deletedAt" IS NULL
          )::text AS rls_predicates,
          (
            SELECT count(*)
            FROM core."rowLevelPermissionPredicateGroup"
            WHERE "roleId" = $1
              AND "deletedAt" IS NULL
          )::text AS rls_groups
      `,
      [agentRoleId],
    );

    return {
      status: 'synced',
      objectPermissionCount: Number(syncCounts.object_permissions),
      fieldPermissionCount: Number(syncCounts.field_permissions),
      permissionFlagCount: Number(syncCounts.permission_flags),
      rowLevelPermissionPredicateCount: Number(syncCounts.rls_predicates),
      rowLevelPermissionPredicateGroupCount: Number(syncCounts.rls_groups),
    };
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

  private logAgentRoleMemberSyncResult({
    result,
    workspaceId,
  }: {
    result: AgentRoleMemberSyncResult;
    workspaceId: string;
  }) {
    if (result.status === 'skipped') {
      this.logger.warn(
        `Skipped Agent role sync from Omnia Member in workspace ${workspaceId}: ${result.reason}`,
      );

      return;
    }

    this.logger.log(
      `Synced Brokerage Agent role from Omnia Member in workspace ${workspaceId}: ${result.objectPermissionCount} object permissions, ${result.fieldPermissionCount} field permissions, ${result.permissionFlagCount} permission flags, ${result.rowLevelPermissionPredicateCount} RLS predicates, ${result.rowLevelPermissionPredicateGroupCount} RLS groups`,
    );
  }

  private logUpdates(label: string, updates: MetadataUpdate[]) {
    for (const update of updates) {
      this.logger.log(
        `  ${label}: ${update.label} ${update.currentUniversalIdentifier} -> ${update.nextUniversalIdentifier}`,
      );
    }
  }
}
