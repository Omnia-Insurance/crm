import {
  formatTranscriptMarkdown,
  getDominantLanguageCode,
  isSpanishLanguageCode,
  normalizeLanguageCode,
  type TranscriptSegment,
  type TranscriptionResult,
} from 'src/utils/transcript';

const DEEPGRAM_LISTEN_URL = 'https://api.deepgram.com/v1/listen';

// Transcription must finish well inside the 300s logic-function budget so the
// transcript can still be cached to S3 before the function is killed.
export const TRANSCRIPTION_REQUEST_TIMEOUT_MS = 240_000;

// A call is translated to English only when at least this fraction of its
// language-tagged words are Spanish. IVR fragments like "Para español, oprima
// dos" tag a handful of Spanish words on otherwise-English calls and must not
// trigger a paid translation pass.
const SPANISH_WORD_FRACTION_THRESHOLD = 0.05;

export const DEEPGRAM_TRANSCRIPTION_QUERY: Record<string, string> = {
  model: 'nova-3',
  // Word-level English/Spanish code-switching; each word carries a language tag.
  language: 'multi',
  diarize: 'true',
  utterances: 'true',
  paragraphs: 'true',
  smart_format: 'true',
  // PHI: keep call audio out of Deepgram's Model Improvement Program retention.
  // Required under the Omnia BAA — do not remove.
  mip_opt_out: 'true',
};

export type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  confidence?: number;
  speaker?: number;
  language?: string;
};

export type DeepgramUtterance = {
  start?: number;
  end?: number;
  transcript?: string;
  speaker?: number;
  words?: DeepgramWord[];
};

export type DeepgramAlternative = {
  transcript?: string;
  confidence?: number;
  languages?: string[];
  words?: DeepgramWord[];
};

export type DeepgramTranscriptResult = {
  metadata?: {
    request_id?: string;
    sha256?: string;
    duration?: number;
  };
  results?: {
    channels?: { alternatives?: DeepgramAlternative[] }[];
    utterances?: DeepgramUtterance[];
  };
};

export class TranscriptionRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionRetryableError';
  }
}

export const isTranscriptionRetryableError = (
  error: unknown,
): error is TranscriptionRetryableError =>
  error instanceof TranscriptionRetryableError;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isDeepgramTranscriptResult = (
  value: unknown,
): value is DeepgramTranscriptResult => {
  if (!isRecord(value)) {
    return false;
  }

  const results = value.results;

  if (!isRecord(results)) {
    return false;
  }

  return (
    Array.isArray(results.channels) &&
    (results.utterances === undefined || Array.isArray(results.utterances))
  );
};

const getDeepgramApiKey = (): string => {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();

  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(
      'DEEPGRAM_API_KEY is required for Compliance QA transcription',
    );
  }

  return apiKey;
};

const isRetryableTranscriptionHttpStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

export const transcribeRecording = async ({
  content,
  contentType,
}: {
  content: Uint8Array;
  contentType: string;
}): Promise<DeepgramTranscriptResult> => {
  const query = new URLSearchParams(DEEPGRAM_TRANSCRIPTION_QUERY);
  // Resolved outside the retry classification: a missing key is a config
  // error that must fail fast, not cycle the polling window as retryable.
  const apiKey = getDeepgramApiKey();
  let response: Response;

  try {
    response = await fetch(`${DEEPGRAM_LISTEN_URL}?${query.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      // Buffer is typed over ArrayBufferLike, which Node's BodyInit rejects
      // even though fetch accepts it at runtime.
      body: content as BodyInit,
      signal: AbortSignal.timeout(TRANSCRIPTION_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TranscriptionRetryableError(
      `Deepgram request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    // The abort timer also governs body consumption; a failed error-body
    // read is itself transient, so keep the HTTP status visible and retry.
    let detail = '';

    try {
      detail = (await response.text()).slice(0, 500);
    } catch (error) {
      throw new TranscriptionRetryableError(
        `Deepgram returned HTTP ${response.status}; error body read failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const message = `Deepgram returned HTTP ${response.status}: ${detail}`;

    if (isRetryableTranscriptionHttpStatus(response.status)) {
      throw new TranscriptionRetryableError(message);
    }

    throw new Error(message);
  }

  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch (error) {
    // A truncated or aborted body is the dominant cause of a JSON read
    // failure here; the next polling attempt retries it.
    throw new TranscriptionRetryableError(
      `Deepgram response body read failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!isDeepgramTranscriptResult(parsed)) {
    throw new Error('Deepgram response had an unexpected shape');
  }

  return parsed;
};

const getFirstAlternative = (
  raw: DeepgramTranscriptResult,
): DeepgramAlternative | undefined =>
  raw.results?.channels?.[0]?.alternatives?.[0];

const getWordLanguageCodes = (words: DeepgramWord[]): string[] =>
  words
    .map((word) => word.language)
    .filter(
      (language): language is string =>
        typeof language === 'string' && language.length > 0,
    );

export const getTranscriptLanguageCodes = (
  raw: DeepgramTranscriptResult,
): string[] => {
  const languageCodes = new Set<string>();
  const addLanguageCode = (languageCode: string | undefined): void => {
    if (languageCode === undefined) {
      return;
    }

    const normalizedLanguageCode = normalizeLanguageCode(languageCode);

    if (normalizedLanguageCode !== null) {
      languageCodes.add(normalizedLanguageCode);
    }
  };

  const alternative = getFirstAlternative(raw);

  for (const languageCode of alternative?.languages ?? []) {
    addLanguageCode(languageCode);
  }

  for (const languageCode of getWordLanguageCodes(alternative?.words ?? [])) {
    addLanguageCode(languageCode);
  }

  return [...languageCodes];
};

export const shouldTranslateTranscriptToEnglish = (
  raw: DeepgramTranscriptResult,
): boolean => {
  const taggedLanguageCodes = getWordLanguageCodes(
    getFirstAlternative(raw)?.words ?? [],
  );

  if (taggedLanguageCodes.length === 0) {
    return false;
  }

  const spanishWordCount = taggedLanguageCodes.filter(isSpanishLanguageCode)
    .length;

  return (
    spanishWordCount / taggedLanguageCodes.length >=
    SPANISH_WORD_FRACTION_THRESHOLD
  );
};

type SegmentAccumulator = {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  wordLanguageCodes: string[];
};

export const normalizeDeepgramTranscript = (
  raw: DeepgramTranscriptResult,
): TranscriptionResult => {
  const alternative = getFirstAlternative(raw);
  const fullTranscript = alternative?.transcript ?? '';
  const utterances = raw.results?.utterances ?? [];
  const accumulators: SegmentAccumulator[] = [];

  for (const utterance of utterances) {
    const text = utterance.transcript?.trim() ?? '';

    if (text.length === 0) {
      continue;
    }

    const speaker = `Speaker ${utterance.speaker ?? 0}`;
    const startTime = utterance.start ?? 0;
    const endTime = utterance.end ?? startTime;
    const wordLanguageCodes = getWordLanguageCodes(utterance.words ?? []);
    const previous = accumulators[accumulators.length - 1];

    if (previous !== undefined && previous.speaker === speaker) {
      previous.text = `${previous.text} ${text}`;
      previous.endTime = endTime;
      previous.wordLanguageCodes.push(...wordLanguageCodes);
      continue;
    }

    accumulators.push({
      speaker,
      text,
      startTime,
      endTime,
      wordLanguageCodes,
    });
  }

  const segments: TranscriptSegment[] = accumulators.map((accumulator) => ({
    speaker: accumulator.speaker,
    text: accumulator.text,
    startTime: accumulator.startTime,
    endTime: accumulator.endTime,
    languageCode: getDominantLanguageCode(accumulator.wordLanguageCodes),
  }));

  const fallbackSegments =
    segments.length > 0
      ? segments
      : [
          {
            speaker: 'Speaker',
            text: fullTranscript,
            startTime: 0,
            endTime: raw.metadata?.duration ?? 0,
            languageCode: getDominantLanguageCode(
              getWordLanguageCodes(alternative?.words ?? []),
            ),
          },
        ];

  const lastSegment = fallbackSegments[fallbackSegments.length - 1];

  return {
    segments: fallbackSegments,
    fullTranscript,
    markdown: formatTranscriptMarkdown(fallbackSegments),
    durationSeconds: raw.metadata?.duration ?? lastSegment?.endTime ?? 0,
  };
};
