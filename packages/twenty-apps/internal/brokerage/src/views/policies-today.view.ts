import { defineView } from 'twenty-sdk/define';

import {
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  POLICY_SUBMITTED_DATE_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createPolicyTableViewFields } from 'src/views/policy-view-fields';
import {
  createDescendingSort,
  createTodayFilter,
  TABLE_VIEW_DEFAULTS,
} from 'src/views/view-helpers';

export default defineView({
  universalIdentifier: '8d0e9268-8c8a-4d05-8fd1-ad9e4373bbe4',
  name: 'Today',
  objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconCalendarEvent',
  position: 1,
  ...TABLE_VIEW_DEFAULTS,
  fields: createPolicyTableViewFields([
    'e2cb2941-fb6a-41c7-8c52-2ad752e534b7',
    '2fa84661-2c96-431e-a8f9-11f4f8e580bf',
    '6bd09e51-364b-4836-8e33-cdef8bfd882c',
    '819ae523-4208-4001-a5f6-21aabb1553f6',
    'd50f3bce-288c-462c-a276-b00fa1d1bd61',
    '8087b621-69e9-4c74-bb6d-d44d82b9b16e',
    'e784e68e-0436-4198-8217-bb51f2fa5a4e',
    '696c7918-91c3-417b-81e0-6ebb654473a0',
    '17d3dd3d-b764-4b06-898f-f6a6eea94556',
  ]),
  filters: [
    createTodayFilter({
      universalIdentifier: 'f921d18a-e33a-45f4-a518-de16390760d8',
      fieldMetadataUniversalIdentifier: POLICY_SUBMITTED_DATE_FIELD_ID,
    }),
  ],
  sorts: [
    createDescendingSort({
      universalIdentifier: 'd2fbfa50-d9c2-4f44-84c4-73d19386c4e5',
      fieldMetadataUniversalIdentifier: POLICY_SUBMITTED_DATE_FIELD_ID,
    }),
  ],
});
