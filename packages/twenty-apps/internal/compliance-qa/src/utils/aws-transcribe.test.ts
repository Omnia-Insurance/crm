import { describe, expect, it } from 'vitest';

import {
  buildSampleRateFallbackTranscriptionJobName,
  buildTranscriptionJobName,
  getTranscriptLanguageCodes,
  normalizeAmazonTranscript,
  shouldTranslateTranscriptToEnglish,
  TRANSCRIPTION_PIPELINE_VERSION,
  type AmazonTranscriptResult,
} from 'src/utils/aws-transcribe';

describe('Compliance QA Amazon Transcribe helpers', () => {
  it('versions deterministic job names so language-ID reruns do not reuse old English-only output', () => {
    expect(buildTranscriptionJobName('call-123')).toBe(
      `compliance-qa-call-123-${TRANSCRIPTION_PIPELINE_VERSION}`,
    );
    expect(buildSampleRateFallbackTranscriptionJobName('call-123', 1)).toBe(
      `compliance-qa-call-123-${TRANSCRIPTION_PIPELINE_VERSION}-sr`,
    );
  });

  it('detects Spanish language codes from Transcribe output', () => {
    const raw: AmazonTranscriptResult = {
      results: {
        language_codes: [
          { language_code: 'en-US', duration_in_seconds: 12 },
          { language_code: 'es_us', duration_in_seconds: 30 },
        ],
        transcripts: [{ transcript: 'Hola, I need help.' }],
        items: [
          {
            type: 'pronunciation',
            language_code: 'es-US',
            alternatives: [{ content: 'Hola' }],
          },
        ],
      },
    };

    expect(getTranscriptLanguageCodes(raw)).toEqual(['en-US', 'es-US']);
    expect(shouldTranslateTranscriptToEnglish(raw)).toBe(true);
  });

  it('carries dominant segment language into normalized transcript segments', () => {
    const raw: AmazonTranscriptResult = {
      results: {
        transcripts: [{ transcript: 'Hola necesito ayuda.' }],
        items: [
          {
            type: 'pronunciation',
            language_code: 'es-US',
            start_time: '0.0',
            end_time: '0.5',
            alternatives: [{ content: 'Hola' }],
          },
          {
            type: 'pronunciation',
            language_code: 'es-US',
            start_time: '0.5',
            end_time: '1.0',
            alternatives: [{ content: 'necesito' }],
          },
          {
            type: 'pronunciation',
            language_code: 'en-US',
            start_time: '1.0',
            end_time: '1.5',
            alternatives: [{ content: 'ayuda' }],
          },
          {
            type: 'punctuation',
            alternatives: [{ content: '.' }],
          },
        ],
      },
    };

    const transcription = normalizeAmazonTranscript(raw);

    expect(transcription.segments).toHaveLength(1);
    expect(transcription.segments[0]).toMatchObject({
      languageCode: 'es-US',
      text: 'Hola necesito ayuda.',
    });
  });
});
