import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  TELEPHONY_AGENT_SOFTPHONE_FRONT_COMPONENT_ID,
  TELEPHONY_AGENT_SOFTPHONE_PAGE_LAYOUT_ID,
  TELEPHONY_AGENT_SOFTPHONE_PAGE_TAB_ID,
  TELEPHONY_AGENT_SOFTPHONE_PAGE_WIDGET_ID,
} from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: TELEPHONY_AGENT_SOFTPHONE_PAGE_LAYOUT_ID,
  name: 'Agent Softphone',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: TELEPHONY_AGENT_SOFTPHONE_PAGE_TAB_ID,
      title: 'Softphone',
      position: 0,
      icon: 'IconHeadset',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: TELEPHONY_AGENT_SOFTPHONE_PAGE_WIDGET_ID,
          title: 'Agent Softphone',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              TELEPHONY_AGENT_SOFTPHONE_FRONT_COMPONENT_ID,
          },
          gridPosition: {
            row: 0,
            column: 0,
            rowSpan: 12,
            columnSpan: 12,
          },
        },
      ],
    },
  ],
});
