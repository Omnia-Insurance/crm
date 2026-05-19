import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TELEPHONY_DISPOSITION_OBJECT_ID,
  TELEPHONY_NAV_DISPOSITIONS_ID,
  TELEPHONY_NAV_FOLDER_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: TELEPHONY_NAV_DISPOSITIONS_ID,
  name: 'Dispositions',
  icon: 'IconChecklist',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: TELEPHONY_DISPOSITION_OBJECT_ID,
  folderUniversalIdentifier: TELEPHONY_NAV_FOLDER_ID,
  position: 30,
});
