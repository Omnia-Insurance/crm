import { useApolloClient } from '@apollo/client/react';
import { useCallback } from 'react';
import { useToast } from 'twenty-ui/components/feedback';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { CANCEL_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/cancelImportJob';

export const useCancelImportJob = () => {
  const apolloClient = useApolloClient();
  const { enqueueToast } = useToast();

  const cancelImportJob = useCallback(
    async (importJobId: string): Promise<boolean> => {
      try {
        await apolloClient.mutate({
          mutation: CANCEL_IMPORT_JOB,
          variables: { importJobId },
          fetchPolicy: 'no-cache',
        });

        return true;
      } catch (error) {
        enqueueToast(getToastOptionsFromError({ error }));

        return false;
      }
    },
    [apolloClient, enqueueToast],
  );

  return { cancelImportJob };
};
