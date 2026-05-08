import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

interface RequestBody {
  phoneNumberId: string;
  workspaceMemberId: string;
  // When true, soft-deletes any existing active assignment for this number
  // before creating the new one. This is the "reassign" path the CSO uses
  // when an agent leaves or changes role.
  replaceExisting?: boolean;
  isDefault?: boolean;
  outboundCallerId?: boolean;
  webrtcEnabled?: boolean;
  forwardToPersonalNumber?: string;
}

const handler = async (event: RoutePayload<RequestBody>) => {
  const args = event.body;
  if (!args?.phoneNumberId || !args.workspaceMemberId) {
    return {
      error:
        'assign-number requires { phoneNumberId, workspaceMemberId } in the request body',
    };
  }

  const client = new CoreApiClient();

  if (args.replaceExisting) {
    const existing = (await client.query({
      phoneAssignments: {
        __args: {
          filter: {
            phoneNumberId: { eq: args.phoneNumberId },
            deletedAt: { is: 'NULL' },
          },
        } as any,
        edges: { node: { id: true } },
      } as any,
    } as any)) as any;
    const ids: string[] =
      existing?.phoneAssignments?.edges?.map((e: any) => e.node.id) ?? [];
    for (const id of ids) {
      await client.mutation({
        deletePhoneAssignment: {
          __args: { id } as any,
          id: true,
        } as any,
      } as any);
    }
  }

  // Resolve a friendly name for the row label.
  const numberRow = (await client.query({
    phoneNumber: {
      __args: { filter: { id: { eq: args.phoneNumberId } } } as any,
      id: true,
      e164: true,
    } as any,
  } as any)) as any;
  const e164 = numberRow?.phoneNumber?.e164 ?? '';

  const created = (await client.mutation({
    createPhoneAssignment: {
      __args: {
        data: {
          name: `${e164} → member`,
          phoneNumberId: args.phoneNumberId,
          workspaceMemberId: args.workspaceMemberId,
          isDefault: args.isDefault ?? false,
          outboundCallerId: args.outboundCallerId ?? true,
          webrtcEnabled: args.webrtcEnabled ?? true,
          forwardToPersonalNumber: args.forwardToPersonalNumber,
        } as any,
      },
      id: true,
    },
  } as any)) as any;

  return {
    assignmentId: created.createPhoneAssignment.id,
    replacedExisting: args.replaceExisting === true,
  };
};

export default defineLogicFunction({
  universalIdentifier: '391e435e-8f92-4017-aa74-b938b5697939',
  name: 'assign-number',
  description:
    'Assign or reassign a phone number to a workspace member. Reassignment is append-only: prior assignments are soft-deleted so historic call / SMS attribution is preserved.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/numbers/assign',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
