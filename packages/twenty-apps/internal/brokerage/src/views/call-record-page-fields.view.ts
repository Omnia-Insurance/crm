import { defineView, ViewType, ViewVisibility } from 'twenty-sdk/define';

import {
  CALL_BILLABLE_FIELD_ID,
  CALL_COST_FIELD_ID,
  CALL_DATE_FIELD_ID,
  CALL_DIRECTION_FIELD_ID,
  CALL_DURATION_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  CALL_QUEUE_NAME_FIELD_ID,
  CALL_RECORDING_FIELD_ID,
  CALL_STATUS_FIELD_ID,
  CALL_STATUS_NAME_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createVisibleViewField } from 'src/views/view-helpers';

export const CALL_RECORD_PAGE_FIELDS_VIEW_ID =
  '0a7c279d-7ff8-4704-a305-e881cf82a253';

export default defineView({
  universalIdentifier: CALL_RECORD_PAGE_FIELDS_VIEW_ID,
  name: 'Call Record Page Fields',
  objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.FIELDS_WIDGET,
  visibility: ViewVisibility.WORKSPACE,
  icon: 'IconListDetails',
  position: 0,
  fields: [
    createVisibleViewField({
      universalIdentifier: 'b9feb792-08db-47d4-8184-f5f89d350121',
      fieldMetadataUniversalIdentifier: CALL_DIRECTION_FIELD_ID,
      position: 0,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '7ec185df-d683-42a0-9a44-cbc45753fd10',
      fieldMetadataUniversalIdentifier: CALL_DATE_FIELD_ID,
      position: 1,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '8eb7f711-b8e5-42c6-a41f-9013cb2b3a05',
      fieldMetadataUniversalIdentifier: CALL_DURATION_FIELD_ID,
      position: 2,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '954e3bb4-ccf8-4c9c-86f5-6ca48ec2667c',
      fieldMetadataUniversalIdentifier: CALL_STATUS_NAME_FIELD_ID,
      position: 3,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '6c0749cc-b002-4fec-a7af-dca857d7e36c',
      fieldMetadataUniversalIdentifier: CALL_STATUS_FIELD_ID,
      position: 4,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'e54394b2-bc10-42a3-a303-c2516a57bac3',
      fieldMetadataUniversalIdentifier: CALL_QUEUE_NAME_FIELD_ID,
      position: 5,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'a88e11f9-be93-4136-af2f-9e7ac86b58d8',
      fieldMetadataUniversalIdentifier: CALL_COST_FIELD_ID,
      position: 6,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: '40a9dbe3-3b69-47c5-83e6-5c1e288c4fc3',
      fieldMetadataUniversalIdentifier: CALL_BILLABLE_FIELD_ID,
      position: 7,
      size: 180,
    }),
    createVisibleViewField({
      universalIdentifier: 'bcb2e20e-ac42-49b0-a09a-95d9087e9c11',
      fieldMetadataUniversalIdentifier: CALL_RECORDING_FIELD_ID,
      position: 8,
      size: 180,
    }),
  ],
});
