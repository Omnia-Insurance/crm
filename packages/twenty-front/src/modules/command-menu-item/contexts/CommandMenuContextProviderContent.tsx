import {
  CommandMenuContext,
  type CommandMenuContextType,
} from '@/command-menu-item/contexts/CommandMenuContext';
import { commandMenuItemsSelector } from '@/command-menu-item/states/commandMenuItemsSelector';
// OMNIA-CUSTOM: import resolvers for object-aware labels and permission gate
import { resolveCreateRecordActionLabels } from '@/command-menu-item/utils/resolveCreateRecordActionLabels';
import { resolveGoToActionLabels } from '@/command-menu-item/utils/resolveGoToActionLabels';
import { doesCommandMenuItemMatchObjectMetadataId } from '@/command-menu-item/utils/doesCommandMenuItemMatchObjectMetadataId';
import { doesCommandMenuItemMatchPageLayoutId } from '@/command-menu-item/utils/doesCommandMenuItemMatchPageLayoutId';
import { doesCommandMenuItemMatchPageType } from '@/command-menu-item/utils/doesCommandMenuItemMatchPageType';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { currentPageLayoutIdState } from '@/page-layout/states/currentPageLayoutIdState';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMemo } from 'react';
import { type CommandMenuContextApi } from 'twenty-shared/types';
import { evaluateConditionalAvailabilityExpression } from 'twenty-shared/utils';
import {
  EngineComponentKey,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

type CommandMenuContextProviderContentProps = {
  displayType: CommandMenuContextType['displayType'];
  containerType: CommandMenuContextType['containerType'];
  children: React.ReactNode;
  commandMenuContextApi: CommandMenuContextApi;
};

export const CommandMenuContextProviderContent = ({
  displayType,
  containerType,
  children,
  commandMenuContextApi,
}: CommandMenuContextProviderContentProps) => {
  const commandMenuItems = useAtomStateValue(commandMenuItemsSelector);
  const currentPageLayoutId = useAtomStateValue(currentPageLayoutIdState);

  // OMNIA-CUSTOM: object metadata for label resolution and permission gating
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const permissionMap = usePermissionFlagMap();

  // OMNIA-CUSTOM: permission-gated engine component keys
  const permissionGatedKeys: Record<string, PermissionFlagType> = useMemo(
    () => ({
      [EngineComponentKey.EDIT_RECORD_PAGE_LAYOUT]: PermissionFlagType.LAYOUTS,
      [EngineComponentKey.IMPORT_RECORDS]: PermissionFlagType.IMPORT_CSV,
      [EngineComponentKey.EXPORT_RECORDS]: PermissionFlagType.EXPORT_CSV,
      [EngineComponentKey.EXPORT_VIEW]: PermissionFlagType.EXPORT_CSV,
      [EngineComponentKey.ASK_AI]: PermissionFlagType.AI,
      [EngineComponentKey.VIEW_PREVIOUS_AI_CHATS]: PermissionFlagType.AI,
    }),
    [],
  );

  const filteredCommandMenuItems = useMemo(() => {
    const currentObjectMetadataItemId =
      commandMenuContextApi.objectMetadataItem.id;

    const currentObjectMetadataItem = objectMetadataItems.find(
      (item) => item.id === currentObjectMetadataItemId,
    );

    let items = commandMenuItems
      .filter(
        doesCommandMenuItemMatchObjectMetadataId(currentObjectMetadataItemId),
      )
      .filter(doesCommandMenuItemMatchPageType(commandMenuContextApi.pageType))
      .filter(doesCommandMenuItemMatchPageLayoutId(currentPageLayoutId))
      .filter((item) =>
        evaluateConditionalAvailabilityExpression(
          item.conditionalAvailabilityExpression,
          commandMenuContextApi,
        ),
      );

    // OMNIA-CUSTOM: apply object-aware create-record labels (e.g. "Create Policy")
    items = resolveCreateRecordActionLabels(items, currentObjectMetadataItem);

    // OMNIA-CUSTOM: apply object-aware Go To labels and filter deactivated objects
    items = resolveGoToActionLabels(items, objectMetadataItems);

    // OMNIA-CUSTOM: gate command menu items behind role permission flags
    items = items.filter((item) => {
      const engineKey = item.engineComponentKey;
      if (!engineKey) return true;
      const requiredPermission = permissionGatedKeys[engineKey];
      if (requiredPermission && !permissionMap[requiredPermission]) {
        return false;
      }
      return true;
    });

    return items.sort(
      (firstItem, secondItem) => firstItem.position - secondItem.position,
    );
  }, [
    commandMenuItems,
    commandMenuContextApi,
    currentPageLayoutId,
    objectMetadataItems,
    permissionGatedKeys,
    permissionMap,
  ]);

  return (
    <CommandMenuContext.Provider
      value={{
        displayType,
        containerType,
        commandMenuItems: filteredCommandMenuItems,
        commandMenuContextApi,
      }}
    >
      {children}
    </CommandMenuContext.Provider>
  );
};
