import { resolveAgentName } from 'src/utils/qa-manager';
import { getErrorMessage } from 'src/utils/error-message';
import { isCallEligibleForComplianceQa } from 'src/utils/qa-call-eligibility';
import {
  createQaScorecard,
  fetchSourceCall,
  findQaScorecardByCallId,
  findQaScorecardBySourceCallKey,
  upsertQaScorecardAttachment,
  upsertQaScorecardNote,
  updateQaScorecard,
  type QaScorecardRecord,
  type SourceCall,
} from 'src/utils/records';
import {
  copyRecordingToS3,
  isRecordingNotReadyError,
  readCachedTranscriptForCall,
} from 'src/utils/recording-storage';
import { defineLogicFunction } from 'twenty-sdk/define';

export type StartComplianceQaInput = {
  callId?: string;
  recordId?: string;
  properties?: {
    after?: {
      id?: string;
    };
  };
};

export type StartComplianceQaResult =
  | {
      success: true;
      scorecardId: string;
      status: string;
    }
  | {
      success: false;
      skipped?: boolean;
      error: string;
    };

const resolveCallId = (input: StartComplianceQaInput): string | undefined =>
  input.callId ?? input.recordId ?? input.properties?.after?.id;

const getRecordingUrl = (call: SourceCall): string | undefined => {
  const recordingUrl = call.recording?.primaryLinkUrl?.trim();

  return recordingUrl !== undefined && recordingUrl.length > 0
    ? recordingUrl
    : undefined;
};

const buildScorecardName = ({
  call,
  agentName,
}: {
  call: SourceCall;
  agentName?: string;
}): string => {
  const callDate =
    call.callDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const agentLabel = agentName ?? 'Unknown Agent';

  return `QA - ${agentLabel} - ${callDate}`;
};

const isInProgressOrDone = (scorecard: QaScorecardRecord): boolean =>
  scorecard.status === 'TRANSCRIBING' ||
  scorecard.status === 'SCORING' ||
  scorecard.status === 'COMPLETED' ||
  scorecard.status === 'SKIPPED';

const formatS3Uri = ({
  bucket,
  key,
}: {
  bucket: string;
  key: string;
}): string => `s3://${bucket}/${key}`;

const upsertTranscriptionArtifactNote = async ({
  scorecardId,
  inputRecordingUri,
  outputTranscriptUri,
  detail,
}: {
  scorecardId: string;
  inputRecordingUri?: string;
  outputTranscriptUri?: string;
  detail?: string;
}): Promise<void> => {
  const lines = ['Transcription artifacts for this QA run.'];

  if (detail !== undefined && detail.length > 0) {
    lines.push('', detail);
  }

  if (inputRecordingUri !== undefined) {
    lines.push('', `Input Recording: ${inputRecordingUri}`);
  }

  if (outputTranscriptUri !== undefined) {
    lines.push(`Output Transcript JSON: ${outputTranscriptUri}`);
  }

  try {
    await upsertQaScorecardNote({
      scorecardId,
      title: 'Transcription Artifacts',
      markdown: lines.join('\n'),
    });
  } catch (error) {
    console.warn(
      '[compliance-qa] Could not write transcription artifact note:',
      getErrorMessage(error),
    );
  }
};

const upsertQaScorecardAttachmentIfPossible = async ({
  scorecardId,
  name,
  filename,
  content,
  contentType,
}: {
  scorecardId: string;
  name: string;
  filename: string;
  content: Uint8Array;
  contentType: string;
}): Promise<void> => {
  try {
    await upsertQaScorecardAttachment({
      scorecardId,
      name,
      filename,
      content,
      contentType,
    });
  } catch (error) {
    console.warn(
      `[compliance-qa] Could not attach ${name} to QA scorecard Files:`,
      getErrorMessage(error),
    );
  }
};

const upsertTranscriptionArtifactAttachments = async ({
  scorecardId,
  transcriptOutput,
}: {
  scorecardId: string;
  transcriptOutput?: {
    content: Uint8Array;
  };
}): Promise<void> => {
  await Promise.allSettled([
    transcriptOutput !== undefined
      ? upsertQaScorecardAttachmentIfPossible({
          scorecardId,
          name: 'Deepgram Transcript JSON',
          filename: 'deepgram-transcript.json',
          content: transcriptOutput.content,
          contentType: 'application/json',
        })
      : Promise.resolve(null),
  ]);
};

const findExistingScorecardForCall = async (
  callId: string,
): Promise<QaScorecardRecord | null> =>
  (await findQaScorecardByCallId(callId)) ??
  (await findQaScorecardBySourceCallKey(callId));

const syncExistingScorecardForCall = async ({
  scorecard,
  call,
}: {
  scorecard: QaScorecardRecord;
  call: SourceCall;
}): Promise<QaScorecardRecord> => {
  const data: {
    leadId?: string | null;
    sourceCallKey?: string;
  } = {};

  if ((scorecard.leadId ?? null) !== (call.leadId ?? null)) {
    data.leadId = call.leadId ?? null;
  }

  if (scorecard.sourceCallKey !== call.id) {
    data.sourceCallKey = call.id;
  }

  if (Object.keys(data).length === 0) {
    return scorecard;
  }

  return updateQaScorecard({
    id: scorecard.id,
    data,
  });
};

const createScorecardForCall = async ({
  call,
}: {
  call: SourceCall;
}): Promise<QaScorecardRecord> => {
  const existingScorecard = await findExistingScorecardForCall(call.id);

  if (existingScorecard !== null) {
    return syncExistingScorecardForCall({ scorecard: existingScorecard, call });
  }

  const agentName = await resolveAgentName(call.agentId);

  try {
    return await createQaScorecard({
      name: buildScorecardName({
        call,
        agentName,
      }),
      sourceCallKey: call.id,
      callId: call.id,
      agentId: call.agentId,
      leadId: call.leadId,
      status: 'PENDING',
      processingStartedAt: new Date().toISOString(),
    });
  } catch (error) {
    const scorecard = await findExistingScorecardForCall(call.id);

    if (scorecard !== null) {
      return scorecard;
    }

    throw error;
  }
};

export const startComplianceQaHandler = async (
  input: StartComplianceQaInput,
): Promise<StartComplianceQaResult> => {
  const callId = resolveCallId(input);

  if (callId === undefined || callId.length === 0) {
    return {
      success: false,
      error: 'callId is required',
    };
  }

  const call = await fetchSourceCall(callId);

  if (call === null) {
    return {
      success: false,
      error: `Call not found: ${callId}`,
    };
  }

  const existingScorecardCandidate = await findExistingScorecardForCall(
    call.id,
  );
  const existingScorecard =
    existingScorecardCandidate === null
      ? null
      : await syncExistingScorecardForCall({
          scorecard: existingScorecardCandidate,
          call,
        });

  if (existingScorecard !== null && isInProgressOrDone(existingScorecard)) {
    return {
      success: true,
      scorecardId: existingScorecard.id,
      status: existingScorecard.status ?? 'PENDING',
    };
  }

  const eligibility = isCallEligibleForComplianceQa(call);

  if (!eligibility.eligible) {
    return {
      success: false,
      skipped: true,
      error: `Call ${callId} is not eligible for Compliance QA: ${eligibility.reason}`,
    };
  }

  let scorecard: QaScorecardRecord | null = null;

  try {
    const cachedTranscript = await readCachedTranscriptForCall(call.id);
    const recordingUrl = getRecordingUrl(call);

    if (cachedTranscript === null && recordingUrl === undefined) {
      return {
        success: false,
        skipped: true,
        error: `Call ${callId} does not have a recording URL yet`,
      };
    }

    scorecard = existingScorecard ?? (await createScorecardForCall({ call }));

    if (cachedTranscript !== null) {
      await updateQaScorecard({
        id: scorecard.id,
        data: {
          status: 'SCORING',
        },
      });

      await upsertTranscriptionArtifactNote({
        scorecardId: scorecard.id,
        outputTranscriptUri: cachedTranscript.transcriptFileUri,
        detail: 'Cached transcript reused; no new paid transcription was started.',
      });

      await upsertTranscriptionArtifactAttachments({
        scorecardId: scorecard.id,
        transcriptOutput: {
          content: Buffer.from(
            JSON.stringify(cachedTranscript.raw, null, 2),
            'utf-8',
          ),
        },
      });

      return {
        success: true,
        scorecardId: scorecard.id,
        status: 'SCORING',
      };
    }

    if (recordingUrl === undefined) {
      throw new Error(`Call ${callId} does not have a recording URL yet`);
    }

    await updateQaScorecard({
      id: scorecard.id,
      data: {
        status: 'COPYING_RECORDING',
      },
    });

    const copiedRecording = await copyRecordingToS3({
      callId: call.id,
      recordingUrl,
    });
    const inputRecordingUri = formatS3Uri({
      bucket: copiedRecording.bucket,
      key: copiedRecording.inputKey,
    });
    const outputTranscriptUri = formatS3Uri({
      bucket: copiedRecording.bucket,
      key: copiedRecording.outputKey,
    });

    await updateQaScorecard({
      id: scorecard.id,
      data: {
        status: 'TRANSCRIBING',
      },
    });

    await upsertTranscriptionArtifactNote({
      scorecardId: scorecard.id,
      inputRecordingUri,
      outputTranscriptUri,
      detail:
        'Deepgram transcription runs during workflow polling. Input audio remains in S3 because native Files uploads are limited by CRM ingress size and MIME validation.',
    });

    return {
      success: true,
      scorecardId: scorecard.id,
      status: 'TRANSCRIBING',
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    if (scorecard !== null) {
      if (isRecordingNotReadyError(error)) {
        await updateQaScorecard({
          id: scorecard.id,
          data: {
            status: 'COPYING_RECORDING',
          },
        });

        await upsertQaScorecardNote({
          scorecardId: scorecard.id,
          title: 'Recording Pending',
          markdown:
            `${errorMessage}\n\n` +
            'Compliance QA will retry the recording URL during workflow polling.',
        });

        return {
          success: true,
          scorecardId: scorecard.id,
          status: 'COPYING_RECORDING',
        };
      }

      await updateQaScorecard({
        id: scorecard.id,
        data: {
          status: 'FAILED',
        },
      });

      await upsertQaScorecardNote({
        scorecardId: scorecard.id,
        title: 'Processing Error',
        markdown: errorMessage,
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

export default defineLogicFunction({
  universalIdentifier: '3fbf987a-8a7d-4ead-aef8-5e89a36555e7',
  name: 'start-compliance-qa',
  description:
    'Starts Compliance QA for a Call by validating and copying the recording to S3 for Deepgram transcription.',
  timeoutSeconds: 120,
  handler: startComplianceQaHandler,
  workflowActionTriggerSettings: {
    label: 'Start Compliance QA',
    inputSchema: [
      {
        type: 'object',
        properties: {
          callId: {
            type: 'string',
          },
        },
      },
    ],
    outputSchema: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          scorecardId: { type: 'string' },
          status: { type: 'string' },
          error: { type: 'string' },
        },
      },
    ],
  },
});
