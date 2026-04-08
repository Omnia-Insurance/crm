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
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { getObjectPermissionsFromMapByObjectMetadataId } from '@/settings/roles/role-permissions/objects-permissions/utils/getObjectPermissionsFromMapByObjectMetadataId';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';

import { CommandLink } from '@/command-menu-item/display/components/CommandLink';
import { useMemo } from 'react';
import { AppPath, type CommandMenuContextApi } from 'twenty-shared/types';
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
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  // Build a set of object label plurals visible in the sidebar, for filtering Go To items.
  // This avoids hardcoding GO_TO keys — we just match the label text instead.
  const readableObjectLabelPlurals = useMemo(() => {
    const labels = new Set<string>();
    for (const item of objectMetadataItems) {
      if (!item.isActive) continue;
      const perms = getObjectPermissionsFromMapByObjectMetadataId({
        objectPermissionsByObjectMetadataId,
        objectMetadataId: item.id,
      });
      if (perms?.canReadObjectRecords !== false && perms?.showInSidebar !== false) {
        labels.add(item.labelPlural.toLowerCase());
      }
    }
    return labels;
  }, [objectMetadataItems, objectPermissionsByObjectMetadataId]);

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

  // OMNIA-CUSTOM: add synthetic "Go to" items for objects that don't have
  // server-generated Go To entries (custom objects like Policy, Lead Source, etc.)
  // Collect existing Go To items by both raw label AND resolved label.
  // "Go to People" gets resolved to "Go to Leads" by resolveGoToActionLabels,
  // so we need to check both to avoid duplicates.
  const existingGoToObjectNames = new Set<string>();
  for (const item of allItems) {
    if (typeof item.label !== 'string' || !item.label.startsWith('Go to ')) continue;
    existingGoToObjectNames.add(item.label.replace('Go to ', '').toLowerCase());
  }
  // Also add the resolved labels (e.g., People → Leads)
  for (const meta of objectMetadataItems) {
    if (existingGoToObjectNames.has(meta.labelPlural.toLowerCase()) ||
        existingGoToObjectNames.has(meta.namePlural.toLowerCase())) {
      existingGoToObjectNames.add(meta.labelPlural.toLowerCase());
    }
  }

  // Place synthetic Go To items right after existing ones
  const maxGoToPosition = allItems
    .filter((item) => typeof item.label === 'string' && item.label.startsWith('Go to '))
    .reduce((max, item) => Math.max(max, item.position), 0);

  const SIDEBAR_ORDER = ['person', 'policy', 'note', 'task'];

  const syntheticGoToItems: CommandMenuItemConfig[] = objectMetadataItems
    .filter((meta) => {
      if (!meta.isActive || meta.isSystem) return false;
      const perms = getObjectPermissionsFromMapByObjectMetadataId({
        objectPermissionsByObjectMetadataId,
        objectMetadataId: meta.id,
      });
      if (!perms?.showInSidebar) return false;
      return !existingGoToObjectNames.has(meta.labelPlural.toLowerCase());
    })
    .sort((a, b) => {
      const idxA = SIDEBAR_ORDER.indexOf(a.nameSingular);
      const idxB = SIDEBAR_ORDER.indexOf(b.nameSingular);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.labelPlural.localeCompare(b.labelPlural);
    })
    .map((meta, index) => ({
      type: CommandMenuItemType.Standard,
      key: `go-to-custom-${meta.nameSingular}`,
      id: `go-to-custom-${meta.nameSingular}`,
      scope: CommandMenuItemScope.Global,
      label: `Go to ${meta.labelPlural}`,
      shortLabel: meta.labelPlural,
      position: maxGoToPosition + 1 + index,
      isPinned: false,
      Icon: getIcon(meta.icon ?? 'IconList'),
      hotKeys: null,
      component: (
        <CommandLink
          to={AppPath.RecordIndexPage}
          params={{ objectNamePlural: meta.namePlural }}
        />
      ),
    }));

  const allItemsWithGoTo = [...allItems, ...syntheticGoToItems];

  // OMNIA-CUSTOM: apply object-aware label resolution and permission gating
  // 1. "Create Policy" instead of generic "Create Record", with blue accent CTA
  const withCreateLabels = resolveCreateRecordActionLabels(
    allItemsWithGoTo,
    currentObjectMetadataItem,
  );

  // 2. "Go to Policies" with deactivated objects filtered out
  const withGoToLabels = resolveGoToActionLabels(
    withCreateLabels,
    objectMetadataItems,
  );

  // 2b. Re-sort Go To items by sidebar order so they're grouped correctly.
  // Build labelPlural → sidebar index from object metadata.
  const labelToSidebarIndex = new Map<string, number>();
  for (const name of SIDEBAR_ORDER) {
    const meta = objectMetadataItems.find((m) => m.nameSingular === name);
    if (meta) {
      labelToSidebarIndex.set(meta.labelPlural.toLowerCase(), SIDEBAR_ORDER.indexOf(name));
    }
  }

  // Find the position range of existing Go To items
  const goToItems = withGoToLabels.filter(
    (item) => typeof item.label === 'string' && item.label.startsWith('Go to ') && item.label !== 'Go to Settings',
  );
  const nonGoToItems = withGoToLabels.filter(
    (item) => !(typeof item.label === 'string' && item.label.startsWith('Go to ')) || item.label === 'Go to Settings',
  );

  // Sort Go To items by sidebar order, then alphabetically for unlisted ones
  const sortedGoToItems = goToItems.sort((a, b) => {
    const labelA = (typeof a.label === 'string' ? a.label.replace('Go to ', '') : '').toLowerCase();
    const labelB = (typeof b.label === 'string' ? b.label.replace('Go to ', '') : '').toLowerCase();
    const idxA = labelToSidebarIndex.get(labelA) ?? 999;
    const idxB = labelToSidebarIndex.get(labelB) ?? 999;
    if (idxA !== idxB) return idxA - idxB;
    return labelA.localeCompare(labelB);
  });

  // Reassign positions so Go To items are contiguous
  const minGoToPosition = goToItems.length > 0
    ? Math.min(...goToItems.map((item) => item.position))
    : 0;
  sortedGoToItems.forEach((item, idx) => {
    item.position = minGoToPosition + idx;
  });

  const withSortedGoTo = [...nonGoToItems, ...sortedGoToItems].sort(
    (a, b) => a.position - b.position,
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

  return withSortedGoTo.filter((item) => {
    // Permission flag gate (import, export, AI, layouts)
    const requiredPermission = permissionGatedKeys[item.key];
    if (requiredPermission && !permissionMap[requiredPermission]) {
      return false;
    }

    // Go To items: hide if the target object isn't readable by the user.
    // Match by extracting the object name from the label ("Go to Workflows" → "workflows")
    if (typeof item.label === 'string' && item.label.startsWith('Go to ')) {
      const targetLabelPlural = item.label.replace('Go to ', '').toLowerCase();
      if (!readableObjectLabelPlurals.has(targetLabelPlural)) {
        return false;
      }
    }

    return true;
  });
};
