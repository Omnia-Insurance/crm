import { startComplianceQaHandler } from 'src/logic-functions/start-compliance-qa';
import { graphqlRequest } from 'src/utils/graphql-client';
import { isCallEligibleForComplianceQa } from 'src/utils/qa-call-eligibility';
import {
  findQaScorecardByCallId,
  findQaScorecardBySourceCallKey,
  type SourceCall,
} from 'src/utils/records';
import { defineLogicFunction } from 'twenty-sdk/define';

type BackfillComplianceQaInput = {
  batchSize?: number;
  afterDate?: string;
  agentId?: string;
  dryRun?: boolean;
  confirm?: boolean;
  minDurationSeconds?: number;
};

type CallsResponse = {
  calls: {
    edges: {
      node: SourceCall;
    }[];
  };
};

type BackfillResult = {
  callId: string;
  status: 'queued' | 'skipped' | 'error';
  scorecardId?: string;
  error?: string;
};

type BackfillComplianceQaEvent = {
  body?: BackfillComplianceQaInput | null;
};

const isBackfillComplianceQaEvent = (
  event: BackfillComplianceQaEvent | BackfillComplianceQaInput,
): event is BackfillComplianceQaEvent => 'body' in event;

const safeString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const resolveBatchSize = (batchSize?: number): number => {
  if (batchSize === undefined) {
    return 25;
  }

  if (!Number.isFinite(batchSize) || !Number.isInteger(batchSize)) {
    throw new Error('batchSize must be an integer');
  }

  if (batchSize < 1) {
    throw new Error('batchSize must be greater than zero');
  }

  return Math.min(batchSize, 100);
};

const resolveDryRun = (input: BackfillComplianceQaInput): boolean =>
  input.confirm !== true || input.dryRun === true;

const validateLiveBackfillInput = (
  input: BackfillComplianceQaInput,
): void => {
  if (resolveDryRun(input)) {
    return;
  }

  if (input.afterDate === undefined || input.afterDate.length === 0) {
    throw new Error(
      'afterDate is required when confirm is true and dryRun is false',
    );
  }
};

const buildCallFilter = (input: BackfillComplianceQaInput): string => {
  const filters: string[] = [];

  if (input.afterDate !== undefined && input.afterDate.length > 0) {
    filters.push(`callDate: { gte: "${safeString(input.afterDate)}" }`);
  }

  if (input.agentId !== undefined && input.agentId.length > 0) {
    filters.push(`agentId: { eq: "${safeString(input.agentId)}" }`);
  }

  return filters.length > 0 ? `filter: { ${filters.join(', ')} },` : '';
};

const fetchCandidateCalls = async (
  input: BackfillComplianceQaInput,
): Promise<SourceCall[]> => {
  const batchSize = resolveBatchSize(input.batchSize);
  const filter = buildCallFilter(input);

  const data = await graphqlRequest<CallsResponse>({
    tokenType: 'workspace',
    query: `
      query ComplianceQaBackfillCalls {
        calls(
          ${filter}
          first: ${batchSize}
          orderBy: [{ callDate: DescNullsLast }]
        ) {
          edges {
            node {
              id
              name
              recording {
                primaryLinkUrl
                primaryLinkLabel
              }
              agentId
              callDate
              duration
              direction
              status
              statusName
              queueName
              leadSourceId
            }
          }
        }
      }
    `,
  });

  return data.calls.edges
    .map((edge) => edge.node)
    .filter((call) => {
      const eligibilityOptions =
        input.minDurationSeconds !== undefined
          ? { minimumDurationSeconds: input.minDurationSeconds }
          : undefined;
      const recordingUrl = call.recording?.primaryLinkUrl;

      if (recordingUrl === undefined || recordingUrl === null) {
        return false;
      }

      if (recordingUrl.trim().length === 0) {
        return false;
      }

      return isCallEligibleForComplianceQa(call, eligibilityOptions).eligible;
    });
};

export const backfillComplianceQaHandler = async (
  event: BackfillComplianceQaEvent | BackfillComplianceQaInput,
) => {
  const input = isBackfillComplianceQaEvent(event)
    ? (event.body ?? {})
    : event;
  validateLiveBackfillInput(input);

  const dryRun = resolveDryRun(input);
  const calls = await fetchCandidateCalls(input);
  const results: BackfillResult[] = [];

  for (const call of calls) {
    const existingScorecard =
      (await findQaScorecardByCallId(call.id)) ??
      (await findQaScorecardBySourceCallKey(call.id));

    if (existingScorecard) {
      results.push({
        callId: call.id,
        status: 'skipped',
        scorecardId: existingScorecard.id,
      });
      continue;
    }

    if (dryRun) {
      results.push({ callId: call.id, status: 'queued' });
      continue;
    }

    const started = await startComplianceQaHandler({ callId: call.id });

    if (started.success) {
      results.push({
        callId: call.id,
        status: 'queued',
        scorecardId: started.scorecardId,
      });
    } else {
      results.push({
        callId: call.id,
        status: started.skipped ? 'skipped' : 'error',
        error: started.error,
      });
    }
  }

  return {
    dryRun,
    candidates: calls.length,
    queued: results.filter((result) => result.status === 'queued').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    errors: results.filter((result) => result.status === 'error').length,
    results,
  };
};

export default defineLogicFunction({
  universalIdentifier: 'c9d5b3f7-4e68-4a2a-bf6c-8d0e2a4c6f19',
  name: 'backfill-compliance-qa',
  description:
    'Queues Compliance QA for historical calls with recordings that do not already have scorecards.',
  timeoutSeconds: 300,
  handler: backfillComplianceQaHandler,
  workflowActionTriggerSettings: {
    label: 'Backfill Compliance QA',
    inputSchema: [
      {
        type: 'object',
        properties: {
          batchSize: { type: 'number' },
          afterDate: { type: 'string' },
          agentId: { type: 'string' },
          dryRun: { type: 'boolean' },
          confirm: { type: 'boolean' },
          minDurationSeconds: { type: 'number' },
        },
      },
    ],
    outputSchema: [
      {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean' },
          candidates: { type: 'number' },
          queued: { type: 'number' },
          skipped: { type: 'number' },
          errors: { type: 'number' },
          results: { type: 'array' },
        },
      },
    ],
  },
});
