import {
  TranslateClient,
  TranslateTextCommand,
} from '@aws-sdk/client-translate';
import { callAi, parseAiJson } from 'src/utils/call-ai';
import {
  formatTranscriptMarkdown,
  isSpanishLanguageCode,
  type TranscriptSegment,
  type TranscriptionResult,
} from 'src/utils/transcript';
import { getAwsClientConfig } from 'src/utils/aws-config';

const MAX_TRANSLATE_TEXT_LENGTH = 4_500;
const MAX_CONTEXTUAL_TRANSLATION_CHARS = 12_000;
const TARGET_LANGUAGE_CODE = 'en';
let translateClient: TranslateClient | null = null;

export type TranslatableSegment = Pick<TranscriptSegment, 'text'> & {
  index: number;
};

export type TranslateTextToEnglish = ({
  sourceLanguageCode,
  text,
}: {
  sourceLanguageCode: string;
  text: string;
}) => Promise<string>;

export type TranslateSegmentsToEnglish = ({
  segments,
}: {
  segments: TranslatableSegment[];
}) => Promise<Map<number, string>>;

export type TranslatedTranscriptionResult = {
  segments: TranscriptSegment[];
  fullTranscript: string;
  markdown: string;
  sourceLanguageCode: string;
  targetLanguageCode: typeof TARGET_LANGUAGE_CODE;
  translationProvider:
    | 'bedrock'
    | 'amazon-translate'
    | 'bedrock+amazon-translate-fallback';
  translatedSegmentCount: number;
};

export const chunkTextForTranslate = (text: string): string[] => {
  const trimmedText = text.trim();

  if (trimmedText.length <= MAX_TRANSLATE_TEXT_LENGTH) {
    return trimmedText.length > 0 ? [trimmedText] : [];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < trimmedText.length) {
    const maxEnd = Math.min(
      cursor + MAX_TRANSLATE_TEXT_LENGTH,
      trimmedText.length,
    );

    if (maxEnd === trimmedText.length) {
      chunks.push(trimmedText.slice(cursor).trim());
      break;
    }

    const windowText = trimmedText.slice(cursor, maxEnd);
    let lastWhitespaceIndex = -1;

    for (let index = windowText.length - 1; index > 0; index -= 1) {
      if (/\s/.test(windowText[index] ?? '')) {
        lastWhitespaceIndex = index;
        break;
      }
    }

    const end =
      lastWhitespaceIndex > 0 ? cursor + lastWhitespaceIndex : maxEnd;

    chunks.push(trimmedText.slice(cursor, end).trim());
    cursor = end;

    while (/\s/.test(trimmedText[cursor] ?? '')) {
      cursor += 1;
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
};

const getTranslateSourceLanguageCode = (languageCode: string): string =>
  languageCode.trim().split(/[-_]/)[0]?.toLowerCase() ?? 'es';

const getSpanishLanguageCode = (languageCodes: string[]): string =>
  languageCodes.find(isSpanishLanguageCode) ?? 'es';

export const chunkSegmentsForContextualTranslation = (
  segments: TranslatableSegment[],
): TranslatableSegment[][] => {
  const chunks: TranslatableSegment[][] = [];
  let currentChunk: TranslatableSegment[] = [];
  let currentLength = 0;

  for (const segment of segments) {
    const segmentLength = segment.text.length + 40;

    if (
      currentChunk.length > 0 &&
      currentLength + segmentLength > MAX_CONTEXTUAL_TRANSLATION_CHARS
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(segment);
    currentLength += segmentLength;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const getTranslateClient = (): TranslateClient => {
  translateClient ??= new TranslateClient(
    getAwsClientConfig({ serviceName: 'Compliance QA transcript translation' }),
  );

  return translateClient;
};

const translateTextToEnglishWithAws = async ({
  sourceLanguageCode,
  text,
}: {
  sourceLanguageCode: string;
  text: string;
}): Promise<string> => {
  const chunks = chunkTextForTranslate(text);

  if (chunks.length === 0) {
    return '';
  }

  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    const response = await getTranslateClient().send(
      new TranslateTextCommand({
        SourceLanguageCode: sourceLanguageCode,
        TargetLanguageCode: TARGET_LANGUAGE_CODE,
        Text: chunk,
      }),
    );

    translatedChunks.push(response.TranslatedText ?? '');
  }

  return translatedChunks.join(' ').trim();
};

const TRANSLATION_SYSTEM_PROMPT = [
  'You translate Spanish and Spanglish US health-insurance call transcripts into natural English for compliance QA.',
  'The input is automatic speech recognition (ASR) output, so it may include literal artifacts, filler words, repeated words, bad punctuation, and imperfect names.',
  'Translate the customer and agent meaning faithfully. Clean obvious ASR artifacts only when the intended meaning is clear.',
  'Do not summarize, omit, invent, or add compliance conclusions.',
  'Preserve names, dates, dollar amounts, email addresses, policy terms, carrier/product names, and numbers.',
  'Keep already-English phrases in natural English.',
  'If a phrase is unclear, translate what is clear and include [unclear: original phrase] for the uncertain portion.',
  'Return only JSON in this exact shape: {"translations":[{"index":0,"text":"English translation"}]}.',
].join('\n');

const buildContextualTranslationPrompt = (
  segments: TranslatableSegment[],
): string =>
  [
    'Translate these transcript segments to English.',
    '',
    'Return one translation for each input index. Keep the same index values.',
    '',
    JSON.stringify({ segments }, null, 2),
  ].join('\n');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseContextualTranslationResponse = (
  response: string,
): Map<number, string> => {
  const parsed = parseAiJson(response);
  let translations: unknown;

  if (Array.isArray(parsed)) {
    translations = parsed;
  } else if (isRecord(parsed)) {
    translations = parsed.translations;
  }

  if (!Array.isArray(translations)) {
    throw new Error(
      'Transcript translation response did not include translations',
    );
  }

  const translatedTextByIndex = new Map<number, string>();

  for (const translation of translations) {
    if (!isRecord(translation)) {
      continue;
    }

    const index = translation.index;
    const text = translation.text;

    if (
      typeof index === 'number' &&
      Number.isInteger(index) &&
      typeof text === 'string' &&
      text.trim().length > 0
    ) {
      translatedTextByIndex.set(index, text.trim());
    }
  }

  return translatedTextByIndex;
};

const translateSegmentsToEnglishWithBedrock = async ({
  segments,
}: {
  segments: TranslatableSegment[];
}): Promise<Map<number, string>> => {
  const translatedTextByIndex = new Map<number, string>();

  for (const chunk of chunkSegmentsForContextualTranslation(segments)) {
    const response = await callAi(
      TRANSLATION_SYSTEM_PROMPT,
      buildContextualTranslationPrompt(chunk),
    );
    const chunkTranslations = parseContextualTranslationResponse(response);

    for (const [index, text] of chunkTranslations) {
      translatedTextByIndex.set(index, text);
    }
  }

  return translatedTextByIndex;
};

const shouldTranslateSegment = ({
  segment,
  translateAllSegments,
}: {
  segment: TranscriptSegment;
  translateAllSegments: boolean;
}): boolean =>
  translateAllSegments ||
  (segment.languageCode !== undefined &&
    isSpanishLanguageCode(segment.languageCode));

export const translateTranscriptToEnglish = async ({
  transcription,
  languageCodes,
  translateSegmentsToEnglish = translateSegmentsToEnglishWithBedrock,
  translateTextToEnglish = translateTextToEnglishWithAws,
}: {
  transcription: TranscriptionResult;
  languageCodes: string[];
  translateSegmentsToEnglish?: TranslateSegmentsToEnglish;
  translateTextToEnglish?: TranslateTextToEnglish;
}): Promise<TranslatedTranscriptionResult> => {
  const spanishLanguageCode = getSpanishLanguageCode(languageCodes);
  const sourceLanguageCode =
    getTranslateSourceLanguageCode(spanishLanguageCode);
  const translateAllSegments = true;
  const translatableSegments = transcription.segments
    .map((segment, index) => ({
      index,
      text: segment.text,
      shouldTranslate: shouldTranslateSegment({
        segment,
        translateAllSegments,
      }),
    }))
    .filter((segment) => segment.shouldTranslate)
    .map(({ index, text }) => ({ index, text }));
  const translatedTextByIndex = new Map<number, string>();
  let translationProvider: TranslatedTranscriptionResult['translationProvider'] =
    'bedrock';

  try {
    const contextualTranslations = await translateSegmentsToEnglish({
      segments: translatableSegments,
    });

    for (const [index, text] of contextualTranslations) {
      translatedTextByIndex.set(index, text);
    }
  } catch (error) {
    console.warn(
      '[compliance-qa] Bedrock transcript translation failed; falling back to Amazon Translate:',
      error instanceof Error ? error.message : String(error),
    );
    translationProvider = 'amazon-translate';
  }

  const translatedSegments: TranscriptSegment[] = [];
  let translatedSegmentCount = 0;

  for (const [index, segment] of transcription.segments.entries()) {
    if (!shouldTranslateSegment({ segment, translateAllSegments })) {
      translatedSegments.push(segment);
      continue;
    }

    let translatedText = translatedTextByIndex.get(index);

    if (translatedText === undefined) {
      translatedText = await translateTextToEnglish({
        sourceLanguageCode,
        text: segment.text,
      });
      translationProvider =
        translationProvider === 'bedrock'
          ? 'bedrock+amazon-translate-fallback'
          : translationProvider;
    }

    translatedSegments.push({
      ...segment,
      text: translatedText.length > 0 ? translatedText : segment.text,
      languageCode: TARGET_LANGUAGE_CODE,
    });
    translatedSegmentCount += 1;
  }

  return {
    segments: translatedSegments,
    fullTranscript: translatedSegments
      .map((segment) => segment.text)
      .filter(Boolean)
      .join('\n'),
    markdown: formatTranscriptMarkdown(translatedSegments),
    sourceLanguageCode,
    targetLanguageCode: TARGET_LANGUAGE_CODE,
    translationProvider,
    translatedSegmentCount,
  };
};
