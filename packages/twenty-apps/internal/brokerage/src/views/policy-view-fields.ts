import {
  POLICY_AGENT_FIELD_ID,
  POLICY_CARRIER_FIELD_ID,
  POLICY_LEAD_FIELD_ID,
  POLICY_NAME_FIELD_ID,
  POLICY_POLICY_NUMBER_FIELD_ID,
  POLICY_PREMIUM_FIELD_ID,
  POLICY_PRODUCT_FIELD_ID,
  POLICY_STATUS_FIELD_ID,
  POLICY_SUBMITTED_DATE_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createVisibleViewField } from 'src/views/view-helpers';

const POLICY_TABLE_FIELDS = [
  {
    fieldMetadataUniversalIdentifier: POLICY_NAME_FIELD_ID,
    size: 240,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_POLICY_NUMBER_FIELD_ID,
    size: 170,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_STATUS_FIELD_ID,
    size: 150,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_LEAD_FIELD_ID,
    size: 200,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_AGENT_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_CARRIER_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_PRODUCT_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_PREMIUM_FIELD_ID,
    size: 140,
  },
  {
    fieldMetadataUniversalIdentifier: POLICY_SUBMITTED_DATE_FIELD_ID,
    size: 180,
  },
];

export const createPolicyTableViewFields = (
  universalIdentifiers: string[],
) =>
  POLICY_TABLE_FIELDS.map((field, position) =>
    createVisibleViewField({
      universalIdentifier: universalIdentifiers[position],
      fieldMetadataUniversalIdentifier: field.fieldMetadataUniversalIdentifier,
      position,
      size: field.size,
    }),
  );
