import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { BROKERAGE_LEADS_NAVIGATION_MENU_ITEM_ID } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: BROKERAGE_LEADS_NAVIGATION_MENU_ITEM_ID,
  name: 'Leads',
  icon: 'IconTargetArrow',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  position: 0,
});
