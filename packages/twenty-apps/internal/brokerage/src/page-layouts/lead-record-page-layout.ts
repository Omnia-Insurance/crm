import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LEAD_ASSIGNED_AGENT_FIELD_ID,
  LEAD_CALLS_FIELD_ID,
  LEAD_FAMILY_MEMBERS_FIELD_ID,
  LEAD_POLICIES_FIELD_ID,
  LEAD_SOURCE_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { LEAD_RECORD_PAGE_FIELDS_VIEW_ID } from 'src/views/lead-record-page-fields.view';

export default definePageLayout({
  universalIdentifier: '0778e154-b9db-47f1-b359-3b34e7249ce7',
  name: 'Lead Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  tabs: [
    {
      universalIdentifier: '0d7b7c8e-bdc8-44a9-8f1b-5546aa2d2fde',
      title: 'Home',
      position: 0,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: '7a2034af-17b6-4125-a39b-d49535a219d5',
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier: LEAD_RECORD_PAGE_FIELDS_VIEW_ID,
            newFieldDefaultVisibility: false,
            shouldAllowUserToSeeHiddenFields: false,
          },
        },
        {
          universalIdentifier: '40caa6a6-ef3b-4b6e-8e0e-9a50e3ac7d7f',
          title: 'Policies',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: LEAD_POLICIES_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
        {
          universalIdentifier: 'f3b27443-64ec-4c6c-9633-0872e1e63b1c',
          title: 'Lead Source',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: LEAD_SOURCE_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
        {
          universalIdentifier: 'c17a2029-45c5-4a34-9d72-ef7be482599e',
          title: 'Assigned Agent',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: LEAD_ASSIGNED_AGENT_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
        {
          universalIdentifier: '215bc7f3-c71d-47c0-9db3-7b9ae0d9f80d',
          title: 'Calls',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: LEAD_CALLS_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
        {
          universalIdentifier: '2b4d56f4-cbb1-4b80-8f0a-5bd91a306c2d',
          title: 'Family Members',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: LEAD_FAMILY_MEMBERS_FIELD_ID,
            fieldDisplayMode: 'CARD',
          },
        },
      ],
    },
    {
      universalIdentifier: 'e2e79396-d6fa-4581-a26a-756d2922ad7e',
      title: 'Timeline',
      position: 100,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '0a93791f-a64e-4ea1-9bff-8a37168846f4',
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: {
            configurationType: 'TIMELINE',
          },
        },
      ],
    },
    {
      universalIdentifier: '16306f12-657e-4755-9ccd-4464fdf20d3d',
      title: 'Tasks',
      position: 200,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'c2bd8791-a897-4ce7-b27f-02fcb68b6b79',
          title: 'Tasks',
          type: 'TASKS',
          configuration: {
            configurationType: 'TASKS',
          },
        },
      ],
    },
    {
      universalIdentifier: '56349ba1-ed34-4be9-bd65-6ebb8760ed09',
      title: 'Notes',
      position: 300,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'f50c076c-31d0-4f7d-991a-29262f737df5',
          title: 'Notes',
          type: 'NOTES',
          configuration: {
            configurationType: 'NOTES',
          },
        },
      ],
    },
    {
      universalIdentifier: 'd88259cf-98fb-468b-bf1a-1556719470e0',
      title: 'Files',
      position: 400,
      icon: 'IconPaperclip',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'c5c9b073-4f04-4496-8574-a60dcd68e618',
          title: 'Files',
          type: 'FILES',
          configuration: {
            configurationType: 'FILES',
          },
        },
      ],
    },
    {
      universalIdentifier: '0d721b4d-313c-4a58-8c96-3083855ecf16',
      title: 'Emails',
      position: 500,
      icon: 'IconMail',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '44cabaac-0ecd-4b3b-a17c-b529c0aea66b',
          title: 'Emails',
          type: 'EMAILS',
          configuration: {
            configurationType: 'EMAILS',
          },
        },
      ],
    },
    {
      universalIdentifier: '89481d86-c7a9-4120-b9fe-434647c88e84',
      title: 'Calendar',
      position: 600,
      icon: 'IconCalendarEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'a5187d6e-141e-4d4b-9797-5baf9ce5d887',
          title: 'Calendar',
          type: 'CALENDAR',
          configuration: {
            configurationType: 'CALENDAR',
          },
        },
      ],
    },
  ],
});
