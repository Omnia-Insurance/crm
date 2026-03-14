import { defineNavigationMenuItem } from 'twenty-sdk';

import {
  STATUS_CHANGE_LOGS_NAV_ID,
  STATUS_CHANGE_LOG_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: STATUS_CHANGE_LOGS_NAV_ID,
  name: 'Status Change Logs',
  icon: 'IconHistory',
  position: 6,
  viewUniversalIdentifier: STATUS_CHANGE_LOG_VIEW_ID,
});
