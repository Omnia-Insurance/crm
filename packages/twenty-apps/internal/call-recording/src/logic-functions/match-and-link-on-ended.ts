import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-sdk/clients';

interface CallRecordingRecord {
  id: string;
  status?: string;
}

interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  platform: string;
}

const parseName = (
  fullName: string,
): { firstName: string; lastName: string } => {
  const parts = (fullName ?? '').trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
};

const getApiConfig = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token =
    process.env.TWENTY_API_KEY ?? process.env.TWENTY_APP_ACCESS_TOKEN;

  if (!apiBaseUrl || !token) {
    throw new Error(
      'Missing TWENTY_API_URL or workspace API token for cross-object lookup',
    );
  }

  return { apiBaseUrl, token };
};

const workspaceGraphql = async <T>(query: string): Promise<T> => {
  const { apiBaseUrl, token } = getApiConfig();

  const response = await fetch(`${apiBaseUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(`workspace GraphQL ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (data.errors?.length) {
    throw new Error(
      `workspace GraphQL errors: ${JSON.stringify(data.errors)}`,
    );
  }

  return data.data as T;
};

const findAgentProfileByName = async (
  firstName: string,
  lastName: string,
): Promise<string | null> => {
  if (!firstName) return null;

  const data = await workspaceGraphql<{
    agentProfiles: { edges: { node: { id: string } }[] };
  }>(`query {
    agentProfiles(
      filter: {
        name: {
          firstName: { ilike: "%${firstName}%" },
          lastName: { ilike: "%${lastName}%" }
        }
      }
      first: 1
    ) {
      edges { node { id } }
    }
  }`);

  return data.agentProfiles?.edges?.[0]?.node?.id ?? null;
};

const findLeadByName = async (
  firstName: string,
  lastName: string,
): Promise<string | null> => {
  if (!firstName) return null;

  const data = await workspaceGraphql<{
    leads: { edges: { node: { id: string } }[] };
  }>(`query {
    leads(
      filter: {
        name: {
          firstName: { ilike: "%${firstName}%" },
          lastName: { ilike: "%${lastName}%" }
        }
      }
      first: 1
    ) {
      edges { node { id } }
    }
  }`);

  return data.leads?.edges?.[0]?.node?.id ?? null;
};

const CALL_WINDOW_MS = 10 * 60 * 1000;

const findOrCreateCall = async ({
  agentId,
  leadId,
  endedAt,
  recordingName,
}: {
  agentId: string | null;
  leadId: string | null;
  endedAt: string | null;
  recordingName: string;
}): Promise<string | null> => {
  if (!endedAt || (!agentId && !leadId)) {
    return null;
  }

  const anchor = new Date(endedAt).getTime();

  if (Number.isNaN(anchor)) {
    return null;
  }

  const fromIso = new Date(anchor - CALL_WINDOW_MS).toISOString();
  const toIso = new Date(anchor + CALL_WINDOW_MS).toISOString();

  const filterParts: string[] = [
    `callDate: { gte: "${fromIso}", lte: "${toIso}" }`,
  ];

  if (agentId) filterParts.push(`agentId: { eq: "${agentId}" }`);
  if (leadId) filterParts.push(`leadId: { eq: "${leadId}" }`);

  const existing = await workspaceGraphql<{
    calls: { edges: { node: { id: string } }[] };
  }>(`query {
    calls(filter: { ${filterParts.join(', ')} }, first: 1) {
      edges { node { id } }
    }
  }`);

  const existingId = existing.calls?.edges?.[0]?.node?.id;

  if (existingId) {
    return existingId;
  }

  const dataParts: string[] = [
    `name: ${JSON.stringify(recordingName)}`,
    `callDate: "${endedAt}"`,
  ];

  if (agentId) dataParts.push(`agentId: "${agentId}"`);
  if (leadId) dataParts.push(`leadId: "${leadId}"`);

  const created = await workspaceGraphql<{
    createCall: { id: string };
  }>(`mutation {
    createCall(data: { ${dataParts.join(', ')} }) { id }
  }`);

  return created.createCall?.id ?? null;
};

const handler = async (
  params: DatabaseEventPayload<
    ObjectRecordUpdateEvent<CallRecordingRecord>
  >,
) => {
  const after = params.properties.after;

  if (after.status !== 'ENDED') {
    return;
  }

  const client = new CoreApiClient();

  const { callRecording } = (await client.query({
    callRecording: {
      __args: { filter: { id: { eq: after.id } } },
      id: true,
      name: true,
      status: true,
      endedAt: true,
      participantsRaw: true,
      agentProfileId: true,
      leadId: true,
      callId: true,
    } as any,
  } as any)) as any;

  if (!callRecording) {
    console.warn(
      `[match-and-link-on-ended] CallRecording ${after.id} not found, skipping`,
    );

    return;
  }

  if (callRecording.status !== 'ENDED') {
    return;
  }

  if (
    callRecording.agentProfileId &&
    callRecording.leadId &&
    callRecording.callId
  ) {
    return;
  }

  const participants = callRecording.participantsRaw as
    | Participant[]
    | null
    | undefined;

  if (!participants?.length) {
    console.log(
      `[match-and-link-on-ended] No participantsRaw on ${callRecording.id}, skipping`,
    );

    return;
  }

  const host = participants.find((p) => p.isHost);
  const guest = participants.find((p) => !p.isHost);

  let agentProfileId: string | null = callRecording.agentProfileId ?? null;
  let leadId: string | null = callRecording.leadId ?? null;

  if (!agentProfileId && host?.name) {
    const { firstName, lastName } = parseName(host.name);

    try {
      agentProfileId = await findAgentProfileByName(firstName, lastName);
      console.log(
        `[match-and-link-on-ended] host "${host.name}" → agentProfile=${
          agentProfileId ?? 'no-match'
        }`,
      );
    } catch (error) {
      console.error('[match-and-link-on-ended] agentProfile lookup failed:', error);
    }
  }

  if (!leadId && guest?.name) {
    const { firstName, lastName } = parseName(guest.name);

    try {
      leadId = await findLeadByName(firstName, lastName);
      console.log(
        `[match-and-link-on-ended] guest "${guest.name}" → lead=${
          leadId ?? 'no-match'
        }`,
      );
    } catch (error) {
      console.error('[match-and-link-on-ended] lead lookup failed:', error);
    }
  }

  let callId: string | null = callRecording.callId ?? null;

  if (!callId) {
    try {
      callId = await findOrCreateCall({
        agentId: agentProfileId,
        leadId,
        endedAt: callRecording.endedAt ?? null,
        recordingName: callRecording.name ?? 'Recall recording',
      });
      console.log(
        `[match-and-link-on-ended] resolved Call=${callId ?? 'none'}`,
      );
    } catch (error) {
      console.error('[match-and-link-on-ended] Call resolve/create failed:', error);
    }
  }

  const updateData: Record<string, unknown> = {};

  if (agentProfileId && !callRecording.agentProfileId) {
    updateData.agentProfileId = agentProfileId;
  }

  if (leadId && !callRecording.leadId) {
    updateData.leadId = leadId;
  }

  if (callId && !callRecording.callId) {
    updateData.callId = callId;
  }

  if (Object.keys(updateData).length === 0) {
    return;
  }

  await client.mutation({
    updateCallRecording: {
      __args: {
        id: callRecording.id,
        data: updateData as any,
      },
      id: true,
    },
  } as any);
};

export default defineLogicFunction({
  universalIdentifier: 'e7c4b1a9-3f8d-4e2a-b5c6-1d9f4a3e8b27',
  name: 'match-and-link-on-ended',
  description:
    'Matches host/guest participants to agentProfile/lead and links the recording to a workspace Call (creating one if missing) when the recording transitions to ENDED',
  timeoutSeconds: 180,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'callRecording.updated',
  },
});
