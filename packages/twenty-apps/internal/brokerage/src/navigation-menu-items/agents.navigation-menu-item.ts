import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  BROKERAGE_AGENTS_NAVIGATION_MENU_ITEM_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_AGENTS_NAVIGATION_MENU_ITEM_ID,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  position: 4,
});

