import { defineView, ViewFilterOperand, ViewSortDirection } from 'twenty-sdk/define';

import {
  TD_ACTIVE_FIELD_ID,
  TD_CATEGORY_FIELD_ID,
  TD_CODE_FIELD_ID,
  TD_IS_TERMINAL_FIELD_ID,
  TD_NAME_FIELD_ID,
  TD_RETRY_DELAY_MINUTES_FIELD_ID,
  TD_SORT_ORDER_FIELD_ID,
  TELEPHONY_DISPOSITION_OBJECT_ID,
  TELEPHONY_DISPOSITIONS_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: TELEPHONY_DISPOSITIONS_VIEW_ID,
  name: 'Active Dispositions',
  objectUniversalIdentifier: TELEPHONY_DISPOSITION_OBJECT_ID,
  icon: 'IconChecklist',
  position: 1,
  fields: [
    {
      universalIdentifier: '6cf9462d-6d4a-4be1-9b3c-b8910542529e',
      fieldMetadataUniversalIdentifier: TD_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: 'fd02d3c1-bec5-4e49-b77f-c6a0e0f297f1',
      fieldMetadataUniversalIdentifier: TD_CODE_FIELD_ID,
      isVisible: true,
      size: 10,
      position: 1,
    },
    {
      universalIdentifier: 'f7a320a9-1b31-4b68-aba1-417b13514dba',
      fieldMetadataUniversalIdentifier: TD_CATEGORY_FIELD_ID,
      isVisible: true,
      size: 10,
      position: 2,
    },
    {
      universalIdentifier: '0f864309-bb5c-48cb-9110-9f81d3694508',
      fieldMetadataUniversalIdentifier: TD_RETRY_DELAY_MINUTES_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 3,
    },
    {
      universalIdentifier: 'a41a3fb1-e6ab-4769-943a-7041abd68cd0',
      fieldMetadataUniversalIdentifier: TD_IS_TERMINAL_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 4,
    },
  ],
  filters: [
    {
      universalIdentifier: '1fc409f1-8599-4eff-bec5-f7b718604937',
      fieldMetadataUniversalIdentifier: TD_ACTIVE_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: true,
    },
  ],
  sorts: [
    {
      universalIdentifier: 'b30e921d-14f1-408b-9429-b51e7cc14367',
      fieldMetadataUniversalIdentifier: TD_SORT_ORDER_FIELD_ID,
      direction: ViewSortDirection.ASC,
    },
  ],
});
