import { defineNavigationMenuItem } from 'twenty-sdk';

import {
  CRM_POLICY_MIRROR_NAV_ID,
  CRM_POLICY_MIRROR_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: CRM_POLICY_MIRROR_NAV_ID,
  name: 'CRM Policy Mirrors',
  icon: 'IconCopy',
  position: 3,
  viewUniversalIdentifier: CRM_POLICY_MIRROR_VIEW_ID,
});
