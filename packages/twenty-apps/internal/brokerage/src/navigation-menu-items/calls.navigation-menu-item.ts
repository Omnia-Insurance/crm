import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  BROKERAGE_CALLS_NAVIGATION_MENU_ITEM_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_CALLS_NAVIGATION_MENU_ITEM_ID,
  name: 'Calls',
  icon: 'IconPhone',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  position: 2,
});
