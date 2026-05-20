import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  BROKERAGE_LEAD_SOURCES_NAVIGATION_MENU_ITEM_ID,
  LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_LEAD_SOURCES_NAVIGATION_MENU_ITEM_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  position: 3,
});

