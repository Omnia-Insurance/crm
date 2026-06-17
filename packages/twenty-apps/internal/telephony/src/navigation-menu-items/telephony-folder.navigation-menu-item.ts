import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { TELEPHONY_NAV_FOLDER_ID } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: TELEPHONY_NAV_FOLDER_ID,
  name: 'Telephony',
  icon: 'IconPhone',
  type: NavigationMenuItemType.FOLDER,
  position: 20,
});
