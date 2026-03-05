import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/logic-functions/backfill-compliance-qa.ts
import { defineLogicFunction } from "twenty-sdk";

// node_modules/twenty-sdk/generated/core/index.ts
var CoreApiClient = class {
};

// src/logic-functions/backfill-compliance-qa.ts
var handler = async (event) => {
  const body = event.body || {};
  const batchSize = Math.min(body.batchSize ?? 10, 50);
  const client = new CoreApiClient();
  const filter = {};
  if (body.afterDate) {
    filter.callDate = { gte: body.afterDate };
  }
  if (body.agentId) {
    filter.agentId = { eq: body.agentId };
  }
  console.log(
    "[backfill] Querying calls with recordings...",
    JSON.stringify({ batchSize, filter })
  );
  const { calls } = await client.query({
    calls: {
      __args: {
        filter: Object.keys(filter).length > 0 ? filter : void 0,
        first: batchSize,
        orderBy: [{ callDate: "DescNullsLast" }]
      },
      edges: {
        node: {
          id: true,
          name: true,
          recording: true,
          agentId: true,
          callDate: true
        }
      }
    }
  });
  const callNodes = calls?.edges?.map((e) => e.node) ?? [];
  const callsWithRecording = callNodes.filter((call) => {
    const recording = call.recording;
    return recording?.primaryLinkUrl && recording.primaryLinkUrl.length > 0;
  });
  console.log(
    `[backfill] Found ${callsWithRecording.length} calls with recordings out of ${callNodes.length} total`
  );
  const callsToProcess = [];
  for (const call of callsWithRecording) {
    const { qaScorecards } = await client.query({
      qaScorecards: {
        __args: {
          filter: {
            name: { like: `%${call.id.slice(0, 8)}%` }
          },
          first: 1
        },
        edges: {
          node: { id: true }
        }
      }
    });
    const existingScorecards = qaScorecards?.edges ?? [];
    if (existingScorecards.length === 0) {
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
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token = process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
  if (!apiBaseUrl || !token) {
    throw new Error("Missing TWENTY_API_URL or token");
  }
  const results = [];
  for (const call of callsToProcess) {
    const recordingUrl = call.recording?.primaryLinkUrl;
    console.log(
      `[backfill] Processing call ${call.id}: ${call.name}`
    );
    try {
      const analyzeResponse = await fetch(
        `${apiBaseUrl}/rest/logic-functions/s/analyze-call-compliance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            callId: call.id,
            recordingUrl
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
