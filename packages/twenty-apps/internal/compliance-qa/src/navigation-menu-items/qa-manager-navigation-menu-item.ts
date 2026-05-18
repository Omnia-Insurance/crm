import { QUALITY_ASSURANCE_FOLDER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER } from 'src/navigation-menu-items/quality-assurance-folder-navigation-menu-item';
import { QA_MANAGER_VIEW_UNIVERSAL_IDENTIFIER } from 'src/views/qa-manager-view';
import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

export default defineNavigationMenuItem({
  universalIdentifier: '359cbf35-7e5f-4dc0-9216-3c92c2bca55d',
  name: 'Managers',
  icon: 'IconUserCheck',
  position: 2,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: QA_MANAGER_VIEW_UNIVERSAL_IDENTIFIER,
  folderUniversalIdentifier:
    QUALITY_ASSURANCE_FOLDER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
});
