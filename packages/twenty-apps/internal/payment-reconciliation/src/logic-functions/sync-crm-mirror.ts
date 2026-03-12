import { defineLogicFunction } from 'twenty-sdk';
import { CoreApiClient } from 'twenty-sdk/generated';

import { graphqlQuery } from 'src/utils/graphql-helpers';
import { SYNC_CRM_MIRROR_LOGIC_FUNCTION_ID } from 'src/constants/universal-identifiers';

type RequestBody = {
  carrierCrmId?: string;
};

type PolicyNode = {
  id: string;
  name: string;
  policyNumber: string | null;
  applicationId: string | null;
  externalPolicyId: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  status: string | null;
  ltvAmountMicros: number | null;
  carrier: { id: string; name: string } | null;
  agentProfile: {
    id: string;
    name: { firstName: string; lastName: string } | null;
    status: string | null;
  } | null;
  lead: {
    id: string;
    name: { firstName: string; lastName: string } | null;
  } | null;
};

type PolicyEdge = { node: PolicyNode };
type PoliciesResponse = {
  data: {
    policies: {
      edges: PolicyEdge[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};

type FamilyMembersResponse = {
  data: {
    familyMembers: {
      edges: { node: { id: string } }[];
    };
  };
};

type MirrorNode = {
  id: string;
  crmPolicyId: string | null;
};

type MirrorEdge = { node: MirrorNode };

const formatName = (
  nameObj: { firstName: string; lastName: string } | null | undefined,
): string => {
  if (!nameObj) {
    return '';
  }

  return `${nameObj.firstName ?? ''} ${nameObj.lastName ?? ''}`.trim();
};

// Compute applicant count: 1 (lead) + number of family members
const getApplicantCount = async (leadId: string | null): Promise<number> => {
  if (!leadId) {
    return 1;
  }

  try {
    const response = await graphqlQuery<FamilyMembersResponse>(`
      query FamilyMemberCount {
        familyMembers(
          filter: { leadId: { eq: "${leadId}" } }
        ) {
          edges {
            node { id }
          }
        }
      }
    `);

    return 1 + response.data.familyMembers.edges.length;
  } catch {
    // If family members query fails (e.g. no such relation), default to 1
    return 1;
  }
};

const handler = async (event: { body: RequestBody | null }) => {
  const body = event.body ?? {};
  const client = new CoreApiClient();

  // Build carrier filter
  const carrierFilter = body.carrierCrmId
    ? `filter: { carrierId: { eq: "${body.carrierCrmId}" } },`
    : '';

  let created = 0;
  let updated = 0;
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const afterClause: string = cursor ? `after: "${cursor}",` : '';

    const policiesResponse: PoliciesResponse = await graphqlQuery<PoliciesResponse>(`
      query SyncPolicies {
        policies(
          ${carrierFilter}
          ${afterClause}
          first: 50,
          orderBy: [{ createdAt: DescNullsLast }]
        ) {
          edges {
            node {
              id
              name
              policyNumber
              applicationId
              externalPolicyId
              effectiveDate
              expirationDate
              status
              ltvAmountMicros
              carrier { id name }
              agentProfile {
                id
                name { firstName lastName }
                status
              }
              lead {
                id
                name { firstName lastName }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `);

    const edges = policiesResponse.data.policies.edges;
    const pageInfo: PoliciesResponse['data']['policies']['pageInfo'] =
      policiesResponse.data.policies.pageInfo;

    for (const edge of edges) {
      const policy = edge.node;

      // Compute applicant count from lead + family members
      const applicantCount = await getApplicantCount(policy.lead?.id ?? null);

      // Check if mirror exists
      const { payReconCrmPolicyMirrors: existing } = await client.query({
        payReconCrmPolicyMirrors: {
          edges: { node: { id: true, crmPolicyId: true } },
          __args: {
            filter: { crmPolicyId: { eq: policy.id } },
            first: 1,
          },
        },
      }) as unknown as { payReconCrmPolicyMirrors: { edges: MirrorEdge[] } };

      const mirrorData = {
        name: policy.name ?? policy.policyNumber ?? policy.id,
        crmPolicyId: policy.id,
        policyNumber: policy.policyNumber,
        applicationId: policy.applicationId,
        externalPolicyId: policy.externalPolicyId,
        carrierName: policy.carrier?.name ?? null,
        carrierCrmId: policy.carrier?.id ?? null,
        agentName: formatName(policy.agentProfile?.name),
        agentCrmId: policy.agentProfile?.id ?? null,
        agentStatus: policy.agentProfile?.status ?? null,
        leadName: formatName(policy.lead?.name),
        leadCrmId: policy.lead?.id ?? null,
        effectiveDate: policy.effectiveDate,
        expirationDate: policy.expirationDate,
        crmStatus: policy.status,
        applicantCount,
        ltvAmountMicros: policy.ltvAmountMicros,
        lastCrmSync: new Date().toISOString(),
      };

      if (existing.edges.length > 0) {
        const existingId = existing.edges[0].node.id;

        await client.mutation({
          updatePayReconCrmPolicyMirror: {
            __args: { id: existingId, data: mirrorData },
            id: true,
          },
        });

        updated++;
      } else {
        await client.mutation({
          createPayReconCrmPolicyMirror: {
            __args: { data: mirrorData },
            id: true,
          },
        });

        created++;
      }
    }

    hasMore = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  console.log(
    `[sync-crm-mirror] Complete: ${created} created, ${updated} updated`,
  );

  return { created, updated, total: created + updated };
};

export default defineLogicFunction({
  universalIdentifier: SYNC_CRM_MIRROR_LOGIC_FUNCTION_ID,
  name: 'sync-crm-mirror',
  description:
    'Sync CRM policy data into CrmPolicyMirror records for downstream matching',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: '/sync-crm-mirror',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
