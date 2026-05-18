import { graphqlRequest } from 'src/utils/graphql-client';
import { getErrorMessage } from 'src/utils/error-message';
import { type FullNameValue } from 'src/utils/records';

export type ResolvedQaManager = {
  qaManagerId?: string;
  workspaceMemberId?: string;
  name?: string;
  warning?: string;
};

type QaManagerNode = {
  id: string;
  name?: string | null;
  workspaceMemberId?: string | null;
  workspaceMember?: {
    id: string;
    name?: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
};

type QaManagersResponse = {
  qaManagers: {
    edges: {
      node: QaManagerNode;
    }[];
  };
};

type UpdateQaManagerResponse = {
  updateQaManager: {
    id: string;
  };
};

type AgentProfileResponse = {
  agentProfile?: {
    name?: FullNameValue | null;
  } | null;
};

type WorkspaceMemberResponse = {
  workspaceMember?: {
    id: string;
    name?: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
};

export const formatFullName = (
  name: FullNameValue | null | undefined,
): string | undefined => {
  if (typeof name === 'string') {
    const trimmedName = name.trim();

    return trimmedName.length > 0 ? trimmedName : undefined;
  }

  if (name === undefined || name === null) {
    return undefined;
  }

  const nameParts: string[] = [];
  const firstName = name.firstName?.trim();
  const lastName = name.lastName?.trim();

  if (firstName !== undefined && firstName.length > 0) {
    nameParts.push(firstName);
  }

  if (lastName !== undefined && lastName.length > 0) {
    nameParts.push(lastName);
  }

  const fullName = nameParts.join(' ');

  return fullName.length > 0 ? fullName : undefined;
};

export const resolveAgentName = async (
  agentProfileId?: string | null,
): Promise<string | undefined> => {
  if (agentProfileId === undefined || agentProfileId === null) {
    return undefined;
  }

  try {
    const data = await graphqlRequest<AgentProfileResponse>({
      tokenType: 'workspace',
      variables: { agentProfileId },
      query: `
        query ComplianceQaAgentName($agentProfileId: UUID!) {
          agentProfile(filter: { id: { eq: $agentProfileId } }) {
            name
          }
        }
      `,
    });

    return formatFullName(data.agentProfile?.name);
  } catch (error) {
    console.warn(
      '[compliance-qa] Failed to resolve agent name:',
      getErrorMessage(error),
    );

    return undefined;
  }
};

const fetchWorkspaceMemberName = async (
  workspaceMemberId: string,
): Promise<string | undefined> => {
  try {
    const data = await graphqlRequest<WorkspaceMemberResponse>({
      tokenType: 'workspace',
      variables: { workspaceMemberId },
      query: `
        query ComplianceQaWorkspaceMember($workspaceMemberId: UUID!) {
          workspaceMember(filter: { id: { eq: $workspaceMemberId } }) {
            id
            name {
              firstName
              lastName
            }
          }
        }
      `,
    });

    return formatFullName(data.workspaceMember?.name);
  } catch (error) {
    console.warn(
      '[compliance-qa] Failed to resolve workspace member name:',
      getErrorMessage(error),
    );

    return undefined;
  }
};

export const resolveQaManager = async (): Promise<ResolvedQaManager> => {
  const data = await graphqlRequest<QaManagersResponse>({
    tokenType: 'app',
    query: `
      query ComplianceQaManagers {
        qaManagers(
          filter: { isActive: { eq: true } }
          first: 100
          orderBy: [
            { assignmentOrder: AscNullsLast }
            { lastAssignedAt: AscNullsFirst }
          ]
        ) {
          edges {
            node {
              id
              name
              workspaceMemberId
              workspaceMember {
                id
                name {
                  firstName
                  lastName
                }
              }
            }
          }
        }
      }
    `,
  });

  const qaManager = data.qaManagers.edges
    .map((edge) => edge.node)
    .find(
      (node) =>
        node.workspaceMemberId !== undefined &&
        node.workspaceMemberId !== null &&
        node.workspaceMemberId.length > 0,
    );

  if (
    qaManager !== undefined &&
    qaManager.workspaceMemberId !== undefined &&
    qaManager.workspaceMemberId !== null
  ) {
    const qaManagerName =
      formatFullName(qaManager.workspaceMember?.name) ??
      qaManager.name ??
      undefined;

    return {
      qaManagerId: qaManager.id,
      workspaceMemberId: qaManager.workspaceMemberId,
      name: qaManagerName,
    };
  }

  const defaultManagerId =
    process.env.COMPLIANCE_DEFAULT_MANAGER_WORKSPACE_MEMBER_ID;

  if (defaultManagerId !== undefined && defaultManagerId.length > 0) {
    return {
      workspaceMemberId: defaultManagerId,
      name: await fetchWorkspaceMemberName(defaultManagerId),
      warning:
        'No active QA Manager records are configured; used the fallback workspace member',
    };
  }

  return {
    workspaceMemberId: defaultManagerId,
    name: undefined,
    warning:
      'No active QA Manager records are configured and no fallback workspace member is set',
  };
};

export const markQaManagerAssigned = async ({
  qaManagerId,
}: {
  qaManagerId?: string;
}): Promise<void> => {
  if (qaManagerId === undefined || qaManagerId.length === 0) {
    return;
  }

  await graphqlRequest<UpdateQaManagerResponse>({
    tokenType: 'app',
    variables: {
      id: qaManagerId,
      data: {
        lastAssignedAt: new Date().toISOString(),
      },
    },
    query: `
      mutation MarkComplianceQaManagerAssigned(
        $id: UUID!
        $data: QaManagerUpdateInput!
      ) {
        updateQaManager(id: $id, data: $data) {
          id
        }
      }
    `,
  });
};
