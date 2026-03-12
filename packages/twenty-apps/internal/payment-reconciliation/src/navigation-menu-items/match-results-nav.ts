import { defineNavigationMenuItem } from 'twenty-sdk';

import {
  MATCH_RESULTS_NAV_ID,
  MATCH_RESULT_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: MATCH_RESULTS_NAV_ID,
  name: 'Match Results',
  icon: 'IconLink',
  position: 4,
  viewUniversalIdentifier: MATCH_RESULT_VIEW_ID,
});
