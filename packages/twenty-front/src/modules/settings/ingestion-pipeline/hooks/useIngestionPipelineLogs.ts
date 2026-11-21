import { useQuery } from '@apollo/client/react';
import { isDefined } from 'twenty-shared/utils';

import { GetIngestionLogsDocument } from '~/generated-metadata/graphql';

const INGESTION_LOGS_POLL_INTERVAL_MS = 10_000;

export const useIngestionPipelineLogs = (pipelineId?: string, limit = 50) => {
  const { data, loading, error, refetch } = useQuery(GetIngestionLogsDocument, {
    variables: { pipelineId: pipelineId ?? '', limit },
    skip: !isDefined(pipelineId),
    pollInterval: INGESTION_LOGS_POLL_INTERVAL_MS,
  });

  return {
    logs: data?.ingestionLogs ?? [],
    loading,
    error,
    refetch,
  };
};
