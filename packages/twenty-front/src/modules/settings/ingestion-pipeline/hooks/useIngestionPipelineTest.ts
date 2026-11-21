import { useMutation } from '@apollo/client/react';

import { TestIngestionPipelineDocument } from '~/generated-metadata/graphql';

export const useIngestionPipelineTest = () => {
  const [testMutation, { loading }] = useMutation(
    TestIngestionPipelineDocument,
  );

  const testPipeline = async (
    pipelineId: string,
    sampleRecords: Record<string, unknown>[],
  ) => {
    const { data } = await testMutation({
      variables: { input: { pipelineId, sampleRecords } },
    });

    return data?.testIngestionPipeline ?? null;
  };

  return {
    testPipeline,
    isTestRunning: loading,
  };
};
