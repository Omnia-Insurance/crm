import { CoreApiClient } from 'twenty-client-sdk/core';

// Helpers for working with Twenty's standard message / messageParticipant /
// messageChannel / messageThread objects from inside this app's logic
// functions. Centralizes the GraphQL shape so the webhook dispatchers stay
// readable.
//
// All queries assume the SDK's standard collection-edge envelope and the
// upstream filter operator names (`eq`, `is: 'NULL'`, etc.).

type Client = InstanceType<typeof CoreApiClient>;

export async function findPersonByPhone(
  client: Client,
  e164: string,
): Promise<{ id: string } | null> {
  if (!e164) return null;
  const result = (await client.query({
    people: {
      __args: {
        filter: { phones: { primaryPhoneNumber: { eq: e164 } } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  } as any)) as any;
  return result?.people?.edges?.[0]?.node ?? null;
}

export async function findPhoneNumberByE164(
  client: Client,
  e164: string,
): Promise<{ id: string } | null> {
  if (!e164) return null;
  const result = (await client.query({
    phoneNumbers: {
      __args: {
        filter: { e164: { eq: e164 } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  } as any)) as any;
  return result?.phoneNumbers?.edges?.[0]?.node ?? null;
}

export async function findActiveAssignmentForNumber(
  client: Client,
  phoneNumberId: string,
): Promise<{ id: string; workspaceMemberId: string | null } | null> {
  const result = (await client.query({
    phoneAssignments: {
      __args: {
        filter: {
          phoneNumberId: { eq: phoneNumberId },
          deletedAt: { is: 'NULL' },
        },
        orderBy: [{ isDefault: 'DescNullsLast' }],
        first: 1,
      },
      edges: { node: { id: true, workspaceMemberId: true } },
    },
  } as any)) as any;
  return result?.phoneAssignments?.edges?.[0]?.node ?? null;
}

// Returns the workspaceMember whose softphone should ring when the given
// workspace number is dialed. Two-step query because the SDK filter shape
// is FK-based (filter on `phoneNumberId`), not nested-relation-based.
export async function resolveAgentForDialedNumber(
  client: Client,
  e164: string,
): Promise<{ workspaceMemberId: string } | null> {
  const number = await findPhoneNumberByE164(client, e164);
  if (!number) return null;
  const assignment = await findActiveAssignmentForNumber(client, number.id);
  if (!assignment?.workspaceMemberId) return null;
  return { workspaceMemberId: assignment.workspaceMemberId };
}

export async function findMessageChannelByHandle(
  client: Client,
  handle: string,
): Promise<{ id: string } | null> {
  if (!handle) return null;
  const result = (await client.query({
    messageChannels: {
      __args: {
        filter: { handle: { eq: handle } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  } as any)) as any;
  return result?.messageChannels?.edges?.[0]?.node ?? null;
}

export async function findMessageBySid(
  client: Client,
  providerMessageSid: string,
): Promise<{ id: string } | null> {
  if (!providerMessageSid) return null;
  const result = (await client.query({
    messages: {
      __args: {
        filter: { providerMessageSid: { eq: providerMessageSid } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  } as any)) as any;
  return result?.messages?.edges?.[0]?.node ?? null;
}

export async function createMessageThread(
  client: Client,
): Promise<{ id: string }> {
  // SMS threads have no subject; if we later want to consolidate exchanges
  // between the same two participants into one thread, that lookup goes
  // here.
  const result = (await client.mutation({
    createMessageThread: {
      __args: { data: {} },
      id: true,
    },
  } as any)) as any;
  return { id: result.createMessageThread.id };
}

export interface CreateSmsMessageArgs {
  threadId: string;
  text: string;
  direction: 'INCOMING' | 'OUTGOING';
  receivedAt: Date;
  providerMessageSid: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RECEIVED';
}

export async function createSmsMessage(
  client: Client,
  args: CreateSmsMessageArgs,
): Promise<{ id: string }> {
  const result = (await client.mutation({
    createMessage: {
      __args: {
        data: {
          text: args.text,
          direction: args.direction,
          receivedAt: args.receivedAt.toISOString(),
          messageThreadId: args.threadId,
          telephonyProvider: 'TWILIO',
          providerMessageSid: args.providerMessageSid,
          status: args.status,
        },
      },
      id: true,
    },
  } as any)) as any;
  return { id: result.createMessage.id };
}

export interface CreateMessageParticipantArgs {
  messageId: string;
  handle: string;
  role: 'FROM' | 'TO' | 'CC' | 'BCC';
  personId?: string;
  workspaceMemberId?: string;
}

export async function createMessageParticipant(
  client: Client,
  args: CreateMessageParticipantArgs,
): Promise<void> {
  const data: Record<string, unknown> = {
    messageId: args.messageId,
    handle: args.handle,
    role: args.role,
  };
  if (args.personId) data.personId = args.personId;
  if (args.workspaceMemberId) data.workspaceMemberId = args.workspaceMemberId;

  await client.mutation({
    createMessageParticipant: {
      __args: { data },
      id: true,
    },
  } as any);
}

export async function createChannelAssociation(
  client: Client,
  args: {
    messageId: string;
    messageChannelId: string;
    messageExternalId: string; // we use the providerMessageSid here
    direction: 'INCOMING' | 'OUTGOING';
  },
): Promise<void> {
  await client.mutation({
    createMessageChannelMessageAssociation: {
      __args: { data: args },
      id: true,
    },
  } as any);
}

export async function updateMessageStatus(
  client: Client,
  messageId: string,
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RECEIVED',
): Promise<void> {
  await client.mutation({
    updateMessage: {
      __args: { id: messageId, data: { status } },
      id: true,
    },
  } as any);
}
