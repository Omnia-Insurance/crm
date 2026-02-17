import { gql } from '@apollo/client';

export const INGESTION_PIPELINE_FRAGMENT = gql`
  fragment IngestionPipelineFragment on IngestionPipeline {
    id
    name
    description
    mode
    targetObjectNameSingular
    webhookSecret
    sourceUrl
    sourceHttpMethod
    sourceAuthConfig
    sourceRequestConfig
    responseRecordsPath
    schedule
    dedupFieldName
    paginationConfig
    isEnabled
    createdAt
    updatedAt
    deletedAt
  }
`;

export const GET_INGESTION_PIPELINES = gql`
  ${INGESTION_PIPELINE_FRAGMENT}
  query GetIngestionPipelines {
    ingestionPipelines {
      ...IngestionPipelineFragment
    }
  }
`;

export const GET_INGESTION_PIPELINE = gql`
  ${INGESTION_PIPELINE_FRAGMENT}
  query GetIngestionPipeline($id: UUID!) {
    ingestionPipeline(id: $id) {
      ...IngestionPipelineFragment
    }
  }
`;
