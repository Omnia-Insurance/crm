import { RED_FLAGS } from 'src/constants/compliance-rules';
import { startComplianceQaHandler } from 'src/logic-functions/start-compliance-qa';
import {
  buildSampleRateFallbackTranscriptionJobName,
  buildTranscriptionJobName,
  findTranscriptionJobSnapshot,
  getTranscriptLanguageCodes,
  getTranscriptionJobSnapshot,
  isInvalidInputMediaFailure,
  normalizeAmazonTranscript,
  readCachedTranscribeOutputForCall,
  readMediaSampleRateHertzFromUri,
  readTranscribeOutputFromUri,
  shouldTranslateTranscriptToEnglish,
  startSampleRateFallbackTranscriptionJob,
  type AmazonTranscriptResult,
  type TranscriptionJobSnapshot,
} from 'src/utils/aws-transcribe';
import {
  translateTranscriptToEnglish,
  type TranslatedTranscriptionResult,
} from 'src/utils/aws-translate';
import { getErrorMessage } from 'src/utils/error-message';
import {
  formatFullName,
  markQaManagerAssigned,
  resolveQaManager,
} from 'src/utils/qa-manager';
import {
  createFollowUpTask,
  findQaScorecardById,
  findProcessableQaScorecards,
  findTaskIdLinkedToQaScorecard,
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

const upsertTranscriptionArtifactNote = async ({
  scorecardId,
  mediaFileUri,
  transcriptFileUri,
}: {
  scorecardId: string;
  mediaFileUri?: string;
  transcriptFileUri: string;
}): Promise<void> => {
  const lines = [
    'Amazon Transcribe artifacts for this QA run.',
    '',
    'The source recording remains on the linked Source Call record. Large call audio is not copied into scorecard Files.',
  ];

  if (mediaFileUri !== undefined && mediaFileUri.length > 0) {
    lines.push('', `Input Recording S3: ${mediaFileUri}`);
  }

  lines.push(`Output Transcript JSON: ${transcriptFileUri}`);

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

  const recordingUrl = scorecard.call?.recording?.primaryLinkUrl?.trim();

  lines.push(
    recordingUrl !== undefined && recordingUrl.length > 0
      ? `Recording: ${recordingUrl}`
      : 'Recording: open the linked Source Call record',
  );

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

const isDuplicateTaskCreateError = (error: unknown): boolean => {
  const errorMessage = getErrorMessage(error).toLowerCase();

  return (
    errorMessage.includes('duplicate') ||
    errorMessage.includes('already exists') ||
    errorMessage.includes('unique constraint')
  );
};

const formatJsonMarkdown = (value: unknown): string =>
  ['```json', JSON.stringify(value, null, 2), '```'].join('\n');

const upsertAnalysisNotes = async ({
  scorecardId,
  analysis,
  transcriptMarkdown,
  translatedTranscriptMarkdown,
  transcriptLanguageMarkdown,
}: {
  scorecardId: string;
  analysis: FinalScorecardAnalysis;
  transcriptMarkdown: string;
  translatedTranscriptMarkdown?: string;
  transcriptLanguageMarkdown?: string;
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
    translatedTranscriptMarkdown !== undefined &&
    translatedTranscriptMarkdown.length > 0
      ? upsertQaScorecardNote({
          scorecardId,
          title: 'Translated Transcript',
          markdown: translatedTranscriptMarkdown,
        })
      : Promise.resolve(null),
    transcriptLanguageMarkdown !== undefined &&
    transcriptLanguageMarkdown.length > 0
      ? upsertQaScorecardNote({
          scorecardId,
          title: 'Transcript Language',
          markdown: transcriptLanguageMarkdown,
        })
      : Promise.resolve(null),
    upsertQaScorecardNote({
      scorecardId,
      title: 'Transcript',
      markdown: transcriptMarkdown,
    }),
  ]);
};

const buildTranscriptLanguageMarkdown = ({
  languageCodes,
  translatedTranscription,
}: {
  languageCodes: string[];
  translatedTranscription?: TranslatedTranscriptionResult;
}): string => {
  const lines = [
    `Detected language(s): ${
      languageCodes.length > 0 ? languageCodes.join(', ') : 'unknown'
    }`,
    `Scored transcript: ${
      translatedTranscription !== undefined
        ? 'Translated Transcript'
        : 'Transcript'
    }`,
  ];

  if (translatedTranscription !== undefined) {
    lines.push(
      `Translation: ${translatedTranscription.sourceLanguageCode} -> ${translatedTranscription.targetLanguageCode}`,
      `Translation provider: ${translatedTranscription.translationProvider}`,
      `Translated segments: ${translatedTranscription.translatedSegmentCount}`,
    );
  }

  return lines.join('\n');
};

const upsertTranscriptionArtifactAttachments = async ({
  scorecardId,
  mediaFileUri,
  transcriptFileUri,
  rawTranscript,
}: {
  scorecardId: string;
  mediaFileUri?: string;
  transcriptFileUri: string;
  rawTranscript: AmazonTranscriptResult;
}): Promise<void> => {
  await upsertTranscriptionArtifactNote({
    scorecardId,
    mediaFileUri,
    transcriptFileUri,
  });

  await Promise.allSettled([
    upsertQaScorecardAttachmentIfPossible({
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

const keepRecordingRetryable = async ({
  scorecard,
  detail,
}: {
  scorecard: QaScorecardRecord;
  detail: string;
}): Promise<void> => {
  await upsertQaScorecardNote({
    scorecardId: scorecard.id,
    title: 'Recording Pending',
    markdown:
      `${detail}\n\n` +
      'The scorecard remains in Copying Recording so Compliance QA can retry when the provider finishes publishing the recording.',
  });

  await updateQaScorecard({
    id: scorecard.id,
    data: {
      status: 'COPYING_RECORDING',
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
  if (analysis.overallResult !== 'FAIL' || analysis.hasRedFlag !== true) {
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

  const linkedTaskId = await findTaskIdLinkedToQaScorecard(scorecard.id);

  if (linkedTaskId !== null) {
    await linkTaskToComplianceContextIfSupported({
      taskId: linkedTaskId,
      scorecardId: scorecard.id,
      callId: scorecard.callId,
      leadId: scorecard.leadId,
      agentId: scorecard.agentId,
    });

    return {
      taskId: linkedTaskId,
      qaManagerId: scorecard.qaManagerId ?? undefined,
    };
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

  let taskId: string;

  try {
    taskId = await createFollowUpTask({
      id: scorecard.id,
      title: buildFollowUpTaskTitle({ scorecard, analysis }),
      markdown: buildFollowUpTaskMarkdown({
        scorecard,
        analysis,
        managerWarning: qaManager.warning,
      }),
      assigneeId: qaManager.workspaceMemberId,
    });
  } catch (error) {
    if (!isDuplicateTaskCreateError(error)) {
      throw error;
    }

    taskId = scorecard.id;
  }

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
): boolean =>
  status === 'COPYING_RECORDING' ||
  status === 'TRANSCRIBING' ||
  status === 'SCORING';

const shouldPollAgainForStatus = (status: string): boolean =>
  status === 'COPYING_RECORDING' ||
  status === 'TRANSCRIBING' ||
  status === 'SCORING' ||
  status === 'QUEUED' ||
  status === 'IN_PROGRESS';

const buildTranscribePollingTimeoutMessage = (status: string): string =>
  `Amazon Transcribe job did not finish before the Compliance workflow polling window expired. Last status: ${status}`;

const SAMPLE_RATE_FALLBACK_ATTEMPTS = [1, 2, 3];

const getSampleRateFallbackHertz = async (
  snapshot: TranscriptionJobSnapshot,
): Promise<number | null> => {
  if (
    snapshot.mediaFileUri === undefined ||
    snapshot.mediaFormat === undefined ||
    snapshot.mediaFormat !== 'mp3'
  ) {
    return null;
  }

  return (
    (await readMediaSampleRateHertzFromUri({
      mediaFileUri: snapshot.mediaFileUri,
      mediaFormat: snapshot.mediaFormat,
    })) ?? null
  );
};

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

  return {
    raw: cachedTranscribeOutput.raw,
    transcriptFileUri: cachedTranscribeOutput.transcriptFileUri,
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
  const languageCodes = getTranscriptLanguageCodes(source.raw);
  const translatedTranscription = shouldTranslateTranscriptToEnglish(source.raw)
    ? await translateTranscriptToEnglish({
        transcription,
        languageCodes,
      })
    : undefined;
  const scoringTranscriptMarkdown =
    translatedTranscription?.markdown ?? transcription.markdown;
  const analysis = await scoreTranscript(scoringTranscriptMarkdown);
  const completedStatus =
    analysis.overallResult === 'NOT_APPLICABLE' ? 'SKIPPED' : 'COMPLETED';

  await upsertAnalysisNotes({
    scorecardId: scorecard.id,
    analysis,
    transcriptMarkdown: transcription.markdown,
    translatedTranscriptMarkdown: translatedTranscription?.markdown,
    transcriptLanguageMarkdown: buildTranscriptLanguageMarkdown({
      languageCodes,
      translatedTranscription,
    }),
  });

  await upsertTranscriptionArtifactAttachments({
    scorecardId: scorecard.id,
    mediaFileUri: source.mediaFileUri,
    transcriptFileUri: source.transcriptFileUri,
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

const processSampleRateFallback = async ({
  scorecard,
  callId,
  failedSnapshot,
}: {
  scorecard: QaScorecardRecord;
  callId: string;
  failedSnapshot: TranscriptionJobSnapshot;
}): Promise<ProcessedScorecard | null> => {
  if (!isInvalidInputMediaFailure(failedSnapshot.failureReason)) {
    return null;
  }

  if (
    failedSnapshot.mediaFileUri === undefined ||
    failedSnapshot.mediaFormat === undefined
  ) {
    return null;
  }

  const mediaSampleRateHertz =
    await getSampleRateFallbackHertz(failedSnapshot);

  if (mediaSampleRateHertz === null) {
    return null;
  }

  let lastFallbackFailure: string | undefined;

  for (const attempt of SAMPLE_RATE_FALLBACK_ATTEMPTS) {
    const fallbackJobName = buildSampleRateFallbackTranscriptionJobName(
      callId,
      attempt,
    );
    const fallbackSnapshot =
      await findTranscriptionJobSnapshot(fallbackJobName);

    if (fallbackSnapshot === null) {
      await startSampleRateFallbackTranscriptionJob({
        callId,
        attempt,
        mediaFileUri: failedSnapshot.mediaFileUri,
        mediaFormat: failedSnapshot.mediaFormat,
        mediaSampleRateHertz,
      });

      await updateQaScorecard({
        id: scorecard.id,
        data: { status: 'TRANSCRIBING' },
      });

      await upsertQaScorecardNote({
        scorecardId: scorecard.id,
        title: 'Transcription Retry',
        markdown:
          `Amazon Transcribe rejected the first MP3 attempt. ` +
          `Retrying with explicit ${mediaSampleRateHertz} Hz sample rate ` +
          `(attempt ${attempt}).`,
      });

      return {
        scorecardId: scorecard.id,
        status: 'QUEUED',
        shouldPollAgain: true,
      };
    }

    if (
      fallbackSnapshot.status === 'QUEUED' ||
      fallbackSnapshot.status === 'IN_PROGRESS'
    ) {
      return {
        scorecardId: scorecard.id,
        status: fallbackSnapshot.status,
        shouldPollAgain: true,
      };
    }

    if (fallbackSnapshot.status === 'FAILED') {
      lastFallbackFailure =
        fallbackSnapshot.failureReason ??
        'Amazon Transcribe sample-rate retry failed';
      continue;
    }

    if (
      fallbackSnapshot.transcriptFileUri === undefined ||
      fallbackSnapshot.transcriptFileUri.length === 0
    ) {
      throw new Error('Missing Amazon Transcribe sample-rate retry output URI');
    }

    return scoreTranscriptionSource({
      scorecard,
      source: {
        raw: await readTranscribeOutputFromUri(
          fallbackSnapshot.transcriptFileUri,
        ),
        transcriptFileUri: fallbackSnapshot.transcriptFileUri,
        mediaFileUri: fallbackSnapshot.mediaFileUri,
      },
    });
  }

  await failScorecard({
    scorecard,
    errorMessage:
      lastFallbackFailure ?? 'Amazon Transcribe sample-rate retry failed',
  });

  return {
    scorecardId: scorecard.id,
    status: 'FAILED',
    shouldPollAgain: false,
    error: lastFallbackFailure ?? 'Amazon Transcribe sample-rate retry failed',
  };
};

const processScorecard = async ({
  scorecard,
  isFinalAttempt,
}: {
  scorecard: QaScorecardRecord;
  isFinalAttempt: boolean;
}): Promise<ProcessedScorecard> => {
  if (scorecard.status === 'COPYING_RECORDING') {
    const callId = scorecard.callId ?? scorecard.sourceCallKey;

    if (callId === undefined || callId === null || callId.length === 0) {
      await failScorecard({
        scorecard,
        errorMessage: 'Missing source Call for recording retry',
      });

      return {
        scorecardId: scorecard.id,
        status: 'FAILED',
        shouldPollAgain: false,
        error: 'Missing source Call for recording retry',
      };
    }

    const startResult = await startComplianceQaHandler({ callId });

    if (!startResult.success) {
      await failScorecard({
        scorecard,
        errorMessage: startResult.error,
      });

      return {
        scorecardId: scorecard.id,
        status: 'FAILED',
        shouldPollAgain: false,
        error: startResult.error,
      };
    }

    if (startResult.status === 'COPYING_RECORDING' && isFinalAttempt) {
      const detail =
        'Recording URL did not return audio before the Compliance workflow polling window expired.';

      await keepRecordingRetryable({
        scorecard,
        detail,
      });

      return {
        scorecardId: scorecard.id,
        status: 'COPYING_RECORDING',
        shouldPollAgain: false,
        error: detail,
      };
    }

    return {
      scorecardId: scorecard.id,
      status: startResult.status,
      shouldPollAgain: shouldPollAgainForStatus(startResult.status),
    };
  }

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

    const sampleRateFallbackResult = await processSampleRateFallback({
      scorecard,
      callId,
      failedSnapshot: snapshot,
    });

    if (sampleRateFallbackResult !== null) {
      return sampleRateFallbackResult;
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
