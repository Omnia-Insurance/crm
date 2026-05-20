import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { BROKERAGE_CARRIERS_FOLDER_NAVIGATION_MENU_ITEM_ID } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_CARRIERS_FOLDER_NAVIGATION_MENU_ITEM_ID,
  type: NavigationMenuItemType.FOLDER,
  name: 'Carriers',
  icon: 'IconFolder',
  position: 5,
});

