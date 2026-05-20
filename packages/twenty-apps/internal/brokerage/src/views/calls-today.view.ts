import { defineView } from 'twenty-sdk/define';

import {
  CALL_DATE_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { createCallTableViewFields } from 'src/views/call-view-fields';
import {
  createDescendingSort,
  createTodayFilter,
  TABLE_VIEW_DEFAULTS,
} from 'src/views/view-helpers';

export default defineView({
  universalIdentifier: '05deacc0-5d59-4b99-91b8-bdc3587be0ae',
  name: 'Today',
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconCalendarEvent',
  position: 1,
  ...TABLE_VIEW_DEFAULTS,
  fields: createCallTableViewFields([
    '870fffb3-1f28-425e-a753-7818567efd49',
    'b40521b0-3b8a-4619-a9f0-02b83f2dbc67',
    '70ba3be8-92f9-4018-b238-4671cbf1bf76',
    'af19b34d-6c54-4b2a-af18-e6a27010cc9c',
    '449a1539-0080-4f8b-9a88-3f71aecd780d',
    'b7d60baa-afa5-4e45-a55d-74b2120baf8a',
    '0d3d2b75-9516-4b19-9d56-6e36f0319269',
    'b5bca47a-c3eb-4550-9cdf-dfe163aa3825',
    '9c43220f-2d5c-4b37-a76c-3c5b757de3aa',
  ]),
  filters: [
    createTodayFilter({
      universalIdentifier: '5e8cd333-fa0a-4525-827e-088bebfaa508',
      fieldMetadataUniversalIdentifier: CALL_DATE_FIELD_ID,
    }),
  ],
  sorts: [
    createDescendingSort({
      universalIdentifier: '93c5b7eb-8976-452b-b449-edbb0a2fd452',
      fieldMetadataUniversalIdentifier: CALL_DATE_FIELD_ID,
    }),
  ],
});
