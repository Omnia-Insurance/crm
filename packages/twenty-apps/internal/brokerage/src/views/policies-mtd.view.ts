import { defineView } from 'twenty-sdk/define';

import {
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  POLICY_SUBMITTED_DATE_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createPolicyTableViewFields } from 'src/views/policy-view-fields';
import {
  createDescendingSort,
  createMonthToDateFilter,
  TABLE_VIEW_DEFAULTS,
} from 'src/views/view-helpers';

export default defineView({
  universalIdentifier: 'de2bd7a6-111a-4f2f-a79c-671e0773dbdd',
  name: 'MTD',
  objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconCalendarStats',
  position: 2,
  ...TABLE_VIEW_DEFAULTS,
  fields: createPolicyTableViewFields([
    '155a2e03-9e5b-4515-9611-52accdd3001a',
    '8998d499-67e4-4bfe-b4ee-277e63084844',
    '48d397f3-7fdf-403b-baeb-03aa870b19c9',
    '1a8ecda7-3e45-4de3-8669-51936d34987b',
    '8a8ab018-1442-4b30-8251-e52a265f6741',
    '0ba80920-3bf3-4455-af70-939ceb51cdc8',
    'ee1b273f-793d-4acf-be02-a48dad314a2b',
    '95440f03-17cf-4c0b-87cc-917875100d68',
    '22a47893-bd05-484f-bd0a-5a7b422c7aa5',
  ]),
  filters: [
    createMonthToDateFilter({
      universalIdentifier: 'b849682f-11ed-4cd1-8620-b050f223a623',
      fieldMetadataUniversalIdentifier: POLICY_SUBMITTED_DATE_FIELD_ID,
    }),
  ],
  sorts: [
    createDescendingSort({
      universalIdentifier: '54c89edb-ce21-40c7-a029-b87172758e57',
      fieldMetadataUniversalIdentifier: POLICY_SUBMITTED_DATE_FIELD_ID,
    }),
  ],
});
