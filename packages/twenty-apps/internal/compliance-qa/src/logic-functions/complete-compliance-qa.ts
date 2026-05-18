import { RED_FLAGS } from 'src/constants/compliance-rules';
import {
  buildTranscriptionJobName,
  buildTranscriptionArtifactFilename,
  getTranscriptionJobSnapshot,
  normalizeAmazonTranscript,
  readCachedTranscribeOutputForCall,
  readTranscriptionArtifactFileFromUri,
  readTranscribeOutputFromUri,
  type AmazonTranscriptResult,
} from 'src/utils/aws-transcribe';
import { getErrorMessage } from 'src/utils/error-message';
import {
  formatFullName,
  markQaManagerAssigned,
  resolveQaManager,
} from 'src/utils/qa-manager';
import {
  createFollowUpTask,
  findQaScorecardById,
  findQaScorecardAttachmentFullPath,
  findProcessableQaScorecards,
  hasQaScorecardAttachmentFile,
  linkTaskToComplianceContextIfSupported,
  upsertQaScorecardAttachment,
  upsertQaScorecardNote,
  updateQaScorecard,
  type QaScorecardRecord,
} from 'src/utils/records';
import {
  scoreTranscript,
  type FinalScorecardAnalysis,
} from 'src/utils/scoring';
import { defineLogicFunction } from 'twenty-sdk/define';

type CompleteComplianceQaInput = {
  scorecardId?: string;
  isFinalAttempt?: boolean;
  batchSize?: number;
};

type ProcessedScorecard = {
  scorecardId: string;
  status: string;
  shouldPollAgain: boolean;
  taskId?: string;
  error?: string;
};

type CompleteComplianceQaResult = {
  processed: number;
  status?: string;
  scorecardId?: string;
  shouldPollAgain: boolean;
  results: ProcessedScorecard[];
};

type TranscriptionSource = {
  raw: AmazonTranscriptResult;
  transcriptFileUri: string;
  mediaFileUri?: string;
};

const getScorecardAgentLabel = (scorecard: QaScorecardRecord): string =>
  formatFullName(scorecard.agent?.name) ?? scorecard.agentId ?? 'Unknown Agent';

const getScorecardCallLabel = (scorecard: QaScorecardRecord): string =>
  scorecard.call?.name ?? scorecard.callId ?? 'Unknown';

const getScorecardLeadLabel = (scorecard: QaScorecardRecord): string | null =>
  formatFullName(scorecard.lead?.name) ?? scorecard.leadId ?? null;

const buildFollowUpTaskTitle = ({
  scorecard,
  analysis,
}: {
  scorecard: QaScorecardRecord;
  analysis: FinalScorecardAnalysis;
}): string =>
  `Compliance QA ${analysis.overallResult}: ${getScorecardAgentLabel(
    scorecard,
  )} (${analysis.overallScore})`;

const buildFollowUpTaskMarkdown = ({
  scorecard,
  analysis,
  managerWarning,
}: {
  scorecard: QaScorecardRecord;
  analysis: FinalScorecardAnalysis;
  managerWarning?: string;
}): string => {
  const violatedRedFlags = RED_FLAGS.filter(
    (redFlag) => analysis.redFlags[redFlag.key]?.violated === true,
  )
    .map((redFlag) => `- ${redFlag.label}`)
    .join('\n');

  const lines: string[] = [
    'Compliance QA follow-up is required.',
    '',
    `Scorecard: ${scorecard.name ?? scorecard.id}`,
    `Source Call: ${getScorecardCallLabel(scorecard)}`,
  ];

  const leadLabel = getScorecardLeadLabel(scorecard);

  if (leadLabel !== null) {
    lines.push(`Lead: ${leadLabel}`);
  }

  if (
    scorecard.call?.convosoCallId !== undefined &&
    scorecard.call.convosoCallId !== null &&
    scorecard.call.convosoCallId.length > 0
  ) {
    lines.push(`Convoso Call ID: ${scorecard.call.convosoCallId}`);
  }

  lines.push(
    `Agent: ${getScorecardAgentLabel(scorecard)}`,
    `Result: ${analysis.overallResult}`,
    `Score: ${analysis.overallScore}`,
    `Rubric: ${analysis.rubricType}`,
  );

  if (managerWarning !== undefined && managerWarning.length > 0) {
    lines.push(`QA manager routing warning: ${managerWarning}`);
  }

  lines.push(
    '',
    violatedRedFlags.length > 0
      ? `Red flags:\n${violatedRedFlags}`
      : 'Red flags: none',
  );

  if (
    analysis.recommendationsMarkdown !== null &&
    analysis.recommendationsMarkdown.length > 0
  ) {
    lines.push('', `Recommendations:\n${analysis.recommendationsMarkdown}`);
  }

  return lines.join('\n');
};

const formatJsonMarkdown = (value: unknown): string =>
  ['```json', JSON.stringify(value, null, 2), '```'].join('\n');

const upsertAnalysisNotes = async ({
  scorecardId,
  analysis,
  transcriptMarkdown,
}: {
  scorecardId: string;
  analysis: FinalScorecardAnalysis;
  transcriptMarkdown: string;
}): Promise<void> => {
  await Promise.all([
    analysis.recommendationsMarkdown !== null &&
    analysis.recommendationsMarkdown.length > 0
      ? upsertQaScorecardNote({
          scorecardId,
          title: 'Recommendations',
          markdown: analysis.recommendationsMarkdown,
        })
      : Promise.resolve(null),
    analysis.redFlagDetailsMarkdown !== null &&
    analysis.redFlagDetailsMarkdown.length > 0
      ? upsertQaScorecardNote({
          scorecardId,
          title: 'Red Flag Details',
          markdown: analysis.redFlagDetailsMarkdown,
        })
      : Promise.resolve(null),
    upsertQaScorecardNote({
      scorecardId,
      title: 'Score Details',
      markdown: analysis.scoreDetailsMarkdown,
    }),
    upsertQaScorecardNote({
      scorecardId,
      title: 'Scoring Evidence',
      markdown: formatJsonMarkdown(analysis.aiAnalysis),
    }),
    upsertQaScorecardNote({
      scorecardId,
      title: 'Transcript',
      markdown: transcriptMarkdown,
    }),
  ]);
};

const upsertTranscriptionArtifactAttachments = async ({
  scorecardId,
  mediaFileUri,
  rawTranscript,
}: {
  scorecardId: string;
  mediaFileUri?: string;
  rawTranscript: AmazonTranscriptResult;
}): Promise<void> => {
  const inputRecordingAttachmentName = 'Amazon Transcribe Input Recording';
  const shouldAttachInputRecording =
    mediaFileUri !== undefined &&
    mediaFileUri.length > 0 &&
    !(await hasQaScorecardAttachmentFile({
      scorecardId,
      name: inputRecordingAttachmentName,
    }));

  await Promise.all([
    shouldAttachInputRecording
      ? readTranscriptionArtifactFileFromUri(mediaFileUri).then((artifact) =>
          upsertQaScorecardAttachment({
            scorecardId,
            name: inputRecordingAttachmentName,
            filename: buildTranscriptionArtifactFilename({
              uri: mediaFileUri,
              prefix: 'amazon-transcribe-input',
              fallbackExtension: 'mp3',
            }),
            content: artifact.content,
            contentType: artifact.contentType,
          }),
        )
      : Promise.resolve(null),
    upsertQaScorecardAttachment({
      scorecardId,
      name: 'Amazon Transcribe Output JSON',
      filename: 'amazon-transcribe-output.json',
      content: Buffer.from(JSON.stringify(rawTranscript, null, 2), 'utf-8'),
      contentType: 'application/json',
    }),
  ]);
};

const failScorecard = async ({
  scorecard,
  errorMessage,
}: {
  scorecard: QaScorecardRecord;
  errorMessage: string;
}): Promise<void> => {
  await upsertQaScorecardNote({
    scorecardId: scorecard.id,
    title: 'Processing Error',
    markdown: errorMessage,
  });

  await updateQaScorecard({
    id: scorecard.id,
    data: {
      status: 'FAILED',
    },
  });
};

const createTaskIfNeeded = async ({
  scorecard,
  analysis,
}: {
  scorecard: QaScorecardRecord;
  analysis: FinalScorecardAnalysis;
}): Promise<{
  taskId?: string;
  qaManagerId?: string;
}> => {
  if (
    analysis.overallResult !== 'FAIL' &&
    analysis.overallResult !== 'NEEDS_REVIEW'
  ) {
    return {};
  }

  if (
    scorecard.taskId !== undefined &&
    scorecard.taskId !== null &&
    scorecard.taskId.length > 0
  ) {
    await linkTaskToComplianceContextIfSupported({
      taskId: scorecard.taskId,
      scorecardId: scorecard.id,
      callId: scorecard.callId,
      leadId: scorecard.leadId,
      agentId: scorecard.agentId,
    });

    return { taskId: scorecard.taskId };
  }

  const qaManager = await resolveQaManager();

  if (
    qaManager.workspaceMemberId === undefined ||
    qaManager.workspaceMemberId.length === 0
  ) {
    throw new Error(
      'No active QA Manager with a workspace member is configured and no fallback workspace member is set',
    );
  }

  const taskId = await createFollowUpTask({
    title: buildFollowUpTaskTitle({ scorecard, analysis }),
    markdown: buildFollowUpTaskMarkdown({
      scorecard,
      analysis,
      managerWarning: qaManager.warning,
    }),
    assigneeId: qaManager.workspaceMemberId,
  });

  await linkTaskToComplianceContextIfSupported({
    taskId,
    scorecardId: scorecard.id,
    callId: scorecard.callId,
    leadId: scorecard.leadId,
    agentId: scorecard.agentId,
  });

  await markQaManagerAssigned({
    qaManagerId: qaManager.qaManagerId,
  });

  return {
    taskId,
    qaManagerId: qaManager.qaManagerId,
  };
};

const isProcessableScorecardStatus = (
  status: QaScorecardRecord['status'],
): boolean => status === 'TRANSCRIBING' || status === 'SCORING';

const shouldPollAgainForStatus = (status: string): boolean =>
  status === 'QUEUED' || status === 'IN_PROGRESS';

const buildTranscribePollingTimeoutMessage = (status: string): string =>
  `Amazon Transcribe job did not finish before the Compliance workflow polling window expired. Last status: ${status}`;

const readCachedTranscriptionSource = async (
  scorecard: QaScorecardRecord,
): Promise<TranscriptionSource | null> => {
  const callId = scorecard.callId ?? scorecard.sourceCallKey;

  if (callId === undefined || callId === null || callId.length === 0) {
    return null;
  }

  const cachedTranscribeOutput =
    await readCachedTranscribeOutputForCall(callId);

  if (cachedTranscribeOutput === null) {
    return null;
  }

  const mediaFileUri = await findQaScorecardAttachmentFullPath({
    scorecardId: scorecard.id,
    name: 'Amazon Transcribe Input Recording',
  });

  return {
    raw: cachedTranscribeOutput.raw,
    transcriptFileUri: cachedTranscribeOutput.transcriptFileUri,
    mediaFileUri: mediaFileUri ?? undefined,
  };
};

const scoreTranscriptionSource = async ({
  scorecard,
  source,
}: {
  scorecard: QaScorecardRecord;
  source: TranscriptionSource;
}): Promise<ProcessedScorecard> => {
  await updateQaScorecard({
    id: scorecard.id,
    data: { status: 'SCORING' },
  });

  const transcription = normalizeAmazonTranscript(source.raw);
  const analysis = await scoreTranscript(transcription.markdown);
  const completedStatus =
    analysis.overallResult === 'NOT_APPLICABLE' ? 'SKIPPED' : 'COMPLETED';

  await upsertAnalysisNotes({
    scorecardId: scorecard.id,
    analysis,
    transcriptMarkdown: transcription.markdown,
  });

  await upsertTranscriptionArtifactAttachments({
    scorecardId: scorecard.id,
    mediaFileUri: source.mediaFileUri,
    rawTranscript: source.raw,
  });

  const task = await createTaskIfNeeded({ scorecard, analysis });

  await updateQaScorecard({
    id: scorecard.id,
    data: {
      status: completedStatus,
      score: analysis.overallScore,
      result: analysis.overallResult,
      qaType: analysis.rubricType,
      redFlag: analysis.hasRedFlag,
      taskId: task.taskId,
      qaManagerId: task.qaManagerId,
      analyzedAt: new Date().toISOString(),
    },
  });

  return {
    scorecardId: scorecard.id,
    status: completedStatus,
    shouldPollAgain: false,
    taskId: task.taskId,
  };
};

const processScorecard = async ({
  scorecard,
  isFinalAttempt,
}: {
  scorecard: QaScorecardRecord;
  isFinalAttempt: boolean;
}): Promise<ProcessedScorecard> => {
  if (scorecard.status === 'SCORING') {
    const cachedSource = await readCachedTranscriptionSource(scorecard);

    if (cachedSource !== null) {
      return scoreTranscriptionSource({
        scorecard,
        source: cachedSource,
      });
    }

    await failScorecard({
      scorecard,
      errorMessage: 'Missing cached Amazon Transcribe output',
    });

    return {
      scorecardId: scorecard.id,
      status: 'FAILED',
      shouldPollAgain: false,
      error: 'Missing cached Amazon Transcribe output',
    };
  }

  const callId = scorecard.callId ?? scorecard.sourceCallKey;

  if (callId === undefined || callId === null || callId.length === 0) {
    const cachedSource = await readCachedTranscriptionSource(scorecard);

    if (cachedSource !== null) {
      return scoreTranscriptionSource({
        scorecard,
        source: cachedSource,
      });
    }

    await failScorecard({
      scorecard,
      errorMessage: 'Missing source Call for Amazon Transcribe job lookup',
    });

    return {
      scorecardId: scorecard.id,
      status: 'FAILED',
      shouldPollAgain: false,
      error: 'Missing source Call for Amazon Transcribe job lookup',
    };
  }

  const snapshot = await getTranscriptionJobSnapshot(
    buildTranscriptionJobName(callId),
  );

  if (snapshot.status === 'QUEUED' || snapshot.status === 'IN_PROGRESS') {
    if (isFinalAttempt) {
      const errorMessage = buildTranscribePollingTimeoutMessage(
        snapshot.status,
      );

      await failScorecard({
        scorecard,
        errorMessage,
      });

      return {
        scorecardId: scorecard.id,
        status: 'FAILED',
        shouldPollAgain: false,
        error: errorMessage,
      };
    }

    return {
      scorecardId: scorecard.id,
      status: snapshot.status,
      shouldPollAgain: true,
    };
  }

  if (snapshot.status === 'FAILED') {
    const errorMessage =
      snapshot.failureReason ?? 'Amazon Transcribe job failed';
    const cachedSource = await readCachedTranscriptionSource(scorecard);

    if (cachedSource !== null) {
      return scoreTranscriptionSource({
        scorecard,
        source: {
          ...cachedSource,
        },
      });
    }

    await failScorecard({
      scorecard,
      errorMessage,
    });

    return {
      scorecardId: scorecard.id,
      status: 'FAILED',
      shouldPollAgain: false,
      error: errorMessage,
    };
  }

  if (
    snapshot.transcriptFileUri === undefined ||
    snapshot.transcriptFileUri.length === 0
  ) {
    const cachedSource = await readCachedTranscriptionSource(scorecard);

    if (cachedSource !== null) {
      return scoreTranscriptionSource({
        scorecard,
        source: {
          ...cachedSource,
          mediaFileUri: snapshot.mediaFileUri,
        },
      });
    }

    throw new Error('Missing Amazon Transcribe output URI');
  }

  return scoreTranscriptionSource({
    scorecard,
    source: {
      raw: await readTranscribeOutputFromUri(snapshot.transcriptFileUri),
      transcriptFileUri: snapshot.transcriptFileUri,
      mediaFileUri: snapshot.mediaFileUri,
    },
  });
};

export const completeComplianceQaHandler = async (
  input: CompleteComplianceQaInput | null = {},
): Promise<CompleteComplianceQaResult> => {
  const isFinalAttempt = input?.isFinalAttempt === true;

  if (input?.scorecardId !== undefined && input.scorecardId.trim().length > 0) {
    const scorecard = await findQaScorecardById(input.scorecardId);

    if (scorecard === null) {
      return {
        processed: 0,
        status: 'NOT_FOUND',
        scorecardId: input.scorecardId,
        shouldPollAgain: false,
        results: [
          {
            scorecardId: input.scorecardId,
            status: 'NOT_FOUND',
            shouldPollAgain: false,
            error: `QA Scorecard not found: ${input.scorecardId}`,
          },
        ],
      };
    }

    if (!isProcessableScorecardStatus(scorecard.status)) {
      const status = scorecard.status ?? 'UNKNOWN';

      return {
        processed: 0,
        status,
        scorecardId: scorecard.id,
        shouldPollAgain: false,
        results: [
          {
            scorecardId: scorecard.id,
            status,
            shouldPollAgain: false,
          },
        ],
      };
    }

    try {
      const result = await processScorecard({
        scorecard,
        isFinalAttempt,
      });

      return {
        processed: 1,
        status: result.status,
        scorecardId: result.scorecardId,
        shouldPollAgain: result.shouldPollAgain,
        results: [result],
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      await failScorecard({
        scorecard,
        errorMessage,
      });

      return {
        processed: 1,
        status: 'FAILED',
        scorecardId: scorecard.id,
        shouldPollAgain: false,
        results: [
          {
            scorecardId: scorecard.id,
            status: 'FAILED',
            shouldPollAgain: false,
            error: errorMessage,
          },
        ],
      };
    }
  }

  const batchSize = Math.min(input?.batchSize ?? 20, 50);
  const scorecards = await findProcessableQaScorecards(batchSize);
  const results: ProcessedScorecard[] = [];

  for (const scorecard of scorecards) {
    try {
      results.push(
        await processScorecard({
          scorecard,
          isFinalAttempt: false,
        }),
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      await failScorecard({
        scorecard,
        errorMessage,
      });

      results.push({
        scorecardId: scorecard.id,
        status: 'FAILED',
        shouldPollAgain: false,
        error: errorMessage,
      });
    }
  }

  const firstResult = results[0];

  return {
    processed: results.length,
    status: firstResult?.status,
    scorecardId: firstResult?.scorecardId,
    shouldPollAgain: results.some((result) =>
      shouldPollAgainForStatus(result.status),
    ),
    results,
  };
};

export default defineLogicFunction({
  universalIdentifier: '1d130ba7-5495-481c-935a-30397621df56',
  name: 'complete-compliance-qa',
  description:
    'Checks one pending Amazon Transcribe job or a small batch, scores completed transcripts, and creates QA manager follow-up tasks.',
  timeoutSeconds: 300,
  handler: completeComplianceQaHandler,
  workflowActionTriggerSettings: {
    label: 'Complete Compliance QA',
    inputSchema: [
      {
        type: 'object',
        properties: {
          scorecardId: {
            type: 'string',
          },
          isFinalAttempt: {
            type: 'boolean',
          },
          batchSize: {
            type: 'number',
          },
        },
      },
    ],
    outputSchema: [
      {
        type: 'object',
        properties: {
          processed: { type: 'number' },
          status: { type: 'string' },
          scorecardId: { type: 'string' },
          shouldPollAgain: { type: 'boolean' },
          results: { type: 'array' },
        },
      },
    ],
  },
});
