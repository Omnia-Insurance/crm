import { gql } from '@apollo/client';

import { INGESTION_PIPELINE_FRAGMENT } from './ingestion-pipeline.queries';

export const CREATE_INGESTION_PIPELINE = gql`
  ${INGESTION_PIPELINE_FRAGMENT}
  mutation CreateIngestionPipeline($input: CreateIngestionPipelineInput!) {
    createIngestionPipeline(input: $input) {
      ...IngestionPipelineFragment
    }
  }
`;

export const UPDATE_INGESTION_PIPELINE = gql`
  ${INGESTION_PIPELINE_FRAGMENT}
  mutation UpdateIngestionPipeline($input: UpdateIngestionPipelineInput!) {
    updateIngestionPipeline(input: $input) {
      ...IngestionPipelineFragment
    }
  }
`;

export const DELETE_INGESTION_PIPELINE = gql`
  ${INGESTION_PIPELINE_FRAGMENT}
  mutation DeleteIngestionPipeline($id: UUID!) {
    deleteIngestionPipeline(id: $id) {
      ...IngestionPipelineFragment
    }
  }
`;

export const TRIGGER_INGESTION_PULL = gql`
  mutation TriggerIngestionPull($pipelineId: UUID!) {
    triggerIngestionPull(pipelineId: $pipelineId) {
      id
      pipelineId
      status
      triggerType
    }
  }
`;

export const TEST_INGESTION_PIPELINE = gql`
  mutation TestIngestionPipeline($input: TestIngestionPipelineInput!) {
    testIngestionPipeline(input: $input) {
      success
      totalRecords
      validRecords
      invalidRecords
      previewRecords
      errors
    }
  }
`;
