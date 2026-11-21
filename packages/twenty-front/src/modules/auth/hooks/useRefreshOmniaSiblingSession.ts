import { useMutation } from '@apollo/client/react';
import { useCallback } from 'react';

import { RefreshOmniaSiblingSessionDocument } from '~/generated-metadata/graphql';

// Best effort: a failed refresh only lets the dashboard cookie expire, the CRM session is unaffected.
export const useRefreshOmniaSiblingSession = (): {
  refreshOmniaSiblingSession: () => Promise<boolean>;
} => {
  const [refreshOmniaSiblingSessionMutation] = useMutation(
    RefreshOmniaSiblingSessionDocument,
  );

  const refreshOmniaSiblingSession = useCallback(async () => {
    try {
      const { data } = await refreshOmniaSiblingSessionMutation();

      return data?.refreshOmniaSiblingSession === true;
    } catch {
      return false;
    }
  }, [refreshOmniaSiblingSessionMutation]);

  return { refreshOmniaSiblingSession };
};
