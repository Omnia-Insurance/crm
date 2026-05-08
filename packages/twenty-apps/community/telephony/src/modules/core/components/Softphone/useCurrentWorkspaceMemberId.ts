import { useEffect, useState } from 'react';
import { useUserId } from 'twenty-sdk/front-component';
import { CoreApiClient } from 'twenty-client-sdk/core';

// Twenty's `useUserId()` returns the user id, but the telephony stack
// (PhoneAssignment, TwiML `<Client>{id}</Client>`, Voice SDK identity) is
// keyed on workspaceMember id. This hook bridges the two with a single
// query that resolves the active member for the current user.

export function useCurrentWorkspaceMemberId(): string | null {
  const userId = useUserId();
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setMemberId(null);
      return;
    }

    let cancelled = false;
    const client = new CoreApiClient();

    void (async () => {
      try {
        const result = (await client.query({
          workspaceMembers: {
            __args: {
              filter: { userId: { eq: userId } },
              first: 1,
            },
            edges: { node: { id: true } },
          },
        } as any)) as any;
        if (cancelled) return;
        setMemberId(result?.workspaceMembers?.edges?.[0]?.node?.id ?? null);
      } catch (e) {
        if (!cancelled) {
          console.error('[softphone] workspaceMember lookup failed', e);
          setMemberId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return memberId;
}
