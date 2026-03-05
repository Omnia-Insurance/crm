import { defineLogicFunction } from 'twenty-sdk';
import { CoreApiClient } from 'twenty-sdk/generated';

// Backfill logic function: queries Call records with recording URLs
// but no existing QA Scorecard, then triggers analysis for each.

type RequestBody = {
  // Max number of calls to process in this batch (default: 10)
  batchSize?: number;
  // Only process calls after this date (ISO string)
  afterDate?: string;
  // Only process calls for a specific agent profile ID
  agentId?: string;
  // If true, just count eligible calls without processing
  dryRun?: boolean;
};

const handler = async (event: any) => {
  const body = (event.body as RequestBody) || {};
  const batchSize = Math.min(body.batchSize ?? 10, 50);

  const client = new CoreApiClient();

  // Query calls that have a recording URL
  // The recording field is a LINKS composite type with primaryLinkUrl
  const filter: Record<string, unknown> = {};

  if (body.afterDate) {
    filter.callDate = { gte: body.afterDate };
  }

  if (body.agentId) {
    filter.agentId = { eq: body.agentId };
  }

  console.log(
    '[backfill] Querying calls with recordings...',
    JSON.stringify({ batchSize, filter }),
  );

  // Fetch calls that have recording links
  const { calls } = (await client.query({
    calls: {
      __args: {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first: batchSize,
        orderBy: [{ callDate: 'DescNullsLast' }],
      },
      edges: {
        node: {
          id: true,
          name: true,
          recording: true,
          agentId: true,
          callDate: true,
        },
      },
    },
  } as any)) as any;

  const callNodes = calls?.edges?.map((e: any) => e.node) ?? [];

  // Filter to calls that have a recording URL
  const callsWithRecording = callNodes.filter((call: any) => {
    const recording = call.recording;

    return recording?.primaryLinkUrl && recording.primaryLinkUrl.length > 0;
  });

  console.log(
    `[backfill] Found ${callsWithRecording.length} calls with recordings out of ${callNodes.length} total`,
  );

  // Check which calls already have scorecards
  const callsToProcess: any[] = [];

  for (const call of callsWithRecording) {
    const { qaScorecards } = (await client.query({
      qaScorecards: {
        __args: {
          filter: {
            name: { like: `%${call.id.slice(0, 8)}%` },
          },
          first: 1,
        },
        edges: {
          node: { id: true },
        },
      },
    } as any)) as any;

    const existingScorecards = qaScorecards?.edges ?? [];

    if (existingScorecards.length === 0) {
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
      callIds: callsToProcess.map((c: any) => c.id),
    };
  }

  // Process each call by calling the analyze endpoint
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token =
    process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;

  if (!apiBaseUrl || !token) {
    throw new Error('Missing TWENTY_API_URL or token');
  }

  const results: Array<{
    callId: string;
    callName: string;
    status: string;
    error?: string;
  }> = [];

  for (const call of callsToProcess) {
    const recordingUrl = call.recording?.primaryLinkUrl;

    console.log(
      `[backfill] Processing call ${call.id}: ${call.name}`,
    );

    try {
      const analyzeResponse = await fetch(
        `${apiBaseUrl}/rest/logic-functions/s/analyze-call-compliance`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            callId: call.id,
            recordingUrl,
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
