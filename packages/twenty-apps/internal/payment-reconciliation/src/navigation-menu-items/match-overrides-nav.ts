import { defineNavigationMenuItem } from 'twenty-sdk';

import {
  MATCH_OVERRIDES_NAV_ID,
  MATCH_OVERRIDE_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: MATCH_OVERRIDES_NAV_ID,
  name: 'Match Overrides',
  icon: 'IconAdjustments',
  position: 5,
  viewUniversalIdentifier: MATCH_OVERRIDE_VIEW_ID,
});
