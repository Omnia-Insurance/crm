import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

interface RequestBody {
  assignmentId: string;
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const args = event.body;
  if (!args?.assignmentId) {
    return {
      error: 'release-assignment requires { assignmentId } in the request body',
    };
  }

  const client = new CoreApiClient();
  await client.mutation({
    deletePhoneAssignment: {
      __args: { id: args.assignmentId } as any,
      id: true,
    } as any,
  } as any);

  // Soft-delete only — the row stays in the table (filtered by deletedAt)
  // so any calls / SMS that referenced it via FK retain their member link.
  return { released: true, assignmentId: args.assignmentId };
};

export default defineLogicFunction({
  universalIdentifier: '48e9f52b-f957-497f-98c8-81a7ad793179',
  name: 'release-assignment',
  description:
    'Soft-delete a phone assignment. Used when an agent leaves or no longer needs a number; the phoneNumber row itself is unaffected.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/numbers/release-assignment',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
