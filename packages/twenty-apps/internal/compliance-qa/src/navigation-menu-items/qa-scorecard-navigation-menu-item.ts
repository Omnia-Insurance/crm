import { QA_SCORECARD_VIEW_UNIVERSAL_IDENTIFIER } from 'src/views/qa-scorecard-view';
import { defineNavigationMenuItem } from 'twenty-sdk';

export default defineNavigationMenuItem({
  universalIdentifier: 'a2b3c4d5-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
  name: 'QA Scorecards',
  icon: 'IconClipboardCheck',
  position: 1,
  viewUniversalIdentifier: QA_SCORECARD_VIEW_UNIVERSAL_IDENTIFIER,
});
