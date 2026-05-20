import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import {
  LEAD_ASSIGNED_AGENT_FIELD_ID,
  LEAD_DATE_OF_BIRTH_FIELD_ID,
  LEAD_SOURCE_FIELD_ID,
  LEAD_STATUS_FIELD_ID,
} from 'src/constants/universal-identifiers';
import { createVisibleViewField } from 'src/views/view-helpers';

const PERSON_FIELDS = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields;

const LEAD_TABLE_FIELDS = [
  {
    fieldMetadataUniversalIdentifier: PERSON_FIELDS.name.universalIdentifier,
    size: 220,
  },
  {
    fieldMetadataUniversalIdentifier: PERSON_FIELDS.phones.universalIdentifier,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: PERSON_FIELDS.emails.universalIdentifier,
    size: 220,
  },
  {
    fieldMetadataUniversalIdentifier: LEAD_STATUS_FIELD_ID,
    size: 150,
  },
  {
    fieldMetadataUniversalIdentifier: LEAD_ASSIGNED_AGENT_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: LEAD_SOURCE_FIELD_ID,
    size: 180,
  },
  {
    fieldMetadataUniversalIdentifier: LEAD_DATE_OF_BIRTH_FIELD_ID,
    size: 150,
  },
  {
    fieldMetadataUniversalIdentifier: PERSON_FIELDS.createdAt.universalIdentifier,
    size: 170,
  },
];

export const createLeadTableViewFields = (
  universalIdentifiers: string[],
) =>
  LEAD_TABLE_FIELDS.map((field, position) =>
    createVisibleViewField({
      universalIdentifier: universalIdentifiers[position],
      fieldMetadataUniversalIdentifier: field.fieldMetadataUniversalIdentifier,
      position,
      size: field.size,
    }),
  );
