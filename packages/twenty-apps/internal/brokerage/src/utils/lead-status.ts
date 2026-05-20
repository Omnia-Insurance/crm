import { graphqlRequest } from 'src/utils/graphql-client';

type LeadStatus = 'IDLE' | 'ASSIGNED' | 'CONTACTED' | 'SOLD';

type LeadRecord = {
  id: string;
  assignedAgentId?: string | null;
  leadStatus?: LeadStatus | null;
};

type FindLeadResponse = {
  people: {
    edges: {
      node: LeadRecord;
    }[];
  };
};

type UpdateLeadResponse = {
  updatePerson: LeadRecord;
};

const findLeadById = async (leadId: string): Promise<LeadRecord | null> => {
  const result = await graphqlRequest<FindLeadResponse>({
    variables: { leadId },
    query: `
      query FindBrokerageLead($leadId: UUID!) {
        people(filter: { id: { eq: $leadId } }, first: 1) {
          edges {
            node {
              id
              assignedAgentId
              leadStatus
            }
          }
        }
      }
    `,
  });

  return result.people.edges[0]?.node ?? null;
};

const updateLeadStatusToAssigned = async (
  leadId: string,
): Promise<LeadRecord> => {
  const result = await graphqlRequest<UpdateLeadResponse>({
    variables: {
      leadId,
      data: {
        leadStatus: 'ASSIGNED',
      },
    },
    query: `
      mutation UpdateBrokerageLeadStatus(
        $leadId: UUID!
        $data: PersonUpdateInput!
      ) {
        updatePerson(id: $leadId, data: $data) {
          id
          assignedAgentId
          leadStatus
        }
      }
    `,
  });

  return result.updatePerson;
};

const shouldSetLeadStatusToAssigned = (lead: LeadRecord): boolean =>
  lead.assignedAgentId !== null &&
  lead.assignedAgentId !== undefined &&
  (lead.leadStatus === null ||
    lead.leadStatus === undefined ||
    lead.leadStatus === 'IDLE');

export const setLeadStatusToAssignedWhenAgentPresent = async (
  leadId: string,
): Promise<LeadRecord | null> => {
  const lead = await findLeadById(leadId);

  if (lead === null || !shouldSetLeadStatusToAssigned(lead)) {
    return lead;
  }

  return updateLeadStatusToAssigned(lead.id);
};
