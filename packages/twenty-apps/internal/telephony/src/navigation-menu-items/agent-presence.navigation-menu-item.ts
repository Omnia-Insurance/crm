import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  TELEPHONY_NAV_AGENT_PRESENCE_ID,
  TELEPHONY_NAV_FOLDER_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: TELEPHONY_NAV_AGENT_PRESENCE_ID,
  name: 'Agent Presence',
  icon: 'IconUserCheck',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  folderUniversalIdentifier: TELEPHONY_NAV_FOLDER_ID,
  position: 60,
});
