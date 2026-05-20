import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  BROKERAGE_CARRIER_NAVIGATION_MENU_ITEM_ID,
  BROKERAGE_CARRIERS_FOLDER_NAVIGATION_MENU_ITEM_ID,
  CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_CARRIER_NAVIGATION_MENU_ITEM_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
  folderUniversalIdentifier: BROKERAGE_CARRIERS_FOLDER_NAVIGATION_MENU_ITEM_ID,
  position: 0,
});

