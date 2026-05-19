import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TELEPHONY_CALL_SESSION_OBJECT_ID,
  TELEPHONY_NAV_CALL_SESSIONS_ID,
  TELEPHONY_NAV_FOLDER_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: TELEPHONY_NAV_CALL_SESSIONS_ID,
  name: 'Call Sessions',
  icon: 'IconPhoneCalling',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: TELEPHONY_CALL_SESSION_OBJECT_ID,
  folderUniversalIdentifier: TELEPHONY_NAV_FOLDER_ID,
  position: 40,
});
