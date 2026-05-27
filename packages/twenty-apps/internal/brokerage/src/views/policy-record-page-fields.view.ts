import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  POLICY_APPLICANT_COUNT_FIELD_ID,
  POLICY_APPLICATION_ID_FIELD_ID,
  POLICY_EFFECTIVE_DATE_FIELD_ID,
  POLICY_EXPIRATION_DATE_FIELD_ID,
  POLICY_LTV_FIELD_ID,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  POLICY_PAID_THROUGH_DATE_FIELD_ID,
  POLICY_POLICY_NUMBER_FIELD_ID,
  POLICY_PREMIUM_FIELD_ID,
  POLICY_STATUS_FIELD_ID,
  POLICY_SUBMITTED_DATE_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createVisibleViewField } from 'src/views/view-helpers';

export const POLICY_RECORD_PAGE_FIELDS_VIEW_ID =
  'b185c4ee-c164-4c49-9ede-97c9250e29cc';

export default defineView({
  universalIdentifier: POLICY_RECORD_PAGE_FIELDS_VIEW_ID,
  name: 'Policy Record Page Fields',
  objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.FIELDS_WIDGET,
  visibility: ViewVisibility.WORKSPACE,
  icon: 'IconListDetails',
  position: 0,
  fields: [
    createVisibleViewField({
      universalIdentifier: '49c75d88-b5c5-4b71-8338-95464609c96d',
      fieldMetadataUniversalIdentifier: POLICY_POLICY_NUMBER_FIELD_ID,
      position: 0,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'f91813bf-a719-484b-84ec-dbe95082ccd6',
      fieldMetadataUniversalIdentifier: POLICY_STATUS_FIELD_ID,
      position: 1,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'fc8299df-8f25-4302-a08a-d24c1a3c344c',
      fieldMetadataUniversalIdentifier: POLICY_SUBMITTED_DATE_FIELD_ID,
      position: 2,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'd54346cc-7a40-4c8d-81bb-9de959e1d33d',
      fieldMetadataUniversalIdentifier: POLICY_EFFECTIVE_DATE_FIELD_ID,
      position: 3,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'ad94598e-1211-4d7d-b878-8a87c7b82b91',
      fieldMetadataUniversalIdentifier: POLICY_EXPIRATION_DATE_FIELD_ID,
      position: 4,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'fa688643-df74-46b5-a8a5-316b441c35af',
      fieldMetadataUniversalIdentifier: POLICY_PAID_THROUGH_DATE_FIELD_ID,
      position: 5,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '9d4ae75d-c3ae-41fa-8453-8ef11720e086',
      fieldMetadataUniversalIdentifier: POLICY_PREMIUM_FIELD_ID,
      position: 6,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '0973b291-2008-47ff-9048-82bfe05b2242',
      fieldMetadataUniversalIdentifier: POLICY_LTV_FIELD_ID,
      position: 7,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '6c5bba29-6e3e-45ff-ba93-37729a1c64f1',
      fieldMetadataUniversalIdentifier: POLICY_APPLICANT_COUNT_FIELD_ID,
      position: 8,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '94ce6d28-7857-41c4-8c37-f03e7a035e31',
      fieldMetadataUniversalIdentifier: POLICY_APPLICATION_ID_FIELD_ID,
      position: 9,
      size: 180,
    }),
  ],
});
