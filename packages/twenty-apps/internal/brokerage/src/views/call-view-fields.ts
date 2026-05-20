import {
  CALL_AGENT_FIELD_ID,
  CALL_DATE_FIELD_ID,
  CALL_DIRECTION_FIELD_ID,
  CALL_DURATION_FIELD_ID,
  CALL_LEAD_FIELD_ID,
  CALL_LEAD_SOURCE_FIELD_ID,
  CALL_NAME_FIELD_ID,
  CALL_RECORDING_FIELD_ID,
  CALL_STATUS_NAME_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createVisibleViewField } from 'src/views/view-helpers';

const CALL_TABLE_FIELDS = [
  {
    fieldMetadataUniversalIdentifier: CALL_NAME_FIELD_ID,
    size: 260,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_DIRECTION_FIELD_ID,
    size: 140,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_DATE_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_DURATION_FIELD_ID,
    size: 130,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_AGENT_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_LEAD_FIELD_ID,
    size: 200,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_LEAD_SOURCE_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_STATUS_NAME_FIELD_ID,
    size: 170,
  },
  {
    fieldMetadataUniversalIdentifier: CALL_RECORDING_FIELD_ID,
    size: 220,
  },
];

export const createCallTableViewFields = (
  universalIdentifiers: string[],
) =>
  CALL_TABLE_FIELDS.map((field, position) =>
    createVisibleViewField({
      universalIdentifier: universalIdentifiers[position],
      fieldMetadataUniversalIdentifier: field.fieldMetadataUniversalIdentifier,
      position,
      size: field.size,
    }),
  );
