import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
  TELEPHONY_NAV_FOLDER_ID,
  TELEPHONY_NAV_INBOUND_QUEUES_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: TELEPHONY_NAV_INBOUND_QUEUES_ID,
  name: 'Inbound Queues',
  icon: 'IconPhoneIncoming',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: TELEPHONY_INBOUND_QUEUE_OBJECT_ID,
  folderUniversalIdentifier: TELEPHONY_NAV_FOLDER_ID,
  position: 70,
});
