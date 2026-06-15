import {
  COMPLIANCE_PASS_THRESHOLD,
  RED_FLAGS,
  SCORING_SECTIONS,
  SCORING_SYSTEM_PROMPT,
  SECTION_WEIGHTS,
  buildScoringUserPrompt,
  getScoringSectionsForRubric,
  isComplianceCriterion,
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
  complianceScore: number | null;
  salesEffectivenessScore: number | null;
  resultReason: string;
  sectionScores: Record<string, number | null>;
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

// A red flag only forces an automatic FAIL (score overridden to 0) when the
// model is highly confident in the violation. Lower-confidence violations are
// surfaced for human review (NEEDS_REVIEW) instead of silently failing the
// agent, which has disciplinary consequences.
export const RED_FLAG_AUTO_FAIL_MIN_CONFIDENCE = 0.8;

const normalizeConfidence = (confidence: number | undefined): number => {
  if (confidence === undefined || !Number.isFinite(confidence)) {
    return 0;
  }

  // Tolerate both 0-1 and 0-100 confidence scales from the model.
  const normalized = confidence > 1 ? confidence / 100 : confidence;

  return Math.max(0, Math.min(1, normalized));
};

const isConfirmedRedFlag = (redFlag: RedFlagScore): boolean =>
  redFlag.violated &&
  normalizeConfidence(redFlag.confidence) >= RED_FLAG_AUTO_FAIL_MIN_CONFIDENCE;

const isSuspectedRedFlag = (redFlag: RedFlagScore): boolean =>
  redFlag.violated && !isConfirmedRedFlag(redFlag);

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
): number | null => {
  const scores = Object.values(criteria)
    .map((criterion) => criterion.score)
    .filter((score): score is number => typeof score === 'number');

  // No criterion was scored (all not-applicable or omitted): the section has no
  // signal, so return null and let the overall score re-normalize around it
  // rather than counting an unassessed section as zero.
  if (scores.length === 0) {
    return null;
  }

  return clampScore(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
};

export const calculateOverallScore = (
  sectionScores: Record<string, number | null>,
): number => {
  const weighted = Object.entries(SECTION_WEIGHTS).reduce(
    (accumulator, [sectionId, weight]) => {
      const sectionScore = sectionScores[sectionId];

      if (sectionScore === null || sectionScore === undefined) {
        return accumulator;
      }

      return {
        total: accumulator.total + sectionScore * weight,
        weight: accumulator.weight + weight,
      };
    },
    { total: 0, weight: 0 },
  );

  // Re-normalize over the sections that actually have a score so that a section
  // with no assessable criteria does not drag the weighted average toward zero.
  if (weighted.weight === 0) {
    return 0;
  }

  return clampScore(weighted.total / weighted.weight);
};

// Average the AI scores of one criterion category (compliance vs sales). Not-
// applicable/omitted criteria are excluded; null means the category had no
// assessable criteria on this call.
const collectCategoryScore = ({
  analysis,
  rubricType,
  compliance,
}: {
  analysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
  compliance: boolean;
}): number | null => {
  const scores: number[] = [];

  for (const section of getScoringSectionsForRubric(rubricType)) {
    const aiCriteria = analysis.sections?.[section.id]?.criteria ?? {};

    for (const criterion of section.criteria) {
      if (isComplianceCriterion(criterion.id) !== compliance) {
        continue;
      }

      const aiCriterion = aiCriteria[criterion.id];

      if (aiCriterion !== undefined && typeof aiCriterion.score === 'number') {
        scores.push(aiCriterion.score);
      }
    }
  }

  if (scores.length === 0) {
    return null;
  }

  return clampScore(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
};

export const determineOverallResult = ({
  callQuality,
  rubricType,
  complianceScore,
  hasConfirmedRedFlag,
  hasSuspectedRedFlag,
}: {
  callQuality: 'SCORABLE' | 'NOT_SCORABLE';
  rubricType: QaRubricType;
  complianceScore: number | null;
  hasConfirmedRedFlag: boolean;
  hasSuspectedRedFlag: boolean;
}): QaResult => {
  if (callQuality === 'NOT_SCORABLE') {
    return 'NOT_APPLICABLE';
  }

  // FAIL is reserved for an actual compliance breach: a high-confidence red flag
  // (missing disclosure, coaching/manipulation, DNC violation). Sales-execution
  // weakness never fails a call.
  if (hasConfirmedRedFlag) {
    return 'FAIL';
  }

  if (rubricType === 'UNKNOWN') {
    return 'NEEDS_REVIEW';
  }

  // A lower-confidence (suspected) compliance violation goes to human review
  // instead of auto-failing the agent.
  if (hasSuspectedRedFlag) {
    return 'NEEDS_REVIEW';
  }

  // Compliance criteria (licensed-agent ID, HIPAA identity check, no misleading
  // info, verbatim attestations, valid QLE, accurate income) gate the pass.
  // Sales-effectiveness criteria are coaching only and never block a pass.
  if (complianceScore === null) {
    return 'NEEDS_REVIEW';
  }

  if (complianceScore >= COMPLIANCE_PASS_THRESHOLD) {
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
}): Record<string, number | null> => {
  const scores: Record<string, number | null> = {};

  for (const section of getScoringSectionsForRubric(rubricType)) {
    const aiCriteria = analysis.sections?.[section.id]?.criteria ?? {};
    const rubricCriteria: Record<string, CriterionScore> = {};

    for (const criterion of section.criteria) {
      const aiCriterion = aiCriteria[criterion.id];

      // Only include criteria the AI actually returned. Missing or explicitly
      // null (not-applicable) criteria are excluded from the section average
      // rather than counted as zero, so an unaddressed criterion does not drag
      // an otherwise strong call down.
      if (aiCriterion !== undefined) {
        rubricCriteria[criterion.id] = aiCriterion;
      }
    }

    scores[section.id] = calculateCriterionAverage(rubricCriteria);
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

      const categoryTag = isComplianceCriterion(criterion.id)
        ? ' (compliance)'
        : '';

      return joinNonEmptyLines([
        `- ${criterion.label}${categoryTag}: ${score}`,
        notes,
        evidence,
      ]);
    })
    .join('\n');
};

const formatScoreLabel = (score: number | null): string =>
  score === null ? 'N/A' : `${score}/100`;

export const buildScoreDetailsMarkdown = ({
  analysis,
  rubricType,
  sectionScores,
  complianceScore,
  salesEffectivenessScore,
  overallResult,
}: {
  analysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
  sectionScores: Record<string, number | null>;
  complianceScore: number | null;
  salesEffectivenessScore: number | null;
  overallResult: QaResult;
}): string => {
  const sectionDetails = SCORING_SECTIONS.map((section) => {
    const criteriaMarkdown = criterionDetailsMarkdown({
      sectionId: section.id,
      analysis,
      rubricType,
    });
    const sectionScore = sectionScores[section.id];
    const sectionScoreLabel =
      sectionScore === null || sectionScore === undefined
        ? 'N/A'
        : `${sectionScore}/100`;

    return joinNonEmptyLines([
      `### ${section.label} - ${sectionScoreLabel}`,
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
    `Compliance score: ${formatScoreLabel(complianceScore)} (determines the result)`,
    `Sales effectiveness: ${formatScoreLabel(
      salesEffectivenessScore,
    )} (coaching only — does not affect the compliance result)`,
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
      const confidence = normalizeConfidence(result.confidence);
      const severity = isConfirmedRedFlag(result)
        ? 'Auto-fail'
        : 'Suspected — routed to human review';
      const severityLine = `Severity: ${severity} (confidence ${Math.round(
        confidence * 100,
      )}%)`;

      return joinNonEmptyLines(
        [`### ${redFlag.label}`, severityLine, result.explanation, evidence],
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

// A short, board-visible explanation of the result: which compliance breach
// failed it, why it needs review, or why it was not scorable.
export const buildResultReason = ({
  analysis,
  rubricType,
  redFlags,
  complianceScore,
  overallResult,
}: {
  analysis: AiScorecardAnalysis;
  rubricType: QaRubricType;
  redFlags: Record<RedFlagKey, RedFlagScore>;
  complianceScore: number | null;
  overallResult: QaResult;
}): string => {
  if (overallResult === 'NOT_APPLICABLE') {
    const reason = analysis.notScorableReason?.trim();

    return reason !== undefined && reason.length > 0
      ? `Not scorable: ${reason}`
      : 'Not a scorable sales call';
  }

  const confirmed = RED_FLAGS.filter((redFlag) =>
    isConfirmedRedFlag(redFlags[redFlag.key]),
  );

  if (confirmed.length > 0) {
    return `Compliance failure: ${confirmed
      .map((redFlag) => redFlag.label)
      .join(', ')}`;
  }

  if (overallResult === 'PASS') {
    return '';
  }

  // NEEDS_REVIEW: explain why a human should look.
  const suspected = RED_FLAGS.filter((redFlag) =>
    isSuspectedRedFlag(redFlags[redFlag.key]),
  );

  if (suspected.length > 0) {
    return `Needs review — possible ${suspected
      .map((redFlag) => redFlag.label)
      .join(', ')} (low confidence)`;
  }

  if (rubricType === 'UNKNOWN') {
    return 'Needs review — could not tell ACA vs ancillary';
  }

  if (complianceScore === null) {
    return 'Needs review — compliance criteria not assessable';
  }

  return `Needs review — compliance score ${complianceScore} below ${COMPLIANCE_PASS_THRESHOLD}`;
};

export const finalizeAiAnalysis = (
  aiAnalysis: AiScorecardAnalysis,
): FinalScorecardAnalysis => {
  const rubricType = normalizeRubricType(aiAnalysis.rubricType);
  const redFlags = buildRedFlags({ analysis: aiAnalysis, rubricType });
  const hasConfirmedRedFlag = Object.values(redFlags).some(isConfirmedRedFlag);
  const hasSuspectedRedFlag = Object.values(redFlags).some(isSuspectedRedFlag);
  const sectionScores = buildSectionScores({ analysis: aiAnalysis, rubricType });
  const complianceScore = collectCategoryScore({
    analysis: aiAnalysis,
    rubricType,
    compliance: true,
  });
  const salesEffectivenessScore = collectCategoryScore({
    analysis: aiAnalysis,
    rubricType,
    compliance: false,
  });
  const overallResult = determineOverallResult({
    callQuality: aiAnalysis.callQuality,
    rubricType,
    complianceScore,
    hasConfirmedRedFlag,
    hasSuspectedRedFlag,
  });
  // The scorecard score reflects the compliance result driver; a confirmed red
  // flag is a hard compliance failure and zeroes it.
  const overallScore = hasConfirmedRedFlag ? 0 : (complianceScore ?? 0);
  const resultReason = buildResultReason({
    analysis: aiAnalysis,
    rubricType,
    redFlags,
    complianceScore,
    overallResult,
  });

  return {
    aiAnalysis,
    rubricType,
    overallScore,
    overallResult,
    hasRedFlag: hasConfirmedRedFlag,
    complianceScore,
    salesEffectivenessScore,
    resultReason,
    sectionScores,
    redFlags,
    scoreDetailsMarkdown: buildScoreDetailsMarkdown({
      analysis: aiAnalysis,
      rubricType,
      sectionScores,
      complianceScore,
      salesEffectivenessScore,
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
