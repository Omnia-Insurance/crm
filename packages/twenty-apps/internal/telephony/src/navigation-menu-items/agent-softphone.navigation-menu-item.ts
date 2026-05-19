import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TELEPHONY_AGENT_SOFTPHONE_PAGE_LAYOUT_ID,
  TELEPHONY_NAV_FOLDER_ID,
  TELEPHONY_NAV_SOFTPHONE_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: TELEPHONY_NAV_SOFTPHONE_ID,
  name: 'Softphone',
  icon: 'IconHeadset',
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: TELEPHONY_AGENT_SOFTPHONE_PAGE_LAYOUT_ID,
  folderUniversalIdentifier: TELEPHONY_NAV_FOLDER_ID,
  position: 0,
});
