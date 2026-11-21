import { useMutation, useQuery } from '@apollo/client/react';
import { isDefined } from 'twenty-shared/utils';

import {
  CreateIngestionFieldMappingDocument,
  CreateIngestionFieldMappingsDocument,
  type CreateIngestionFieldMappingInput,
  DeleteIngestionFieldMappingDocument,
  GetIngestionFieldMappingsDocument,
  UpdateIngestionFieldMappingDocument,
  type UpdateIngestionFieldMappingInputUpdates,
} from '~/generated-metadata/graphql';

export const useIngestionFieldMappings = (pipelineId?: string) => {
  const { data, loading, error, refetch } = useQuery(
    GetIngestionFieldMappingsDocument,
    {
      variables: { pipelineId: pipelineId ?? '' },
      skip: !isDefined(pipelineId),
    },
  );

  const [createMutation] = useMutation(CreateIngestionFieldMappingDocument);
  const [createManyMutation] = useMutation(
    CreateIngestionFieldMappingsDocument,
  );
  const [updateMutation] = useMutation(UpdateIngestionFieldMappingDocument);
  const [deleteMutation] = useMutation(DeleteIngestionFieldMappingDocument);

  const createMapping = async (input: CreateIngestionFieldMappingInput) => {
    const { data: createData } = await createMutation({
      variables: { input },
    });

    await refetch();

    return createData?.createIngestionFieldMapping;
  };

  const createManyMappings = async (
    inputs: CreateIngestionFieldMappingInput[],
  ) => {
    const { data: createData } = await createManyMutation({
      variables: { inputs },
    });

    await refetch();

    return createData?.createIngestionFieldMappings ?? [];
  };

  const updateMapping = async (
    id: string,
    update: UpdateIngestionFieldMappingInputUpdates,
  ) => {
    const { data: updateData } = await updateMutation({
      variables: { input: { id, update } },
    });

    await refetch();

    return updateData?.updateIngestionFieldMapping;
  };

  const deleteMapping = async (id: string) => {
    await deleteMutation({ variables: { id } });
    await refetch();
  };

  return {
    mappings: data?.ingestionFieldMappings ?? [],
    loading,
    error,
    refetch,
    createMapping,
    createManyMappings,
    updateMapping,
    deleteMapping,
  };
};
