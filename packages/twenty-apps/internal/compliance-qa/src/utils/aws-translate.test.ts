import { describe, expect, it } from 'vitest';

import {
  chunkTextForTranslate,
  chunkSegmentsForContextualTranslation,
  translateTranscriptToEnglish,
} from 'src/utils/aws-translate';
import { type TranscriptionResult } from 'src/utils/transcript';

const buildTranscription = (): TranscriptionResult => ({
  segments: [
    {
      speaker: 'Speaker',
      text: 'Hola, necesito ayuda con mi plan.',
      startTime: 0,
      endTime: 2,
      languageCode: 'es-US',
    },
    {
      speaker: 'Speaker',
      text: 'This segment is already English.',
      startTime: 2,
      endTime: 4,
      languageCode: 'en-US',
    },
  ],
  fullTranscript:
    'Hola, necesito ayuda con mi plan. This segment is already English.',
  markdown: '',
  durationSeconds: 4,
});

describe('Compliance QA transcript translation helpers', () => {
  it('chunks long text without exceeding Translate request limits', () => {
    const chunks = chunkTextForTranslate(Array(2_000).fill('palabra').join(' '));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 4_500)).toBe(true);
    expect(chunks.join(' ').split(' ')).toHaveLength(2_000);
  });

  it('chunks transcript segments for contextual translation', () => {
    const chunks = chunkSegmentsForContextualTranslation(
      Array.from({ length: 30 }, (_, index) => ({
        index,
        text: Array(100).fill('texto').join(' '),
      })),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(30);
  });

  it('uses contextual translation for Spanish transcript segments', async () => {
    const translated = await translateTranscriptToEnglish({
      transcription: buildTranscription(),
      languageCodes: ['es-US', 'en-US'],
      translateSegmentsToEnglish: async ({ segments }) => {
        expect(segments).toEqual([
          { index: 0, text: 'Hola, necesito ayuda con mi plan.' },
          { index: 1, text: 'This segment is already English.' },
        ]);

        return new Map([
          [0, 'Hello, I need help with my plan.'],
          [1, 'This segment is already English.'],
        ]);
      },
    });

    expect(translated.translationProvider).toBe('bedrock');
    expect(translated.translatedSegmentCount).toBe(2);
    expect(translated.markdown).toContain(
      '**Speaker** [0:00]: Hello, I need help with my plan.',
    );
    expect(translated.markdown).toContain(
      '**Speaker** [0:02]: This segment is already English.',
    );
  });

  it('falls back to Amazon Translate when contextual translation misses a segment', async () => {
    const translated = await translateTranscriptToEnglish({
      transcription: buildTranscription(),
      languageCodes: ['es-US', 'en-US'],
      translateSegmentsToEnglish: async () => new Map(),
      translateTextToEnglish: async ({ sourceLanguageCode, text }) => {
        expect(sourceLanguageCode).toBe('es');

        return `Fallback: ${text}`;
      },
    });

    expect(translated.translationProvider).toBe(
      'bedrock+amazon-translate-fallback',
    );
    expect(translated.markdown).toContain(
      '**Speaker** [0:00]: Fallback: Hola, necesito ayuda con mi plan.',
    );
  });
});
