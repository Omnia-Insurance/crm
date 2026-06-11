import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getTranscriptLanguageCodes,
  isDeepgramTranscriptResult,
  isTranscriptionRetryableError,
  normalizeDeepgramTranscript,
  shouldTranslateTranscriptToEnglish,
  transcribeRecording,
  type DeepgramTranscriptResult,
  type DeepgramWord,
} from 'src/utils/deepgram';
import { buildTranscriptOutputKey } from 'src/utils/recording-storage';

const word = (
  text: string,
  language: string,
  speaker: number,
): DeepgramWord => ({
  word: text.toLowerCase(),
  punctuated_word: text,
  speaker,
  language,
});

const buildRaw = ({
  words,
  utterances,
}: Pick<
  NonNullable<DeepgramTranscriptResult['results']>,
  'utterances'
> & {
  words: DeepgramWord[];
}): DeepgramTranscriptResult => ({
  metadata: { duration: 120 },
  results: {
    channels: [
      {
        alternatives: [
          {
            transcript: words.map((w) => w.punctuated_word).join(' '),
            languages: [...new Set(words.map((w) => w.language ?? 'en'))],
            words,
          },
        ],
      },
    ],
    utterances,
  },
});

describe('Compliance QA Deepgram helpers', () => {
  it('versions deterministic transcript output keys so Deepgram reruns do not reuse Amazon Transcribe output', () => {
    process.env.COMPLIANCE_QA_TRANSCRIBE_OUTPUT_PREFIX = 'compliance-qa/output';

    expect(buildTranscriptOutputKey('call-123')).toBe(
      'compliance-qa/output/call-123-dg-v1.json',
    );
  });

  it('recognizes the Deepgram response shape and rejects Amazon Transcribe output', () => {
    expect(
      isDeepgramTranscriptResult({
        results: { channels: [{ alternatives: [] }] },
      }),
    ).toBe(true);
    expect(
      isDeepgramTranscriptResult({
        results: { transcripts: [{ transcript: 'legacy amazon shape' }] },
      }),
    ).toBe(false);
    expect(isDeepgramTranscriptResult(null)).toBe(false);
  });

  it('detects normalized language codes from channel and word tags', () => {
    const words = [
      word('Hola', 'es', 0),
      word('necesito', 'es', 0),
      word('help', 'en', 1),
    ];

    expect(
      getTranscriptLanguageCodes(buildRaw({ words, utterances: [] })),
    ).toEqual(['es', 'en']);
  });

  it('merges consecutive same-speaker utterances and carries dominant segment language', () => {
    const agentWords = [word('Hello', 'en', 0), word('there.', 'en', 0)];
    const customerWords = [
      word('Hola,', 'es', 1),
      word('necesito', 'es', 1),
      word('help.', 'en', 1),
    ];
    const raw = buildRaw({
      words: [...agentWords, ...customerWords],
      utterances: [
        {
          start: 0,
          end: 1,
          speaker: 0,
          transcript: 'Hello',
          words: [agentWords[0]],
        },
        {
          start: 1,
          end: 2,
          speaker: 0,
          transcript: 'there.',
          words: [agentWords[1]],
        },
        {
          start: 2,
          end: 5,
          speaker: 1,
          transcript: 'Hola, necesito help.',
          words: customerWords,
        },
      ],
    });

    const transcription = normalizeDeepgramTranscript(raw);

    expect(transcription.segments).toHaveLength(2);
    expect(transcription.segments[0]).toMatchObject({
      speaker: 'Speaker 0',
      text: 'Hello there.',
      startTime: 0,
      endTime: 2,
      languageCode: 'en',
    });
    expect(transcription.segments[1]).toMatchObject({
      speaker: 'Speaker 1',
      languageCode: 'es',
    });
    expect(transcription.durationSeconds).toBe(120);
    expect(transcription.markdown).toContain(
      '**Speaker 0** [0:00]: Hello there.',
    );
  });

  it('falls back to a single segment when utterances are missing', () => {
    const words = [word('Hello', 'en', 0)];
    const transcription = normalizeDeepgramTranscript(
      buildRaw({ words, utterances: undefined }),
    );

    expect(transcription.segments).toHaveLength(1);
    expect(transcription.segments[0]).toMatchObject({
      speaker: 'Speaker',
      text: 'Hello',
      languageCode: 'en',
    });
  });

  it('does not translate English calls with stray IVR Spanish words', () => {
    const words = [
      ...Array.from({ length: 98 }, (_, index) =>
        word(`english${index}`, 'en', 0),
      ),
      word('Para', 'es', 2),
      word('español,', 'es', 2),
    ];

    expect(
      shouldTranslateTranscriptToEnglish(buildRaw({ words, utterances: [] })),
    ).toBe(false);
  });

  it('translates calls with a meaningful Spanish word share', () => {
    const words = [
      ...Array.from({ length: 60 }, (_, index) =>
        word(`english${index}`, 'en', 0),
      ),
      ...Array.from({ length: 40 }, (_, index) =>
        word(`palabra${index}`, 'es', 1),
      ),
    ];

    expect(
      shouldTranslateTranscriptToEnglish(buildRaw({ words, utterances: [] })),
    ).toBe(true);
  });

  it('does not translate when no words carry language tags', () => {
    expect(
      shouldTranslateTranscriptToEnglish(
        buildRaw({
          words: [{ word: 'hello', punctuated_word: 'Hello' }],
          utterances: [],
        }),
      ),
    ).toBe(false);
  });
});

describe('transcribeRecording error classification', () => {
  const audio = { content: new Uint8Array([1]), contentType: 'audio/mpeg' };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fails fast on a missing API key instead of cycling the polling window', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', '');

    const error = await transcribeRecording(audio).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    expect(isTranscriptionRetryableError(error)).toBe(false);
    expect((error as Error).message).toContain('DEEPGRAM_API_KEY');
  });

  it('treats a mid-body read failure as retryable', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error('terminated');
        },
      })),
    );

    const error = await transcribeRecording(audio).catch(
      (caught: unknown) => caught,
    );

    expect(isTranscriptionRetryableError(error)).toBe(true);
  });

  it('treats HTTP 429 as retryable and HTTP 400 as terminal', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key');

    const respond = (status: number) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status,
          text: async () => 'detail',
        })),
      );

    respond(429);
    expect(
      isTranscriptionRetryableError(
        await transcribeRecording(audio).catch((caught: unknown) => caught),
      ),
    ).toBe(true);

    respond(400);
    const terminal = await transcribeRecording(audio).catch(
      (caught: unknown) => caught,
    );

    expect(isTranscriptionRetryableError(terminal)).toBe(false);
    expect((terminal as Error).message).toContain('400');
  });
});
