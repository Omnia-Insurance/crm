import { useMutation, useQuery } from '@apollo/client/react';
import { isDefined } from 'twenty-shared/utils';

import {
  CreateIngestionPipelineDocument,
  type CreateIngestionPipelineInput,
  DeleteIngestionPipelineDocument,
  GetIngestionPipelineDocument,
  GetIngestionPipelinesDocument,
  TriggerIngestionPullDocument,
  UpdateIngestionPipelineDocument,
  type UpdateIngestionPipelineInputUpdates,
} from '~/generated-metadata/graphql';

export const useIngestionPipeline = (pipelineId?: string) => {
  const { data, loading, error, refetch } = useQuery(
    GetIngestionPipelineDocument,
    {
      variables: { id: pipelineId ?? '' },
      skip: !isDefined(pipelineId),
    },
  );

  const [createMutation] = useMutation(CreateIngestionPipelineDocument, {
    refetchQueries: [{ query: GetIngestionPipelinesDocument }],
  });

  const [updateMutation] = useMutation(UpdateIngestionPipelineDocument, {
    refetchQueries: [{ query: GetIngestionPipelinesDocument }],
  });

  const [deleteMutation] = useMutation(DeleteIngestionPipelineDocument, {
    refetchQueries: [{ query: GetIngestionPipelinesDocument }],
  });

  const [triggerPullMutation] = useMutation(TriggerIngestionPullDocument);

  const createPipeline = async (input: CreateIngestionPipelineInput) => {
    const { data: createData } = await createMutation({
      variables: { input },
    });

    return createData?.createIngestionPipeline;
  };

  const updatePipeline = async (
    id: string,
    update: UpdateIngestionPipelineInputUpdates,
  ) => {
    const { data: updateData } = await updateMutation({
      variables: { input: { id, update } },
    });

    return updateData?.updateIngestionPipeline;
  };

  const deletePipeline = async (id: string) => {
    await deleteMutation({ variables: { id } });
  };

  const triggerPull = async (targetPipelineId: string) => {
    const { data: triggerData } = await triggerPullMutation({
      variables: { pipelineId: targetPipelineId },
    });

    return triggerData?.triggerIngestionPull;
  };

  return {
    pipeline: data?.ingestionPipeline ?? null,
    loading,
    error,
    refetch,
    createPipeline,
    updatePipeline,
    deletePipeline,
    triggerPull,
  };
};
