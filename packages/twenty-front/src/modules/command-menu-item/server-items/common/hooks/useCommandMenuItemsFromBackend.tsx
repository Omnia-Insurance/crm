import { FrontComponentCommandMenuItem } from '@/command-menu-item/display/components/FrontComponentCommandMenuItem';
import { HeadlessCommandMenuItem } from '@/command-menu-item/display/components/HeadlessCommandMenuItem';
import { commandMenuItemsSelector } from '@/command-menu-item/server-items/common/states/commandMenuItemsSelector';
import { doesCommandMenuItemMatchObjectMetadataId } from '@/command-menu-item/server-items/common/utils/doesCommandMenuItemMatchObjectMetadataId';
import { type CommandMenuItemConfig } from '@/command-menu-item/types/CommandMenuItemConfig';
import { CommandMenuItemScope } from '@/command-menu-item/types/CommandMenuItemScope';
import { CommandMenuItemType } from '@/command-menu-item/types/CommandMenuItemType';
// OMNIA-CUSTOM: import resolvers for object-aware labels and permission gate
import { resolveCreateRecordActionLabels } from '@/command-menu-item/utils/resolveCreateRecordActionLabels';
import { resolveGoToActionLabels } from '@/command-menu-item/utils/resolveGoToActionLabels';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';

import { type CommandMenuContextApi } from 'twenty-shared/types';
import {
  evaluateConditionalAvailabilityExpression,
  interpolateCommandMenuItemTemplate,
  isDefined,
} from 'twenty-shared/utils';
import { useIcons } from 'twenty-ui/display';

import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { COMMAND_MENU_DEFAULT_ICON } from '@/workflow/workflow-trigger/constants/CommandMenuDefaultIcon';
import {
  CommandMenuItemAvailabilityType,
  type CommandMenuItemFieldsFragment,
  EngineComponentKey,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

type CommandMenuItemWithFrontComponent = CommandMenuItemFieldsFragment & {
  frontComponentId: string;
  conditionalAvailabilityExpression?: string | null;
};

type CommandMenuItemWithSource = CommandMenuItemFieldsFragment & {
  conditionalAvailabilityExpression?: string | null;
};

type BuildCommandMenuItemFromFrontComponentParams = {
  item: CommandMenuItemWithFrontComponent;
  type?: CommandMenuItemType;
  scope: CommandMenuItemScope;
  isPinned: boolean;
  getIcon: ReturnType<typeof useIcons>['getIcon'];
  commandMenuContextApi: CommandMenuContextApi;
};

const buildCommandMenuItemFromFrontComponent = ({
  item,
  type = CommandMenuItemType.FrontComponent,
  scope,
  isPinned,
  getIcon,
  commandMenuContextApi,
}: BuildCommandMenuItemFromFrontComponentParams): CommandMenuItemConfig => {
  const displayLabel = interpolateCommandMenuItemTemplate({
    label: item.label,
    context: commandMenuContextApi,
  });

  const displayShortLabel = interpolateCommandMenuItemTemplate({
    label: item.shortLabel,
    context: commandMenuContextApi,
  });

  const interpolatedIcon = interpolateCommandMenuItemTemplate({
    label: item.icon,
    context: commandMenuContextApi,
  });

  const Icon = getIcon(interpolatedIcon, COMMAND_MENU_DEFAULT_ICON);

  const isHeadless = item.frontComponent?.isHeadless === true;

  return {
    type,
    key: `command-menu-item-front-component-${item.id}`,
    id: item.id,
    scope,
    label: displayLabel,
    shortLabel: displayShortLabel,
    position: item.position,
    isPinned,
    Icon,
    hotKeys: item.hotKeys,
    component: isHeadless ? (
      <HeadlessCommandMenuItem item={item} />
    ) : (
      <FrontComponentCommandMenuItem frontComponentId={item.frontComponentId} />
    ),
  };
};

type BuildCommandMenuItemFromStandardKeyParams = {
  item: CommandMenuItemWithSource;
  type?: CommandMenuItemType;
  scope: CommandMenuItemScope;
  isPinned: boolean;
  getIcon: ReturnType<typeof useIcons>['getIcon'];
  commandMenuContextApi: CommandMenuContextApi;
};

const buildCommandItemFromEngineKey = ({
  item,
  type = CommandMenuItemType.Standard,
  scope,
  isPinned,
  getIcon,
  commandMenuContextApi,
}: BuildCommandMenuItemFromStandardKeyParams): CommandMenuItemConfig => {
  const interpolatedIcon = interpolateCommandMenuItemTemplate({
    label: item.icon,
    context: commandMenuContextApi,
  });
  const Icon = getIcon(interpolatedIcon, COMMAND_MENU_DEFAULT_ICON);

  return {
    type,
    // OMNIA-CUSTOM: use engineComponentKey as key so resolvers can match on it
    key: item.engineComponentKey ?? `command-menu-item-engine-${item.id}`,
    id: item.id,
    scope,
    label: interpolateCommandMenuItemTemplate({
      label: item.label,
      context: commandMenuContextApi,
    }),
    shortLabel: interpolateCommandMenuItemTemplate({
      label: item.shortLabel,
      context: commandMenuContextApi,
    }),
    position: item.position,
    isPinned,
    Icon,
    hotKeys: item.hotKeys,
    component: <HeadlessCommandMenuItem item={item} />,
  };
};

export const useCommandMenuItemsFromBackend = (
  commandMenuContextApi: CommandMenuContextApi,
): CommandMenuItemConfig[] => {
  const { getIcon } = useIcons();
  const currentObjectMetadataItemId =
    commandMenuContextApi.objectMetadataItem.id;

  const hasRecordSelection = commandMenuContextApi.numberOfSelectedRecords >= 1;

  const commandMenuItems = useAtomStateValue(commandMenuItemsSelector);

  // OMNIA-CUSTOM: object metadata for label resolution and permission gating
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const currentObjectMetadataItem = objectMetadataItems.find(
    (item) => item.id === currentObjectMetadataItemId,
  );
  const permissionMap = usePermissionFlagMap();

  const itemsWithObjectMatches = commandMenuItems.filter(
    doesCommandMenuItemMatchObjectMetadataId(currentObjectMetadataItemId),
  );
  const availableItems = itemsWithObjectMatches.filter((item) =>
    evaluateConditionalAvailabilityExpression(
      item.conditionalAvailabilityExpression,
      commandMenuContextApi,
    ),
  );

  const buildCommandMenuItem = ({
    item,
    scope,
    isPinned,
    typeOverride,
  }: {
    item: CommandMenuItemFieldsFragment;
    scope: CommandMenuItemScope;
    isPinned: boolean;
    typeOverride?: CommandMenuItemType;
  }): CommandMenuItemConfig | null => {
    if (isDefined(item.frontComponentId)) {
      return buildCommandMenuItemFromFrontComponent({
        item: item as CommandMenuItemWithFrontComponent,
        type: typeOverride,
        scope,
        isPinned,
        getIcon,
        commandMenuContextApi,
      });
    }

    if (isDefined(item.engineComponentKey)) {
      return buildCommandItemFromEngineKey({
        item,
        type: typeOverride,
        scope,
        isPinned,
        getIcon,
        commandMenuContextApi,
      });
    }

    return null;
  };

  const globalItems = availableItems.filter(
    (item) => item.availabilityType === CommandMenuItemAvailabilityType.GLOBAL,
  );

  const recordScopedItems = availableItems.filter(
    (item) =>
      item.availabilityType ===
      CommandMenuItemAvailabilityType.RECORD_SELECTION,
  );

  const fallbackItems = availableItems.filter(
    (item) =>
      item.availabilityType === CommandMenuItemAvailabilityType.FALLBACK,
  );

  const globalCommandMenuItems = globalItems
    .map((item) =>
      buildCommandMenuItem({
        item,
        scope: CommandMenuItemScope.Global,
        isPinned: item.isPinned,
      }),
    )
    .filter(isDefined);

  const recordScopedCommandMenuItems = hasRecordSelection
    ? recordScopedItems
        .map((item) =>
          buildCommandMenuItem({
            item,
            scope: CommandMenuItemScope.RecordSelection,
            isPinned: item.isPinned,
          }),
        )
        .filter(isDefined)
    : [];

  const fallbackCommandMenuItems = fallbackItems
    .map((item) =>
      buildCommandMenuItem({
        item,
        scope: CommandMenuItemScope.Global,
        isPinned: false,
        typeOverride: CommandMenuItemType.Fallback,
      }),
    )
    .filter(isDefined);

  const allItems = [
    ...globalCommandMenuItems,
    ...recordScopedCommandMenuItems,
    ...fallbackCommandMenuItems,
  ].sort((a, b) => a.position - b.position);

  // OMNIA-CUSTOM: apply object-aware label resolution and permission gating
  // 1. "Create Policy" instead of generic "Create Record", with blue accent CTA
  const withCreateLabels = resolveCreateRecordActionLabels(
    allItems,
    currentObjectMetadataItem,
  );

  // 2. "Go to Policies" with deactivated objects filtered out
  const withGoToLabels = resolveGoToActionLabels(
    withCreateLabels,
    objectMetadataItems,
  );

  // 3. Gate command menu items behind role permissions
  // Maps engine component keys to required permission flags.
  const permissionGatedKeys: Record<string, PermissionFlagType> = {
    [EngineComponentKey.EDIT_RECORD_PAGE_LAYOUT]: PermissionFlagType.LAYOUTS,
    [EngineComponentKey.IMPORT_RECORDS]: PermissionFlagType.IMPORT_CSV,
    [EngineComponentKey.EXPORT_RECORDS]: PermissionFlagType.EXPORT_CSV,
    [EngineComponentKey.EXPORT_VIEW]: PermissionFlagType.EXPORT_CSV,
    [EngineComponentKey.ASK_AI]: PermissionFlagType.AI,
    [EngineComponentKey.VIEW_PREVIOUS_AI_CHATS]: PermissionFlagType.AI,
  };

  return withGoToLabels.filter((item) => {
    const requiredPermission = permissionGatedKeys[item.key];
    if (requiredPermission && !permissionMap[requiredPermission]) {
      return false;
    }
    return true;
  });
};
