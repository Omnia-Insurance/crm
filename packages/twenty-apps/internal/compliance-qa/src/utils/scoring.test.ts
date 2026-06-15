import { describe, expect, it } from 'vitest';

import {
  isComplianceCriterion,
  RED_FLAGS,
  SCORING_SECTIONS,
} from 'src/constants/compliance-rules';
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

// Only the first criterion of each section is scored; the rest are omitted, as
// real AI responses frequently leave criteria out.
const buildSparseSections = (score: number) => {
  const sections: AiScorecardAnalysis['sections'] = {};

  for (const section of SCORING_SECTIONS) {
    const firstCriterion = section.criteria[0];

    sections[section.id] = {
      criteria: {
        [firstCriterion.id]: {
          ...passingCriterion,
          score,
        },
      },
    };
  }

  return sections;
};

// Score compliance criteria and sales-effectiveness criteria independently so
// tests can prove the two tracks are decoupled.
const buildSectionsByCategory = (
  complianceScore: number,
  salesScore: number,
) => {
  const sections: AiScorecardAnalysis['sections'] = {};

  for (const section of SCORING_SECTIONS) {
    const criteria: Record<string, CriterionScore> = {};

    for (const criterion of section.criteria) {
      criteria[criterion.id] = {
        ...passingCriterion,
        score: isComplianceCriterion(criterion.id)
          ? complianceScore
          : salesScore,
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
  it('passes calls whose compliance criteria clear the threshold and have no red flags', () => {
    const result = finalizeAiAnalysis(buildAnalysis());

    expect(result.overallScore).toBe(90);
    expect(result.overallResult).toBe('PASS');
    expect(result.hasRedFlag).toBe(false);
  });

  it('passes a compliant call even when sales effectiveness is weak', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        sections: buildSectionsByCategory(95, 20),
      }),
    );

    expect(result.complianceScore).toBe(95);
    expect(result.salesEffectivenessScore).toBe(20);
    expect(result.overallScore).toBe(95);
    expect(result.overallResult).toBe('PASS');
  });

  it('holds a call for review when compliance is weak even if sales is strong', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        sections: buildSectionsByCategory(50, 95),
      }),
    );

    expect(result.complianceScore).toBe(50);
    expect(result.salesEffectivenessScore).toBe(95);
    expect(result.overallResult).toBe('NEEDS_REVIEW');
    expect(result.hasRedFlag).toBe(false);
  });

  it('never fails a call without a confirmed red flag, however low the score', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        sections: buildSections(10),
      }),
    );

    expect(result.overallResult).toBe('NEEDS_REVIEW');
    expect(result.hasRedFlag).toBe(false);
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

  it('excludes missing criteria instead of scoring them zero', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        sections: buildSparseSections(100),
      }),
    );

    expect(result.overallScore).toBe(100);
    expect(result.overallResult).toBe('PASS');
  });

  it('re-normalizes the overall score when a section has no scored criteria', () => {
    const sections = buildSections(90);

    delete sections.closing;

    const result = finalizeAiAnalysis(
      buildAnalysis({
        sections,
      }),
    );

    expect(result.sectionScores.closing).toBeNull();
    expect(result.overallScore).toBe(90);
    expect(result.overallResult).toBe('PASS');
  });

  it('routes a low-confidence red flag to needs review without auto-failing', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        redFlags: {
          ...buildRedFlags(),
          recordedLineDisclosure: {
            violated: true,
            evidence: 'No clear disclosure heard',
            explanation: 'Possibly missing recorded-line disclosure',
            confidence: 0.5,
          },
        },
      }),
    );

    expect(result.overallScore).toBe(90);
    expect(result.overallResult).toBe('NEEDS_REVIEW');
    expect(result.hasRedFlag).toBe(false);
  });

  it('treats a 0-100 scale confidence as high confidence', () => {
    const result = finalizeAiAnalysis(
      buildAnalysis({
        redFlags: {
          ...buildRedFlags(),
          dncViolation: {
            violated: true,
            evidence: 'Consumer asked to stop calling',
            explanation: 'Agent continued selling after the request',
            confidence: 90,
          },
        },
      }),
    );

    expect(result.overallScore).toBe(0);
    expect(result.overallResult).toBe('FAIL');
    expect(result.hasRedFlag).toBe(true);
  });

  it('summarizes a board-visible reason for the result', () => {
    const fail = finalizeAiAnalysis(
      buildAnalysis({ redFlags: buildRedFlags('marketplaceDisclosure') }),
    );
    expect(fail.resultReason).toContain('Compliance failure');
    expect(fail.resultReason).toContain('Marketplace');

    const pass = finalizeAiAnalysis(buildAnalysis());
    expect(pass.resultReason).toBe('');

    const review = finalizeAiAnalysis(
      buildAnalysis({ sections: buildSectionsByCategory(50, 95) }),
    );
    expect(review.resultReason).toContain('compliance score');

    const notApplicable = finalizeAiAnalysis(
      buildAnalysis({
        callQuality: 'NOT_SCORABLE',
        notScorableReason: 'Voicemail only',
        sections: {},
      }),
    );
    expect(notApplicable.resultReason).toContain('Voicemail only');
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
