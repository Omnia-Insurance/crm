import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/logic-functions/backfill-compliance-qa.ts
import { defineLogicFunction } from "twenty-sdk";
var getApiConfig = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const appToken = process.env.TWENTY_APP_ACCESS_TOKEN;
  const workspaceToken = process.env.TWENTY_API_KEY;
  if (!apiBaseUrl || !appToken && !workspaceToken) {
    throw new Error("Missing TWENTY_API_URL or token");
  }
  return {
    apiBaseUrl,
    appToken: appToken ?? workspaceToken,
    workspaceToken: workspaceToken ?? appToken
  };
};
var graphqlQuery = async (query, token, variables) => {
  const { apiBaseUrl } = getApiConfig();
  const response = await fetch(`${apiBaseUrl}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GraphQL request failed (${response.status}): ${errorBody}`);
  }
  const json = await response.json();
  const gqlResponse = json;
  if (gqlResponse.errors?.length) {
    throw new Error(
      `GraphQL errors: ${gqlResponse.errors.map((e) => e.message).join("; ")}`
    );
  }
  return json;
};
var handler = async (event) => {
  const body = event.body ?? {};
  const batchSize = Math.min(body.batchSize ?? 10, 50);
  const filterClauses = [];
  if (body.afterDate) {
    filterClauses.push(`callDate: { gte: "${body.afterDate}" }`);
  }
  if (body.agentId) {
    filterClauses.push(`agentId: { eq: "${body.agentId}" }`);
  }
  const filterArg = filterClauses.length > 0 ? `filter: { ${filterClauses.join(", ")} },` : "";
  console.log(
    "[backfill] Querying calls with recordings...",
    JSON.stringify({ batchSize, afterDate: body.afterDate, agentId: body.agentId })
  );
  const { workspaceToken, appToken } = getApiConfig();
  const callsResponse = await graphqlQuery(`
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
  const callsWithRecording = callNodes.filter(
    (call) => call.recording?.primaryLinkUrl && call.recording.primaryLinkUrl.length > 0
  );
  console.log(
    `[backfill] Found ${callsWithRecording.length} calls with recordings out of ${callNodes.length} total`
  );
  const callsToProcess = [];
  for (const call of callsWithRecording) {
    const scorecardResponse = await graphqlQuery(`
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
    `[backfill] ${callsToProcess.length} calls need QA scorecards`
  );
  if (body.dryRun) {
    return {
      dryRun: true,
      totalCalls: callNodes.length,
      callsWithRecording: callsWithRecording.length,
      callsNeedingScorecard: callsToProcess.length,
      callIds: callsToProcess.map((c) => c.id)
    };
  }
  const { apiBaseUrl } = getApiConfig();
  const results = [];
  for (const call of callsToProcess) {
    const recordingUrl = call.recording?.primaryLinkUrl;
    console.log(`[backfill] Processing call ${call.id}: ${call.name}`);
    try {
      const analyzeResponse = await fetch(
        `${apiBaseUrl}/rest/logic-functions/s/analyze-call-compliance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${appToken}`
          },
          body: JSON.stringify({
            callId: call.id,
            recordingUrl,
            agentId: call.agentId ?? void 0,
            callName: call.name
          })
        }
      );
      if (!analyzeResponse.ok) {
        const errorBody = await analyzeResponse.text();
        results.push({
          callId: call.id,
          callName: call.name,
          status: "error",
          error: `HTTP ${analyzeResponse.status}: ${errorBody.slice(0, 200)}`
        });
      } else {
        results.push({
          callId: call.id,
          callName: call.name,
          status: "success"
        });
      }
    } catch (error) {
      results.push({
        callId: call.id,
        callName: call.name,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  console.log(
    `[backfill] Complete: ${successCount} success, ${errorCount} errors`
  );
  return {
    processed: results.length,
    success: successCount,
    errors: errorCount,
    results
  };
};
var backfill_compliance_qa_default = defineLogicFunction({
  universalIdentifier: "c9d5b3f7-4e68-4a2a-bf6c-8d0e2a4c6f19",
  name: "backfill-compliance-qa",
  description: "Backfill QA scorecards for existing call recordings that have not been analyzed yet",
  timeoutSeconds: 300,
  handler,
  httpRouteTriggerSettings: {
    path: "/backfill-compliance-qa",
    httpMethod: "POST",
    isAuthRequired: false
  }
});
export {
  backfill_compliance_qa_default as default
};
//# sourceMappingURL=backfill-compliance-qa.mjs.map
