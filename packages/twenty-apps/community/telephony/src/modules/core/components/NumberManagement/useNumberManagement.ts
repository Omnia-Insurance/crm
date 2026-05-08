import { useCallback, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

// Read-side state for the CSO management UI: existing phoneNumber rows
// with their active assignment + workspaceMember, plus a list of
// workspaceMembers for the assign picker. Mutations are dispatched via
// `callRoute` so the logic-function endpoints stay the single source of
// truth for buy / release / assign / reassign.

export interface PhoneNumberRow {
  id: string;
  e164: string;
  friendlyName: string | null;
  provider: string | null;
  voiceEnabled: boolean | null;
  smsEnabled: boolean | null;
  mmsEnabled: boolean | null;
  activeAssignment: {
    id: string;
    workspaceMemberId: string | null;
    isDefault: boolean | null;
  } | null;
}

export interface MemberRow {
  id: string;
  name: { firstName: string | null; lastName: string | null } | null;
}

export const useNumberManagement = () => {
  const [numbers, setNumbers] = useState<PhoneNumberRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = new CoreApiClient();
      const [numbersRes, membersRes] = await Promise.all([
        client.query({
          phoneNumbers: {
            __args: { filter: { deletedAt: { is: 'NULL' } } } as any,
            edges: {
              node: {
                id: true,
                e164: true,
                friendlyName: true,
                provider: true,
                voiceEnabled: true,
                smsEnabled: true,
                mmsEnabled: true,
                phoneAssignments: {
                  __args: {
                    filter: { deletedAt: { is: 'NULL' } },
                  } as any,
                  edges: {
                    node: {
                      id: true,
                      workspaceMemberId: true,
                      isDefault: true,
                    },
                  },
                } as any,
              },
            },
          } as any,
        } as any),
        client.query({
          workspaceMembers: {
            edges: {
              node: {
                id: true,
                name: { firstName: true, lastName: true },
              },
            },
          } as any,
        } as any),
      ]);

      const rows: PhoneNumberRow[] = (
        (numbersRes as any)?.phoneNumbers?.edges ?? []
      ).map((edge: any) => {
        const node = edge.node;
        const activeAssignment =
          node.phoneAssignments?.edges?.[0]?.node ?? null;
        return {
          id: node.id,
          e164: node.e164,
          friendlyName: node.friendlyName,
          provider: node.provider,
          voiceEnabled: node.voiceEnabled,
          smsEnabled: node.smsEnabled,
          mmsEnabled: node.mmsEnabled,
          activeAssignment,
        };
      });
      setNumbers(rows);

      const memberRows: MemberRow[] = (
        (membersRes as any)?.workspaceMembers?.edges ?? []
      ).map((edge: any) => edge.node);
      setMembers(memberRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { numbers, members, loading, error, refresh };
};

export const callRoute = async <T = unknown>(
  path: string,
  body: object,
): Promise<T> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} returned ${res.status}`);
  }
  return (await res.json()) as T;
};

export const memberLabel = (m: MemberRow): string => {
  const first = m.name?.firstName ?? '';
  const last = m.name?.lastName ?? '';
  const full = `${first} ${last}`.trim();
  return full || m.id;
};
