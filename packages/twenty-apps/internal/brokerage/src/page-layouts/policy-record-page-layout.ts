import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { POLICY_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: 'c639d6c3-e839-488c-bb0c-52ae014ae40e',
  name: 'Policy Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      universalIdentifier: '226eb750-a6e9-4068-aed6-d64d08477fdf',
      title: 'Home',
      position: 0,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: 'eefcfdb4-03db-4f3d-b802-c9f1a19cae09',
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
          },
        },
      ],
    },
    {
      universalIdentifier: '96d6fd8b-8f39-40dd-a6ea-2e94fae231bb',
      title: 'Timeline',
      position: 100,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'fb5cbadc-cd10-4105-afe5-b7112bd17c69',
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: {
            configurationType: 'TIMELINE',
          },
        },
      ],
    },
    {
      universalIdentifier: '333d46e8-2d8a-4a57-9b5e-c9c58103d1b9',
      title: 'Tasks',
      position: 200,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '1c05cab8-8d08-4f23-ad23-0e5f62debdad',
          title: 'Tasks',
          type: 'TASKS',
          configuration: {
            configurationType: 'TASKS',
          },
        },
      ],
    },
    {
      universalIdentifier: '2f53f0cc-ede2-4f75-85ed-94d3cf375343',
      title: 'Notes',
      position: 300,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '08086118-4bc8-4113-9d39-7fa5ed7a8bdd',
          title: 'Notes',
          type: 'NOTES',
          configuration: {
            configurationType: 'NOTES',
          },
        },
      ],
    },
    {
      universalIdentifier: 'c89feb37-8e53-42e2-9e84-6c7b18e620cd',
      title: 'Files',
      position: 400,
      icon: 'IconPaperclip',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '9a5b3a71-d565-497c-9e2c-6087454e28b4',
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
