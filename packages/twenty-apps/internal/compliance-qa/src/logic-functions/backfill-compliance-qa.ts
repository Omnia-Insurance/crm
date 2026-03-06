import { defineLogicFunction } from 'twenty-sdk';

// Call records live in the workspace, not this app — use REST API directly.

type RequestBody = {
  batchSize?: number;
  afterDate?: string;
  agentId?: string;
  dryRun?: boolean;
};

type CallNode = {
  id: string;
  name: string;
  recording: {
    primaryLinkUrl?: string;
    primaryLinkLabel?: string;
  } | null;
  agentId: string | null;
  callDate: string | null;
};

type CallEdge = {
  node: CallNode;
};

type CallConnectionResponse = {
  data: {
    calls: {
      edges: CallEdge[];
    };
  };
};

type QaScorecardEdge = {
  node: { id: string };
};

type QaScorecardConnectionResponse = {
  data: {
    qaScorecards: {
      edges: QaScorecardEdge[];
    };
  };
};

type ProcessResult = {
  callId: string;
  callName: string;
  status: 'success' | 'error';
  error?: string;
};

const getApiConfig = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  // App token can only access app-scoped objects (qaScorecard).
  // Workspace API key is needed for workspace objects (call, agentProfile).
  const appToken = process.env.TWENTY_APP_ACCESS_TOKEN;
  const workspaceToken = process.env.TWENTY_API_KEY;

  if (!apiBaseUrl || (!appToken && !workspaceToken)) {
    throw new Error('Missing TWENTY_API_URL or token');
  }

  return {
    apiBaseUrl,
    appToken: appToken ?? workspaceToken!,
    workspaceToken: workspaceToken ?? appToken!,
  };
};

const graphqlQuery = async <T>(
  query: string,
  token: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const { apiBaseUrl } = getApiConfig();

  const response = await fetch(`${apiBaseUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(`GraphQL request failed (${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  const gqlResponse = json as { errors?: { message: string }[] };

  if (gqlResponse.errors?.length) {
    throw new Error(
      `GraphQL errors: ${gqlResponse.errors.map((e) => e.message).join('; ')}`,
    );
  }

  return json as T;
};

const handler = async (event: { body: RequestBody | null }) => {
  const body = event.body ?? {};
  const batchSize = Math.min(body.batchSize ?? 10, 50);

  // Build filter for calls query
  const filterClauses: string[] = [];

  if (body.afterDate) {
    filterClauses.push(`callDate: { gte: "${body.afterDate}" }`);
  }

  if (body.agentId) {
    filterClauses.push(`agentId: { eq: "${body.agentId}" }`);
  }

  const filterArg =
    filterClauses.length > 0
      ? `filter: { ${filterClauses.join(', ')} },`
      : '';

  console.log(
    '[backfill] Querying calls with recordings...',
    JSON.stringify({ batchSize, afterDate: body.afterDate, agentId: body.agentId }),
  );

  const { workspaceToken, appToken } = getApiConfig();

  // Fetch calls via workspace GraphQL (Call is not in this app's schema)
  const callsResponse = await graphqlQuery<CallConnectionResponse>(`
    query BackfillCallsQuery {
      calls(
        ${filterArg}
        first: ${batchSize},
        orderBy: [{ callDate: DescNullsLast }]
      ) {
        edges {
          node {
            id
            name
            recording
            agentId
            callDate
          }
        }
      }
    }
  `, workspaceToken);

  const callNodes = callsResponse.data.calls.edges.map((e) => e.node);

  // Filter to calls that have a recording URL
  const callsWithRecording = callNodes.filter(
    (call) =>
      call.recording?.primaryLinkUrl &&
      call.recording.primaryLinkUrl.length > 0,
  );

  console.log(
    `[backfill] Found ${callsWithRecording.length} calls with recordings out of ${callNodes.length} total`,
  );

  // Check which calls already have scorecards
  const callsToProcess: CallNode[] = [];

  for (const call of callsWithRecording) {
    const scorecardResponse = await graphqlQuery<QaScorecardConnectionResponse>(`
      query CheckExistingScorecard {
        qaScorecards(
          filter: { name: { like: "%${call.id.slice(0, 8)}%" } },
          first: 1
        ) {
          edges {
            node { id }
          }
        }
      }
    `, appToken);

    if (scorecardResponse.data.qaScorecards.edges.length === 0) {
      callsToProcess.push(call);
    }
  }

  console.log(
    `[backfill] ${callsToProcess.length} calls need QA scorecards`,
  );

  if (body.dryRun) {
    return {
      dryRun: true,
      totalCalls: callNodes.length,
      callsWithRecording: callsWithRecording.length,
      callsNeedingScorecard: callsToProcess.length,
      callIds: callsToProcess.map((c) => c.id),
    };
  }

  // Process each call by calling the analyze endpoint
  const { apiBaseUrl } = getApiConfig();
  const results: ProcessResult[] = [];

  for (const call of callsToProcess) {
    const recordingUrl = call.recording?.primaryLinkUrl;

    console.log(`[backfill] Processing call ${call.id}: ${call.name}`);

    try {
      const analyzeResponse = await fetch(
        `${apiBaseUrl}/rest/logic-functions/s/analyze-call-compliance`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${appToken}`,
          },
          body: JSON.stringify({
            callId: call.id,
            recordingUrl,
            agentId: call.agentId ?? undefined,
            callName: call.name,
          }),
        },
      );

      if (!analyzeResponse.ok) {
        const errorBody = await analyzeResponse.text();

        results.push({
          callId: call.id,
          callName: call.name,
          status: 'error',
          error: `HTTP ${analyzeResponse.status}: ${errorBody.slice(0, 200)}`,
        });
      } else {
        results.push({
          callId: call.id,
          callName: call.name,
          status: 'success',
        });
      }
    } catch (error) {
      results.push({
        callId: call.id,
        callName: call.name,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  console.log(
    `[backfill] Complete: ${successCount} success, ${errorCount} errors`,
  );

  return {
    processed: results.length,
    success: successCount,
    errors: errorCount,
    results,
  };
};

export default defineLogicFunction({
  universalIdentifier: 'c9d5b3f7-4e68-4a2a-bf6c-8d0e2a4c6f19',
  name: 'backfill-compliance-qa',
  description:
    'Backfill QA scorecards for existing call recordings that have not been analyzed yet',
  timeoutSeconds: 300,
  handler,
  httpRouteTriggerSettings: {
    path: '/backfill-compliance-qa',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
