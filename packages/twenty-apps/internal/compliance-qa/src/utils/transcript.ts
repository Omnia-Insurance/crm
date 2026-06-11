export type TranscriptSegment = {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  languageCode?: string;
};

export type TranscriptionResult = {
  segments: TranscriptSegment[];
  fullTranscript: string;
  markdown: string;
  durationSeconds: number;
};

const formatTimestamp = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export const formatTranscriptMarkdown = (
  segments: TranscriptSegment[],
): string =>
  segments
    .map(
      (segment) =>
        `**${segment.speaker}** [${formatTimestamp(segment.startTime)}]: ${
          segment.text
        }`,
    )
    .join('\n\n');

export const normalizeLanguageCode = (languageCode: string): string | null => {
  const normalizedParts = languageCode
    .trim()
    .replace(/_/g, '-')
    .split('-')
    .filter(Boolean);

  const language = normalizedParts[0];

  if (language === undefined || !/^[a-z]{2,3}$/i.test(language)) {
    return null;
  }

  const region = normalizedParts[1];

  return region === undefined
    ? language.toLowerCase()
    : `${language.toLowerCase()}-${region.toUpperCase()}`;
};

export const isSpanishLanguageCode = (languageCode: string): boolean =>
  normalizeLanguageCode(languageCode)?.startsWith('es') === true;

export const getDominantLanguageCode = (
  languageCodes: string[],
): string | undefined => {
  const counts = new Map<string, number>();

  for (const languageCode of languageCodes) {
    const normalizedLanguageCode = normalizeLanguageCode(languageCode);

    if (normalizedLanguageCode === null) {
      continue;
    }

    counts.set(
      normalizedLanguageCode,
      (counts.get(normalizedLanguageCode) ?? 0) + 1,
    );
  }

  let dominantLanguageCode: string | undefined;
  let dominantCount = 0;

  for (const [languageCode, count] of counts) {
    if (count > dominantCount) {
      dominantLanguageCode = languageCode;
      dominantCount = count;
    }
  }

  return dominantLanguageCode;
};
