import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  TELEPHONY_NAV_CAMPAIGN_LEADS_ID,
  TELEPHONY_NAV_FOLDER_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: TELEPHONY_NAV_CAMPAIGN_LEADS_ID,
  name: 'Campaign Leads',
  icon: 'IconTargetArrow',
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: TELEPHONY_CAMPAIGN_LEAD_OBJECT_ID,
  folderUniversalIdentifier: TELEPHONY_NAV_FOLDER_ID,
  position: 20,
});
