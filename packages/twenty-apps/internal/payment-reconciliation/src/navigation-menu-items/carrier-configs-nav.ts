import { defineNavigationMenuItem } from 'twenty-sdk';

import {
  CARRIER_CONFIGS_NAV_ID,
  CARRIER_CONFIG_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: CARRIER_CONFIGS_NAV_ID,
  name: 'Carrier Configs',
  icon: 'IconSettings',
  position: 2,
  viewUniversalIdentifier: CARRIER_CONFIG_VIEW_ID,
});
