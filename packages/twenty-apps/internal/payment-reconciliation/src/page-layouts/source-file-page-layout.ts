import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk';

import {
  SOURCE_FILE_OBJECT_ID,
  SOURCE_FILE_PAGE_LAYOUT_ID,
  SOURCE_FILE_PAGE_LAYOUT_SUMMARY_TAB_ID,
  SOURCE_FILE_PAGE_LAYOUT_SUMMARY_FIELDS_WIDGET_ID,
  SOURCE_FILE_PAGE_LAYOUT_ACTIONS_TAB_ID,
  SOURCE_FILE_PAGE_LAYOUT_ACTIONS_WIDGET_ID,
  SOURCE_FILE_PAGE_LAYOUT_TIMELINE_TAB_ID,
  SOURCE_FILE_PAGE_LAYOUT_TIMELINE_WIDGET_ID,
  SOURCE_FILE_ACTIONS_FRONT_COMPONENT_ID,
} from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: SOURCE_FILE_PAGE_LAYOUT_ID,
  name: 'Source File Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  tabs: [
    {
      universalIdentifier: SOURCE_FILE_PAGE_LAYOUT_SUMMARY_TAB_ID,
      title: 'Summary',
      position: 0,
      icon: 'IconInfoCircle',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: SOURCE_FILE_PAGE_LAYOUT_SUMMARY_FIELDS_WIDGET_ID,
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
          },
        },
      ],
    },
    {
      universalIdentifier: SOURCE_FILE_PAGE_LAYOUT_ACTIONS_TAB_ID,
      title: 'Actions',
      position: 10,
      icon: 'IconPlayerPlay',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: SOURCE_FILE_PAGE_LAYOUT_ACTIONS_WIDGET_ID,
          title: 'Pipeline Actions',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              SOURCE_FILE_ACTIONS_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
    {
      universalIdentifier: SOURCE_FILE_PAGE_LAYOUT_TIMELINE_TAB_ID,
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: SOURCE_FILE_PAGE_LAYOUT_TIMELINE_WIDGET_ID,
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: {
            configurationType: 'TIMELINE',
          },
        },
      ],
    },
  ],
});
