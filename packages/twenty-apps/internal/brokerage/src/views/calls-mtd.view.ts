import { defineView } from 'twenty-sdk/define';

import {
  CALL_DATE_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { createCallTableViewFields } from 'src/views/call-view-fields';
import {
  createDescendingSort,
  createMonthToDateFilter,
  TABLE_VIEW_DEFAULTS,
} from 'src/views/view-helpers';

export default defineView({
  universalIdentifier: 'bc3e5349-4231-45d1-88eb-e04c31eafb69',
  name: 'MTD',
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconCalendarStats',
  position: 2,
  ...TABLE_VIEW_DEFAULTS,
  fields: createCallTableViewFields([
    '3977979a-f9c1-4533-a7d3-c8692f34e3e1',
    'a451d9be-a96d-43f4-b8a0-abe9c2a3ec72',
    '16e15063-dbaa-458e-acfb-2430c6b380a7',
    '5f75ac82-5277-47c2-95bc-5b85b7f7622a',
    'af66948f-e79b-4c42-b7aa-8b3c03ef2e27',
    '05edb219-ea89-4abd-87c5-c3796d653731',
    '4bb960a3-5ccf-44eb-86c6-3ec86c3490ee',
    '5dffde71-da1f-4a6d-aee0-a6834b95be85',
    '49154f22-98bb-4842-aaa0-5efaa429d97a',
  ]),
  filters: [
    createMonthToDateFilter({
      universalIdentifier: 'e468fa94-8768-41c0-94c4-5118a18570fd',
      fieldMetadataUniversalIdentifier: CALL_DATE_FIELD_ID,
    }),
  ],
  sorts: [
    createDescendingSort({
      universalIdentifier: 'f394a087-73c2-4287-be7d-2711b68a3393',
      fieldMetadataUniversalIdentifier: CALL_DATE_FIELD_ID,
    }),
  ],
});
