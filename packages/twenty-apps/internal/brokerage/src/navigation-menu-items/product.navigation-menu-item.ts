import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  BROKERAGE_CARRIERS_FOLDER_NAVIGATION_MENU_ITEM_ID,
  BROKERAGE_PRODUCT_NAVIGATION_MENU_ITEM_ID,
  PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_PRODUCT_NAVIGATION_MENU_ITEM_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  folderUniversalIdentifier: BROKERAGE_CARRIERS_FOLDER_NAVIGATION_MENU_ITEM_ID,
  position: 1,
});

