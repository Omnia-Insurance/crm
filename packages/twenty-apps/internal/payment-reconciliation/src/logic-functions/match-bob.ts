import { defineLogicFunction } from 'twenty-sdk';
import { CoreApiClient } from 'twenty-sdk/generated';

import {
  matchRow,
  type BobRow,
  type MirrorRecord,
  type Override,
} from 'src/utils/matching-engine';
import { MATCH_BOB_LOGIC_FUNCTION_ID } from 'src/constants/universal-identifiers';

type RequestBody = {
  sourceFileId: string;
};

type NbrNode = {
  id: string;
  carrierPolicyNumber: string | null;
  brokerName: string | null;
  trueEffectiveDate: string | null;
};

type NbrEdge = { node: NbrNode };

type MirrorNode = {
  id: string;
  policyNumber: string | null;
  agentName: string | null;
  effectiveDate: string | null;
};

type MirrorEdge = { node: MirrorNode };

type OverrideNode = {
  id: string;
  carrierPolicyNumber: string;
  carrierName: string;
  crmPolicyId: string;
  isActive: boolean;
};

type OverrideEdge = { node: OverrideNode };

type SourceFileNode = {
  id: string;
  name: string | null;
  carrierConfig: {
    name: string | null;
  } | null;
};

const fetchAllPages = async <TNode>(
  client: CoreApiClient,
  queryKey: string,
  fields: Record<string, boolean>,
  filter?: Record<string, unknown>,
): Promise<TNode[]> => {
  const results: TNode[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const args: Record<string, unknown> = { first: 50 };

    if (filter) {
      args.filter = filter;
    }

    if (cursor) {
      args.after = cursor;
    }

    const response = (await client.query({
      [queryKey]: {
        edges: { node: { ...fields, id: true } },
        pageInfo: { hasNextPage: true, endCursor: true },
        __args: args,
      },
    })) as unknown as Record<
      string,
      {
        edges: { node: TNode }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      }
    >;

    const data = response[queryKey];

    results.push(...data.edges.map((e) => e.node));
    hasMore = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
  }

  return results;
};

const handler = async (event: { body: RequestBody | null }) => {
  const body = event.body;

  if (!body?.sourceFileId) {
    throw new Error('Missing sourceFileId in request body');
  }

  const client = new CoreApiClient();

  // Fetch source file to get carrier name
  const { payReconSourceFile: sourceFile } = (await client.query({
    payReconSourceFile: {
      __args: { id: body.sourceFileId },
      id: true,
      name: true,
      carrierConfig: { name: true },
    },
  })) as unknown as { payReconSourceFile: SourceFileNode };

  const carrierName = sourceFile?.carrierConfig?.name ?? 'Unknown';

  // Fetch all NormalizedBookRows for this source file
  const bookRows = await fetchAllPages<NbrNode>(
    client,
    'payReconNormalizedBookRows',
    {
      carrierPolicyNumber: true,
      brokerName: true,
      trueEffectiveDate: true,
    },
    { sourceFileId: { eq: body.sourceFileId } },
  );

  // Fetch all CRM policy mirrors
  const mirrors = await fetchAllPages<MirrorNode>(
    client,
    'payReconCrmPolicyMirrors',
    {
      policyNumber: true,
      agentName: true,
      effectiveDate: true,
    },
  );

  // Fetch active overrides for this carrier
  const overrides = await fetchAllPages<OverrideNode>(
    client,
    'payReconMatchOverrides',
    {
      carrierPolicyNumber: true,
      carrierName: true,
      crmPolicyId: true,
      isActive: true,
    },
    { isActive: { eq: true } },
  );

  let autoMatched = 0;
  let needsReview = 0;
  let unmatched = 0;

  for (const row of bookRows) {
    const bobRow: BobRow = {
      carrierPolicyNumber: row.carrierPolicyNumber,
      brokerName: row.brokerName,
      trueEffectiveDate: row.trueEffectiveDate,
    };

    const mirrorRecords: MirrorRecord[] = mirrors.map((m) => ({
      id: m.id,
      policyNumber: m.policyNumber,
      agentName: m.agentName,
      effectiveDate: m.effectiveDate,
    }));

    const overrideRecords: Override[] = overrides.map((o) => ({
      carrierPolicyNumber: o.carrierPolicyNumber,
      carrierName: o.carrierName,
      crmPolicyId: o.crmPolicyId,
      isActive: o.isActive,
    }));

    const decision = matchRow(
      bobRow,
      mirrorRecords,
      overrideRecords,
      carrierName,
    );

    // Build match result name
    const policyLabel = row.carrierPolicyNumber ?? 'unknown';
    const mirrorLabel = decision.crmPolicyMirrorId
      ? mirrors.find((m) => m.id === decision.crmPolicyMirrorId)
          ?.policyNumber ?? 'linked'
      : 'none';

    await client.mutation({
      createPayReconMatchResult: {
        __args: {
          data: {
            name: `${policyLabel} → ${mirrorLabel}`,
            confidence: decision.confidence,
            matchMethod: decision.method,
            matchStatus: decision.status,
            matchNotes: decision.notes,
            normalizedBookRowId: row.id,
            crmPolicyMirrorId: decision.crmPolicyMirrorId,
            sourceFileId: body.sourceFileId,
          },
        },
        id: true,
      },
    });

    if (decision.status === 'AUTO_MATCHED') {
      autoMatched++;
    } else if (decision.status === 'NEEDS_REVIEW') {
      needsReview++;
    } else {
      unmatched++;
    }
  }

  const total = bookRows.length;

  console.log(
    `[match-bob] Complete: ${autoMatched} auto-matched, ${needsReview} needs review, ${unmatched} unmatched out of ${total}`,
  );

  return { autoMatched, needsReview, unmatched, total };
};

export default defineLogicFunction({
  universalIdentifier: MATCH_BOB_LOGIC_FUNCTION_ID,
  name: 'match-bob',
  description:
    'Run matching engine against parsed BOB rows to link them to CRM policy mirrors',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: '/match-bob',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
