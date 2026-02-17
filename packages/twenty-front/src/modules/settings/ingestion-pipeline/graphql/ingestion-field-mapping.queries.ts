import { gql } from '@apollo/client';

export const INGESTION_FIELD_MAPPING_FRAGMENT = gql`
  fragment IngestionFieldMappingFragment on IngestionFieldMapping {
    id
    pipelineId
    sourceFieldPath
    targetFieldName
    targetCompositeSubField
    transform
    relationTargetObjectName
    relationMatchFieldName
    relationAutoCreate
    position
  }
`;

export const GET_INGESTION_FIELD_MAPPINGS = gql`
  ${INGESTION_FIELD_MAPPING_FRAGMENT}
  query GetIngestionFieldMappings($pipelineId: UUID!) {
    ingestionFieldMappings(pipelineId: $pipelineId) {
      ...IngestionFieldMappingFragment
    }
  }
`;
