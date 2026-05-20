import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { createLeadTableViewFields } from 'src/views/lead-view-fields';
import {
  createDescendingSort,
  createTodayFilter,
  TABLE_VIEW_DEFAULTS,
} from 'src/views/view-helpers';

const PERSON_FIELDS = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields;

export default defineView({
  universalIdentifier: '88060a1f-69d5-45e7-9622-8c3aa49e8d05',
  name: 'Today',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  icon: 'IconCalendarEvent',
  position: 1,
  ...TABLE_VIEW_DEFAULTS,
  fields: createLeadTableViewFields([
    '2a258f60-8640-4414-9aa6-ecd2f052358c',
    '5de3bcd7-f398-4daa-97c6-7c5ffb6c2a84',
    '797fc638-4fe2-43ca-aaf4-23cf22fc7698',
    'b325eb5d-be6b-4b70-9b44-72f4a0679f53',
    'a83a4e49-7df3-498c-bdf4-56eb570e42c3',
    'ac558f90-ea7d-4916-a9d1-ac11bdf0471b',
    'a34377d2-2e97-477f-9ae7-71308ea6c5d8',
    'e6199378-6b9f-4ecc-9f8b-f3f5e08f400a',
  ]),
  filters: [
    createTodayFilter({
      universalIdentifier: 'd699f1d7-4726-42f1-9f15-af9dd361b61f',
      fieldMetadataUniversalIdentifier:
        PERSON_FIELDS.createdAt.universalIdentifier,
    }),
  ],
  sorts: [
    createDescendingSort({
      universalIdentifier: '9624fd29-8a93-4c99-9bab-a7224948e956',
      fieldMetadataUniversalIdentifier:
        PERSON_FIELDS.createdAt.universalIdentifier,
    }),
  ],
});
