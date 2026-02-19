import { gql } from '@apollo/client';

export const INGESTION_LOG_FRAGMENT = gql`
  fragment IngestionLogFragment on IngestionLog {
    id
    pipelineId
    status
    triggerType
    totalRecordsReceived
    recordsCreated
    recordsUpdated
    recordsSkipped
    recordsFailed
    errors
    incomingPayload
    startedAt
    completedAt
    durationMs
  }
`;

export const GET_INGESTION_LOGS = gql`
  ${INGESTION_LOG_FRAGMENT}
  query GetIngestionLogs($pipelineId: UUID!, $limit: Int) {
    ingestionLogs(pipelineId: $pipelineId, limit: $limit) {
      ...IngestionLogFragment
    }
  }
`;
