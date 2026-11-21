import { useQuery } from '@apollo/client/react';

import { GetIngestionPipelinesDocument } from '~/generated-metadata/graphql';

export const useIngestionPipelines = () => {
  const { data, loading, error, refetch } = useQuery(
    GetIngestionPipelinesDocument,
  );

  return {
    pipelines: data?.ingestionPipelines ?? [],
    loading,
    error,
    refetch,
  };
};
