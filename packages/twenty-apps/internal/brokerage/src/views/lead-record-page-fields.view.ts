import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewType,
  ViewVisibility,
} from 'twenty-sdk/define';

import {
  LEAD_ADDRESS_FIELD_ID,
  LEAD_DATE_OF_BIRTH_FIELD_ID,
  LEAD_GENDER_FIELD_ID,
  LEAD_STATUS_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createVisibleViewField } from 'src/views/view-helpers';

const PERSON_FIELDS = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields;

export const LEAD_RECORD_PAGE_FIELDS_VIEW_ID =
  'e4c8e381-cf98-48a4-abe6-e07ce99c3a71';

export default defineView({
  universalIdentifier: LEAD_RECORD_PAGE_FIELDS_VIEW_ID,
  name: 'Lead Record Page Fields',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: ViewType.FIELDS_WIDGET,
  visibility: ViewVisibility.WORKSPACE,
  icon: 'IconListDetails',
  position: 0,
  fields: [
    createVisibleViewField({
      universalIdentifier: '4bf2a223-d9c0-47c8-a5e7-89eff024d312',
      fieldMetadataUniversalIdentifier: LEAD_ADDRESS_FIELD_ID,
      position: 0,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '181a799a-629f-49f5-bb02-560397f28175',
      fieldMetadataUniversalIdentifier:
        PERSON_FIELDS.emails.universalIdentifier,
      position: 1,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'cec562c3-fdf1-4bab-80bb-7897a59017da',
      fieldMetadataUniversalIdentifier:
        PERSON_FIELDS.phones.universalIdentifier,
      position: 2,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '171e603e-1fc6-4216-9ff8-c72189aaedbe',
      fieldMetadataUniversalIdentifier: LEAD_DATE_OF_BIRTH_FIELD_ID,
      position: 3,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'db5637ca-6084-4e6f-b4a9-24c3280f0c1a',
      fieldMetadataUniversalIdentifier: LEAD_GENDER_FIELD_ID,
      position: 4,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'a800c2b5-16e4-48e1-8984-dcd6b639213c',
      fieldMetadataUniversalIdentifier: LEAD_STATUS_FIELD_ID,
      position: 5,
      size: 180,
    }),
  ],
});
