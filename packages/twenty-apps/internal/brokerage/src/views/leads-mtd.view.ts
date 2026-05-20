import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { createLeadTableViewFields } from 'src/views/lead-view-fields';
import {
  createDescendingSort,
  createMonthToDateFilter,
  TABLE_VIEW_DEFAULTS,
} from 'src/views/view-helpers';

const PERSON_FIELDS = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields;

export default defineView({
  universalIdentifier: '8beab4fe-cf93-4ff0-b262-d9887cf79615',
  name: 'MTD',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  icon: 'IconCalendarStats',
  position: 2,
  ...TABLE_VIEW_DEFAULTS,
  fields: createLeadTableViewFields([
    '502b0b0d-581c-4c98-8041-5ca80ed67651',
    '1aa344c3-5d2b-4532-8bf3-918ec9e303f6',
    '40af6c3a-83e8-4e5a-962b-ac9a73d4436b',
    'db4d891d-a886-4cc1-91a3-23d3568dd6c2',
    'c6756acb-14bc-41c2-bad0-a1945a0af6a3',
    'aa86c8bd-a092-40fc-9b3d-8e9219af9eed',
    'd57a3f64-1458-45f8-bfd9-65d7fdb96f73',
    'c58b2c42-4d8a-41d8-b7e9-c13c226585be',
  ]),
  filters: [
    createMonthToDateFilter({
      universalIdentifier: '9bdfb675-5b20-4e48-bce2-adc457092fa9',
      fieldMetadataUniversalIdentifier:
        PERSON_FIELDS.createdAt.universalIdentifier,
    }),
  ],
  sorts: [
    createDescendingSort({
      universalIdentifier: '78b25ac7-504d-4aea-a127-f323a58b4924',
      fieldMetadataUniversalIdentifier:
        PERSON_FIELDS.createdAt.universalIdentifier,
    }),
  ],
});
