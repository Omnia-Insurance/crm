import { gql } from '@apollo/client';

import { INGESTION_FIELD_MAPPING_FRAGMENT } from './ingestion-field-mapping.queries';

export const CREATE_INGESTION_FIELD_MAPPING = gql`
  ${INGESTION_FIELD_MAPPING_FRAGMENT}
  mutation CreateIngestionFieldMapping(
    $input: CreateIngestionFieldMappingInput!
  ) {
    createIngestionFieldMapping(input: $input) {
      ...IngestionFieldMappingFragment
    }
  }
`;

export const CREATE_INGESTION_FIELD_MAPPINGS = gql`
  ${INGESTION_FIELD_MAPPING_FRAGMENT}
  mutation CreateIngestionFieldMappings(
    $inputs: [CreateIngestionFieldMappingInput!]!
  ) {
    createIngestionFieldMappings(inputs: $inputs) {
      ...IngestionFieldMappingFragment
    }
  }
`;

export const UPDATE_INGESTION_FIELD_MAPPING = gql`
  ${INGESTION_FIELD_MAPPING_FRAGMENT}
  mutation UpdateIngestionFieldMapping(
    $input: UpdateIngestionFieldMappingInput!
  ) {
    updateIngestionFieldMapping(input: $input) {
      ...IngestionFieldMappingFragment
    }
  }
`;

export const DELETE_INGESTION_FIELD_MAPPING = gql`
  mutation DeleteIngestionFieldMapping($id: UUID!) {
    deleteIngestionFieldMapping(id: $id)
  }
`;
