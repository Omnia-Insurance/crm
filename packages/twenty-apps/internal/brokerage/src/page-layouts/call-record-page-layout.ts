import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  CALL_AGENT_FIELD_ID,
  CALL_LEAD_FIELD_ID,
  CALL_LEAD_SOURCE_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { CALL_RECORD_PAGE_FIELDS_VIEW_ID } from 'src/views/call-record-page-fields.view';

export default definePageLayout({
  universalIdentifier: 'a140eed0-97c0-413d-9a25-d91a75dbbbc5',
  name: 'Call Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      universalIdentifier: '0a9a9dcc-cb64-473b-9ac3-e9fd3e045a21',
      title: 'Home',
      position: 0,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: '86eccd57-f3dd-4eba-9d31-bf928939cf5e',
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier: CALL_RECORD_PAGE_FIELDS_VIEW_ID,
            newFieldDefaultVisibility: false,
            shouldAllowUserToSeeHiddenFields: false,
          },
        },
        {
          universalIdentifier: 'c77e4bda-3efc-4636-a67b-f7fddd9ad2bd',
          title: 'Lead',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: CALL_LEAD_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
        {
          universalIdentifier: '94211876-7a9b-4e33-8e05-9ddca9a62ef4',
          title: 'Agent',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: CALL_AGENT_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
        {
          universalIdentifier: '286b9cbf-c554-4fe2-a980-49e9a8704ac1',
          title: 'Lead Source',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: CALL_LEAD_SOURCE_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
      ],
    },
    {
      universalIdentifier: 'd8ca5e36-555b-466f-b653-7a1e5785d972',
      title: 'Timeline',
      position: 100,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'bda7b373-93aa-4063-9b10-59b7a6a9a21a',
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: {
            configurationType: 'TIMELINE',
          },
        },
      ],
    },
    {
      universalIdentifier: '60909a23-f538-4826-a24f-421adad68c74',
      title: 'Tasks',
      position: 200,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '6ad2114f-5551-4785-a5e7-5b6db4f8d75c',
          title: 'Tasks',
          type: 'TASKS',
          configuration: {
            configurationType: 'TASKS',
          },
        },
      ],
    },
    {
      universalIdentifier: 'a0af8daf-60bc-4b69-b26d-939aceeb723f',
      title: 'Notes',
      position: 300,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '55830ab9-5710-40ec-b441-1c38d1a2d0b4',
          title: 'Notes',
          type: 'NOTES',
          configuration: {
            configurationType: 'NOTES',
          },
        },
      ],
    },
    {
      universalIdentifier: 'a14af0b0-cf53-4fba-abab-f1050c71e60e',
      title: 'Files',
      position: 400,
      icon: 'IconPaperclip',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'd0e4129e-fa19-4489-a4d0-ae4f7a584044',
          title: 'Files',
          type: 'FILES',
          configuration: {
            configurationType: 'FILES',
          },
        },
      ],
    },
  ],
});
