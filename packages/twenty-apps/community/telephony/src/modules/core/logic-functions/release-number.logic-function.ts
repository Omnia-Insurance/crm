import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { buildTwilioAdapterFromEnv } from 'src/modules/twilio/build-adapter';

interface RequestBody {
  phoneNumberId: string;
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const args = event.body;
  if (!args?.phoneNumberId) {
    return {
      error: 'release-number requires { phoneNumberId } in the request body',
    };
  }

  const client = new CoreApiClient();

  // Read the row to learn its providerNumberSid before we soft-delete.
  const result = (await client.query({
    phoneNumber: {
      __args: { filter: { id: { eq: args.phoneNumberId } } } as any,
      id: true,
      e164: true,
      providerNumberSid: true,
    } as any,
  } as any)) as any;
  const row = result?.phoneNumber;
  if (!row) {
    return { error: `phoneNumber ${args.phoneNumberId} not found` };
  }

  // Release at the provider first; if that fails we keep the workspace row
  // so the CSO can retry. Soft-delete the row only on success.
  if (row.providerNumberSid) {
    const adapter = buildTwilioAdapterFromEnv();
    await adapter.releaseNumber(row.providerNumberSid);
  }

  await client.mutation({
    deletePhoneNumber: {
      __args: { id: row.id } as any,
      id: true,
    } as any,
  } as any);

  // Active assignments for this number should also be soft-deleted so
  // `phoneAssignment WHERE deletedAt IS NULL` stays accurate.
  const assignments = (await client.query({
    phoneAssignments: {
      __args: {
        filter: {
          phoneNumberId: { eq: row.id },
          deletedAt: { is: 'NULL' },
        },
      } as any,
      edges: { node: { id: true } },
    } as any,
  } as any)) as any;

  const ids: string[] =
    assignments?.phoneAssignments?.edges?.map((e: any) => e.node.id) ?? [];
  for (const id of ids) {
    await client.mutation({
      deletePhoneAssignment: {
        __args: { id } as any,
        id: true,
      } as any,
    } as any);
  }

  return {
    released: true,
    e164: row.e164,
    deletedAssignmentCount: ids.length,
  };
};

export default defineLogicFunction({
  universalIdentifier: '4ce1fcd6-719d-43bb-afc5-ac796105c69d',
  name: 'release-number',
  description:
    'Release a phone number at the provider and soft-delete the phoneNumber + active phoneAssignment rows. Calls/SMS already attributed to the number stay intact via FK SET_NULL.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/numbers/release',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
