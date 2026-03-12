import { defineNavigationMenuItem } from 'twenty-sdk';

import {
  SOURCE_FILES_NAV_ID,
  SOURCE_FILE_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: SOURCE_FILES_NAV_ID,
  name: 'Source Files',
  icon: 'IconFileUpload',
  position: 0,
  viewUniversalIdentifier: SOURCE_FILE_VIEW_ID,
});
