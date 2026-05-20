import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  BROKERAGE_POLICIES_NAVIGATION_MENU_ITEM_ID,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_POLICIES_NAVIGATION_MENU_ITEM_ID,
  name: 'Policies',
  icon: 'IconFileText',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  position: 1,
});
