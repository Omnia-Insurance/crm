import { RED_FLAGS } from 'src/constants/compliance-rules';
import { startComplianceQaHandler } from 'src/logic-functions/start-compliance-qa';
import {
  getTranscriptLanguageCodes,
  isTranscriptionRetryableError,
  normalizeDeepgramTranscript,
  shouldTranslateTranscriptToEnglish,
  transcribeRecording,
  TRANSCRIPTION_REQUEST_TIMEOUT_MS,
  type DeepgramTranscriptResult,
} from 'src/utils/deepgram';
import {
  claimTranscriptionForCall,
  findStoredRecordingForCall,
  readCachedTranscriptForCall,
  releaseTranscriptionClaimForCall,
  writeTranscriptForCall,
} from 'src/utils/recording-storage';
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

const FUNCTION_TIMEOUT_SECONDS = 300;

type TranscriptionSource = {
  raw: DeepgramTranscriptResult;
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
    'Transcription artifacts for this QA run.',
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
  rawTranscript: DeepgramTranscriptResult;
}): Promise<void> => {
  await upsertTranscriptionArtifactNote({
    scorecardId,
    mediaFileUri,
    transcriptFileUri,
  });

  await Promise.allSettled([
    upsertQaScorecardAttachmentIfPossible({
      scorecardId,
      name: 'Deepgram Transcript JSON',
      filename: 'deepgram-transcript.json',
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
  status === 'SCORING';

const buildTranscriptionRetryTimeoutMessage = (detail: string): string =>
  `Deepgram transcription did not succeed before the Compliance workflow polling window expired. Last error: ${detail}`;

const readCachedTranscriptionSource = async (
  scorecard: QaScorecardRecord,
): Promise<TranscriptionSource | null> => {
  const callId = scorecard.callId ?? scorecard.sourceCallKey;

  if (callId === undefined || callId === null || callId.length === 0) {
    return null;
  }

  const cachedTranscript = await readCachedTranscriptForCall(callId);

  if (cachedTranscript === null) {
    return null;
  }

  return {
    raw: cachedTranscript.raw,
    transcriptFileUri: cachedTranscript.transcriptFileUri,
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

  const transcription = normalizeDeepgramTranscript(source.raw);
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

const retryRecordingCopy = async ({
  scorecard,
  callId,
  isFinalAttempt,
}: {
  scorecard: QaScorecardRecord;
  callId: string;
  isFinalAttempt: boolean;
}): Promise<ProcessedScorecard> => {
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
};

const hasRecordingReadyStatus = (status: string): boolean =>
  status === 'TRANSCRIBING' || status === 'SCORING';

const transcribeAndScoreFromStorage = async ({
  scorecard,
  callId,
  isFinalAttempt,
  allowCopyRetry,
}: {
  scorecard: QaScorecardRecord;
  callId: string;
  isFinalAttempt: boolean;
  allowCopyRetry: boolean;
}): Promise<ProcessedScorecard> => {
  const cachedSource = await readCachedTranscriptionSource(scorecard);

  if (cachedSource !== null) {
    return scoreTranscriptionSource({
      scorecard,
      source: cachedSource,
    });
  }

  const storedRecording = await findStoredRecordingForCall(callId);

  if (storedRecording === null) {
    if (!allowCopyRetry) {
      const errorMessage =
        'Recording missing from S3 immediately after a successful copy';

      await failScorecard({ scorecard, errorMessage });

      return {
        scorecardId: scorecard.id,
        status: 'FAILED',
        shouldPollAgain: false,
        error: errorMessage,
      };
    }

    // Demote first: start-compliance-qa short-circuits on in-progress
    // statuses, so without this the retry would be a silent no-op loop.
    await updateQaScorecard({
      id: scorecard.id,
      data: { status: 'COPYING_RECORDING' },
    });

    const copyResult = await retryRecordingCopy({
      scorecard,
      callId,
      isFinalAttempt,
    });

    if (!hasRecordingReadyStatus(copyResult.status)) {
      return copyResult;
    }

    return transcribeAndScoreFromStorage({
      scorecard,
      callId,
      isFinalAttempt,
      allowCopyRetry: false,
    });
  }

  const claim = await claimTranscriptionForCall(callId);

  if (claim === 'busy') {
    // Another invocation is paying for this transcription right now and will
    // finish the scorecard; re-check the cache once in case it just landed.
    const freshSource = await readCachedTranscriptionSource(scorecard);

    if (freshSource !== null) {
      return scoreTranscriptionSource({
        scorecard,
        source: freshSource,
      });
    }

    return {
      scorecardId: scorecard.id,
      status: 'TRANSCRIBING',
      shouldPollAgain: true,
    };
  }

  let raw: DeepgramTranscriptResult;

  try {
    raw = await transcribeRecording({
      content: storedRecording.content,
      contentType: storedRecording.contentType,
    });
  } catch (error) {
    await releaseTranscriptionClaimForCall(callId);

    if (!isTranscriptionRetryableError(error)) {
      throw error;
    }

    const errorMessage = getErrorMessage(error);

    if (isFinalAttempt) {
      const timeoutMessage = buildTranscriptionRetryTimeoutMessage(
        errorMessage,
      );

      await failScorecard({
        scorecard,
        errorMessage: timeoutMessage,
      });

      return {
        scorecardId: scorecard.id,
        status: 'FAILED',
        shouldPollAgain: false,
        error: timeoutMessage,
      };
    }

    await updateQaScorecard({
      id: scorecard.id,
      data: { status: 'TRANSCRIBING' },
    });

    return {
      scorecardId: scorecard.id,
      status: 'TRANSCRIBING',
      shouldPollAgain: true,
      error: errorMessage,
    };
  }

  let cachedTranscript;

  try {
    cachedTranscript = await writeTranscriptForCall({ callId, raw });
  } finally {
    await releaseTranscriptionClaimForCall(callId);
  }

  return scoreTranscriptionSource({
    scorecard,
    source: {
      raw,
      transcriptFileUri: cachedTranscript.transcriptFileUri,
      mediaFileUri: `s3://${storedRecording.bucket}/${storedRecording.inputKey}`,
    },
  });
};

const processScorecard = async ({
  scorecard,
  isFinalAttempt,
}: {
  scorecard: QaScorecardRecord;
  isFinalAttempt: boolean;
}): Promise<ProcessedScorecard> => {
  const callId = scorecard.callId ?? scorecard.sourceCallKey;

  if (callId === undefined || callId === null || callId.length === 0) {
    const errorMessage =
      scorecard.status === 'COPYING_RECORDING'
        ? 'Missing source Call for recording retry'
        : 'Missing source Call for transcription';

    await failScorecard({ scorecard, errorMessage });

    return {
      scorecardId: scorecard.id,
      status: 'FAILED',
      shouldPollAgain: false,
      error: errorMessage,
    };
  }

  if (scorecard.status === 'COPYING_RECORDING') {
    const copyResult = await retryRecordingCopy({
      scorecard,
      callId,
      isFinalAttempt,
    });

    if (!hasRecordingReadyStatus(copyResult.status)) {
      return copyResult;
    }

    // The recording (or a cached transcript) just landed — finish in this
    // invocation instead of burning another polling attempt on it.
    return transcribeAndScoreFromStorage({
      scorecard,
      callId,
      isFinalAttempt,
      allowCopyRetry: false,
    });
  }

  // TRANSCRIBING and SCORING converge: a cached transcript is scored directly,
  // anything else is (re-)transcribed from the recording archived in S3.
  return transcribeAndScoreFromStorage({
    scorecard,
    callId,
    isFinalAttempt,
    allowCopyRetry: true,
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

  // Each uncached batch item now performs a synchronous transcription, so the
  // default is small and the loop stops starting items once another
  // worst-case transcription would no longer fit the 300s function budget.
  const batchSize = Math.min(input?.batchSize ?? 3, 50);
  const scorecards = await findProcessableQaScorecards(batchSize);
  const results: ProcessedScorecard[] = [];
  const startedAtMs = Date.now();
  const batchDeadlineMs =
    FUNCTION_TIMEOUT_SECONDS * 1000 -
    (TRANSCRIPTION_REQUEST_TIMEOUT_MS + 15_000);

  for (const scorecard of scorecards) {
    if (Date.now() - startedAtMs > batchDeadlineMs) {
      break;
    }

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
    shouldPollAgain:
      results.some((result) => shouldPollAgainForStatus(result.status)) ||
      results.length < scorecards.length,
    results,
  };
};

export default defineLogicFunction({
  universalIdentifier: '1d130ba7-5495-481c-935a-30397621df56',
  name: 'complete-compliance-qa',
  description:
    'Transcribes one pending recording or a small batch with Deepgram, scores completed transcripts, and creates QA manager follow-up tasks.',
  timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
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
