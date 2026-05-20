import { describe, expect, it } from 'vitest';

import { RED_FLAGS, SCORING_SECTIONS } from 'src/constants/compliance-rules';
import {
  finalizeAiAnalysis,
  parseAiScorecardAnalysis,
  type AiScorecardAnalysis,
  type CriterionScore,
} from 'src/utils/scoring';

const passingCriterion: CriterionScore = {
  score: 100,
  evidence: 'Handled correctly',
  notes: 'Meets the criterion',
  confidence: 0.9,
};

const buildSections = (score: number) => {
  const sections: AiScorecardAnalysis['sections'] = {};

  for (const section of SCORING_SECTIONS) {
    const criteria: Record<string, CriterionScore> = {};

    for (const criterion of section.criteria) {
      criteria[criterion.id] = {
        ...passingCriterion,
        score,
      };
    }

    sections[section.id] = { criteria };
  }

  return sections;
};

const buildRedFlags = (violatedKey?: string) => {
  const redFlags: AiScorecardAnalysis['redFlags'] = {};

  for (const redFlag of RED_FLAGS) {
    redFlags[redFlag.key] = {
      violated: redFlag.key === violatedKey,
      evidence: redFlag.key === violatedKey ? 'Missing disclosure' : '',
      explanation: redFlag.key === violatedKey ? 'Disclosure was not read' : '',
      confidence: 0.9,
    };
  }

  return redFlags;
};

const buildAnalysis = (
  overrides: Partial<AiScorecardAnalysis> = {},
): AiScorecardAnalysis => ({
  callQuality: 'SCORABLE',
  rubricType: 'ACA_SALE',
  redFlags: buildRedFlags(),
  sections: buildSections(90),
  recommendations: [],
  strengths: [],
  areasForImprovement: [],
  ...overrides,
});

describe('Compliance QA scoring', () => {
  it('passes calls above 80 when no red flags are present', () => {
    const result = finalizeAiAnalysis(buildAnalysis());

    expect(result.overallScore).toBe(90);
    expect(result.overallResult).toBe('PASS');
    expect(result.hasRedFlag).toBe(false);
  });

  it('routes scores from 61 to 80 to needs review', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        sections: buildSections(80),
      }),
    );

    expect(result.overallScore).toBe(80);
    expect(result.overallResult).toBe('NEEDS_REVIEW');
  });

  it('fails scores at or below 60', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        sections: buildSections(60),
      }),
    );

    expect(result.overallScore).toBe(60);
    expect(result.overallResult).toBe('FAIL');
  });

  it('overrides score and result when any red flag is violated', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        redFlags: buildRedFlags('recordedLineDisclosure'),
      }),
    );

    expect(result.overallScore).toBe(0);
    expect(result.overallResult).toBe('FAIL');
    expect(result.hasRedFlag).toBe(true);
  });

  it('marks not-scorable calls as not applicable', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        callQuality: 'NOT_SCORABLE',
        notScorableReason: 'Voicemail only',
        redFlags: buildRedFlags('recordedLineDisclosure'),
        sections: {},
      }),
    );

    expect(result.overallResult).toBe('NOT_APPLICABLE');
    expect(result.hasRedFlag).toBe(false);
  });

  it('does not auto-fail ancillary-only calls for commission disclosure', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        rubricType: 'ANCILLARY_ONLY',
        redFlags: buildRedFlags('commissionDisclosure'),
      }),
    );

    expect(result.overallScore).toBe(90);
    expect(result.overallResult).toBe('PASS');
    expect(result.hasRedFlag).toBe(false);
  });

  it('validates unknown AI JSON into a typed scorecard analysis', () => {
    const analysis = parseAiScorecardAnalysis({
      callQuality: 'SCORABLE',
      rubricType: 'ANCILLARY_ONLY',
      redFlags: {
        dncViolation: {
          violated: false,
          evidence: '',
          explanation: '',
          confidence: 0.8,
        },
      },
      sections: {
        opening: {
          criteria: {
            'opening-energy-warmth': {
              score: 90,
              evidence: 'Friendly greeting',
              notes: 'Good opening',
            },
          },
        },
      },
      recommendations: [
        {
          priority: 'LOW',
          category: 'opening',
          title: 'Keep tone consistent',
          detail: 'Maintain the same tone through the call.',
        },
      ],
      strengths: ['Warm opening'],
      areasForImprovement: [],
    });

    expect(analysis.rubricType).toBe('ANCILLARY_ONLY');
    expect(analysis.redFlags.dncViolation?.violated).toBe(false);
    expect(analysis.sections.opening.criteria['opening-energy-warmth'].score).toBe(
      90,
    );
  });
});
