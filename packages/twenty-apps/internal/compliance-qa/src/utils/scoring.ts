import {
  FAIL_SCORE_THRESHOLD,
  PASSING_SCORE_EXCLUSIVE_THRESHOLD,
  RED_FLAGS,
  SCORING_SECTIONS,
  SCORING_SYSTEM_PROMPT,
  SECTION_WEIGHTS,
  buildScoringUserPrompt,
  getScoringSectionsForRubric,
  type QaResult,
  type QaRubricType,
  type RedFlagKey,
} from 'src/constants/compliance-rules';
import { callAi, parseAiJson } from 'src/utils/call-ai';

export type CriterionScore = {
  score: number | null;
  evidence: string;
  notes: string;
  confidence?: number;
};

export type SectionScore = {
  score?: number;
  criteria: Record<string, CriterionScore>;
};

export type RedFlagScore = {
  violated: boolean;
  evidence: string;
  explanation: string;
  confidence?: number;
};

export type ScoreRecommendation = {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  detail: string;
};

export type AiScorecardAnalysis = {
  callQuality: 'SCORABLE' | 'NOT_SCORABLE';
  notScorableReason?: string | null;
  rubricType: QaRubricType | 'ANCILLARY' | 'GENERAL';
  redFlags: Partial<Record<RedFlagKey, RedFlagScore>>;
  sections: Record<string, SectionScore>;
  recommendations: ScoreRecommendation[];
  strengths: string[];
  areasForImprovement: string[];
};

export type FinalScorecardAnalysis = {
  aiAnalysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
  overallScore: number;
  overallResult: QaResult;
  hasRedFlag: boolean;
  sectionScores: Record<string, number>;
  redFlags: Record<RedFlagKey, RedFlagScore>;
  scoreDetailsMarkdown: string;
  redFlagDetailsMarkdown: string | null;
  recommendationsMarkdown: string | null;
};

const DEFAULT_RED_FLAG_SCORE: RedFlagScore = {
  violated: false,
  evidence: '',
  explanation: '',
  confidence: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined =>
  typeof record[key] === 'string' ? record[key] : undefined;

const getNumber = (
  record: Record<string, unknown>,
  key: string,
): number | undefined =>
  typeof record[key] === 'number' && Number.isFinite(record[key])
    ? record[key]
    : undefined;

const getStringArray = (
  record: Record<string, unknown>,
  key: string,
): string[] => {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

const isNonEmptyString = (value: string): boolean => value.length > 0;

const joinNonEmptyLines = (lines: string[], separator = '\n'): string =>
  lines.filter(isNonEmptyString).join(separator);

const isRedFlagKey = (value: string): value is RedFlagKey =>
  RED_FLAGS.some((redFlag) => redFlag.key === value);

const parseCriterionScore = (value: unknown): CriterionScore | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rawScore = value.score;
  const score =
    typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? rawScore
      : rawScore === null
        ? null
        : undefined;

  if (score === undefined) {
    return null;
  }

  return {
    score,
    evidence: getString(value, 'evidence') ?? '',
    notes: getString(value, 'notes') ?? '',
    confidence: getNumber(value, 'confidence'),
  };
};

const parseSectionScore = (value: unknown): SectionScore | null => {
  if (!isRecord(value) || !isRecord(value.criteria)) {
    return null;
  }

  const criteria: Record<string, CriterionScore> = {};

  for (const [criterionId, criterionValue] of Object.entries(value.criteria)) {
    const criterion = parseCriterionScore(criterionValue);

    if (criterion) {
      criteria[criterionId] = criterion;
    }
  }

  return {
    score: getNumber(value, 'score'),
    criteria,
  };
};

const parseRedFlagScore = (value: unknown): RedFlagScore | null => {
  if (!isRecord(value) || typeof value.violated !== 'boolean') {
    return null;
  }

  return {
    violated: value.violated,
    evidence: getString(value, 'evidence') ?? '',
    explanation: getString(value, 'explanation') ?? '',
    confidence: getNumber(value, 'confidence'),
  };
};

const parseRecommendation = (value: unknown): ScoreRecommendation | null => {
  if (!isRecord(value)) {
    return null;
  }

  const priority = getString(value, 'priority');

  if (
    priority !== 'CRITICAL' &&
    priority !== 'HIGH' &&
    priority !== 'MEDIUM' &&
    priority !== 'LOW'
  ) {
    return null;
  }

  return {
    priority,
    category: getString(value, 'category') ?? 'general',
    title: getString(value, 'title') ?? 'Compliance follow-up',
    detail: getString(value, 'detail') ?? '',
  };
};

export const parseAiScorecardAnalysis = (
  value: unknown,
): AiScorecardAnalysis => {
  if (!isRecord(value)) {
    throw new Error('AI scorecard response must be an object');
  }

  const callQuality = getString(value, 'callQuality');

  if (callQuality !== 'SCORABLE' && callQuality !== 'NOT_SCORABLE') {
    throw new Error('AI scorecard response has invalid callQuality');
  }

  const rawRubricType = getString(value, 'rubricType');
  const normalizedRubricType = normalizeRubricType(rawRubricType);
  const rubricType =
    rawRubricType === 'ANCILLARY' || rawRubricType === 'GENERAL'
      ? rawRubricType
      : normalizedRubricType;
  const redFlags: Partial<Record<RedFlagKey, RedFlagScore>> = {};
  const sections: Record<string, SectionScore> = {};

  if (isRecord(value.redFlags)) {
    for (const [redFlagKey, redFlagValue] of Object.entries(value.redFlags)) {
      if (!isRedFlagKey(redFlagKey)) {
        continue;
      }

      const redFlagScore = parseRedFlagScore(redFlagValue);

      if (redFlagScore) {
        redFlags[redFlagKey] = redFlagScore;
      }
    }
  }

  if (isRecord(value.sections)) {
    for (const [sectionId, sectionValue] of Object.entries(value.sections)) {
      const sectionScore = parseSectionScore(sectionValue);

      if (sectionScore) {
        sections[sectionId] = sectionScore;
      }
    }
  }

  const rawRecommendations = Array.isArray(value.recommendations)
    ? value.recommendations
    : [];
  const recommendations = rawRecommendations
    .map(parseRecommendation)
    .filter(
      (recommendation): recommendation is ScoreRecommendation =>
        recommendation !== null,
    );

  return {
    callQuality,
    notScorableReason:
      getString(value, 'notScorableReason') ??
      (value.notScorableReason === null ? null : undefined),
    rubricType,
    redFlags,
    sections,
    recommendations,
    strengths: getStringArray(value, 'strengths'),
    areasForImprovement: getStringArray(value, 'areasForImprovement'),
  };
};

export const normalizeRubricType = (
  rubricType: string | undefined | null,
): QaRubricType => {
  if (rubricType === 'ACA_SALE') return 'ACA_SALE';
  if (rubricType === 'ANCILLARY_ONLY' || rubricType === 'ANCILLARY') {
    return 'ANCILLARY_ONLY';
  }

  return 'UNKNOWN';
};

const clampScore = (score: number): number =>
  Math.max(0, Math.min(100, Math.round(score)));

export const calculateCriterionAverage = (
  criteria: Record<string, CriterionScore>,
): number => {
  const scores = Object.values(criteria)
    .map((criterion) => criterion.score)
    .filter((score): score is number => typeof score === 'number');

  if (scores.length === 0) {
    return 0;
  }

  return clampScore(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
};

export const calculateOverallScore = (
  sectionScores: Record<string, number>,
): number =>
  clampScore(
    Object.entries(SECTION_WEIGHTS).reduce(
      (total, [sectionId, weight]) =>
        total + (sectionScores[sectionId] ?? 0) * weight,
      0,
    ),
  );

export const determineOverallResult = ({
  callQuality,
  rubricType,
  overallScore,
  hasRedFlag,
}: {
  callQuality: 'SCORABLE' | 'NOT_SCORABLE';
  rubricType: QaRubricType;
  overallScore: number;
  hasRedFlag: boolean;
}): QaResult => {
  if (callQuality === 'NOT_SCORABLE') {
    return 'NOT_APPLICABLE';
  }

  if (hasRedFlag || overallScore <= FAIL_SCORE_THRESHOLD) {
    return 'FAIL';
  }

  if (rubricType === 'UNKNOWN') {
    return 'NEEDS_REVIEW';
  }

  if (overallScore > PASSING_SCORE_EXCLUSIVE_THRESHOLD) {
    return 'PASS';
  }

  return 'NEEDS_REVIEW';
};

const isRedFlagApplicable = ({
  analysis,
  redFlagKey,
  rubricType,
}: {
  analysis: AiScorecardAnalysis;
  redFlagKey: RedFlagKey;
  rubricType: QaRubricType;
}): boolean => {
  if (analysis.callQuality === 'NOT_SCORABLE') {
    return false;
  }

  if (redFlagKey === 'commissionDisclosure' && rubricType !== 'ACA_SALE') {
    return false;
  }

  return true;
};

const buildRedFlags = ({
  analysis,
  rubricType,
}: {
  analysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
}): Record<RedFlagKey, RedFlagScore> => {
  const redFlagScores: Record<RedFlagKey, RedFlagScore> = {
    recordedLineDisclosure: DEFAULT_RED_FLAG_SCORE,
    marketplaceDisclosure: DEFAULT_RED_FLAG_SCORE,
    aorDisclosure: DEFAULT_RED_FLAG_SCORE,
    commissionDisclosure: DEFAULT_RED_FLAG_SCORE,
    healthSherpaDisclosure: DEFAULT_RED_FLAG_SCORE,
    agentCoaching: DEFAULT_RED_FLAG_SCORE,
    dncViolation: DEFAULT_RED_FLAG_SCORE,
  };

  for (const redFlag of RED_FLAGS) {
    if (
      !isRedFlagApplicable({
        analysis,
        redFlagKey: redFlag.key,
        rubricType,
      })
    ) {
      redFlagScores[redFlag.key] = DEFAULT_RED_FLAG_SCORE;

      continue;
    }

    redFlagScores[redFlag.key] = {
      ...DEFAULT_RED_FLAG_SCORE,
      ...analysis.redFlags?.[redFlag.key],
    };
  }

  return redFlagScores;
};

const buildSectionScores = ({
  analysis,
  rubricType,
}: {
  analysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
}): Record<string, number> => {
  const scores: Record<string, number> = {};

  for (const section of getScoringSectionsForRubric(rubricType)) {
    const aiCriteria = analysis.sections?.[section.id]?.criteria ?? {};
    const expectedCriteria: Record<string, CriterionScore> = {};

    for (const criterion of section.criteria) {
      expectedCriteria[criterion.id] = aiCriteria[criterion.id] ?? {
        score: 0,
        evidence: '',
        notes: 'Criterion missing from AI response.',
      };
    }

    scores[section.id] = calculateCriterionAverage(expectedCriteria);
  }

  return scores;
};

const criterionDetailsMarkdown = ({
  sectionId,
  analysis,
  rubricType,
}: {
  sectionId: string;
  analysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
}): string => {
  const section = getScoringSectionsForRubric(rubricType).find(
    (scoringSection) => scoringSection.id === sectionId,
  );

  if (!section) {
    return '';
  }

  const sectionResult = analysis.sections?.[sectionId];

  return section.criteria
    .map((criterion) => {
      const result = sectionResult?.criteria?.[criterion.id];
      const score =
        typeof result?.score === 'number' ? `${result.score}/100` : 'N/A';
      const notes =
        result?.notes !== undefined && result.notes.length > 0
          ? `  ${result.notes}`
          : '';
      const evidence =
        result?.evidence !== undefined && result.evidence.length > 0
          ? `  Evidence: "${result.evidence}"`
          : '';

      return joinNonEmptyLines([`- ${criterion.label}: ${score}`, notes, evidence]);
    })
    .join('\n');
};

export const buildScoreDetailsMarkdown = ({
  analysis,
  rubricType,
  sectionScores,
  overallScore,
  overallResult,
}: {
  analysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
  sectionScores: Record<string, number>;
  overallScore: number;
  overallResult: QaResult;
}): string => {
  const sectionDetails = SCORING_SECTIONS.map((section) => {
    const criteriaMarkdown = criterionDetailsMarkdown({
      sectionId: section.id,
      analysis,
      rubricType,
    });

    return joinNonEmptyLines([
      `### ${section.label} - ${sectionScores[section.id] ?? 0}/100`,
      criteriaMarkdown,
    ]);
  }).join('\n\n');

  const notScorableReason =
    analysis.notScorableReason !== undefined &&
    analysis.notScorableReason !== null &&
    analysis.notScorableReason.length > 0
      ? `Not scorable reason: ${analysis.notScorableReason}`
      : '';
  const strengths =
    analysis.strengths.length > 0
      ? `\n## Strengths\n${analysis.strengths.map((item) => `- ${item}`).join('\n')}`
      : '';
  const areasForImprovement =
    analysis.areasForImprovement.length > 0
      ? `\n## Areas for Improvement\n${analysis.areasForImprovement
          .map((item) => `- ${item}`)
          .join('\n')}`
      : '';

  return joinNonEmptyLines([
    `## Final Result: ${overallResult}`,
    `Overall score: ${overallScore}`,
    `Rubric: ${rubricType}`,
    notScorableReason,
    '',
    sectionDetails,
    strengths,
    areasForImprovement,
  ]);
};

export const buildRedFlagDetailsMarkdown = (
  redFlags: Record<RedFlagKey, RedFlagScore>,
): string | null => {
  const violations = RED_FLAGS.filter(
    (redFlag) => redFlags[redFlag.key]?.violated,
  );

  if (violations.length === 0) {
    return null;
  }

  return violations
    .map((redFlag) => {
      const result = redFlags[redFlag.key];
      const evidence =
        result.evidence.length > 0 ? `Evidence: "${result.evidence}"` : '';

      return joinNonEmptyLines(
        [`### ${redFlag.label}`, result.explanation, evidence],
        '\n\n',
      );
    })
    .join('\n\n');
};

export const buildRecommendationsMarkdown = (
  recommendations: ScoreRecommendation[],
): string | null => {
  if (recommendations.length === 0) {
    return null;
  }

  return recommendations
    .map(
      (recommendation) =>
        `**${recommendation.priority}** [${recommendation.category}] ${recommendation.title}\n${recommendation.detail}`,
    )
    .join('\n\n');
};

export const finalizeAiAnalysis = (
  aiAnalysis: AiScorecardAnalysis,
): FinalScorecardAnalysis => {
  const rubricType = normalizeRubricType(aiAnalysis.rubricType);
  const redFlags = buildRedFlags({ analysis: aiAnalysis, rubricType });
  const hasRedFlag = Object.values(redFlags).some(
    (redFlag) => redFlag.violated,
  );
  const sectionScores = buildSectionScores({ analysis: aiAnalysis, rubricType });
  const baseOverallScore = calculateOverallScore(sectionScores);
  const overallScore = hasRedFlag ? 0 : baseOverallScore;
  const overallResult = determineOverallResult({
    callQuality: aiAnalysis.callQuality,
    rubricType,
    overallScore,
    hasRedFlag,
  });

  return {
    aiAnalysis,
    rubricType,
    overallScore,
    overallResult,
    hasRedFlag,
    sectionScores,
    redFlags,
    scoreDetailsMarkdown: buildScoreDetailsMarkdown({
      analysis: aiAnalysis,
      rubricType,
      sectionScores,
      overallScore,
      overallResult,
    }),
    redFlagDetailsMarkdown: buildRedFlagDetailsMarkdown(redFlags),
    recommendationsMarkdown: buildRecommendationsMarkdown(
      aiAnalysis.recommendations ?? [],
    ),
  };
};

export const scoreTranscript = async (
  transcriptMarkdown: string,
): Promise<FinalScorecardAnalysis> => {
  const aiResponse = await callAi(
    SCORING_SYSTEM_PROMPT,
    buildScoringUserPrompt(transcriptMarkdown),
  );

  return finalizeAiAnalysis(parseAiScorecardAnalysis(parseAiJson(aiResponse)));
};
