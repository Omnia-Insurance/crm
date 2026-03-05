import {
  RED_FLAGS,
  RED_FLAG_SYSTEM_PROMPT,
  FULL_SCORECARD_SYSTEM_PROMPT,
  SCORING_SECTIONS,
  SECTION_WEIGHTS,
  type RedFlagKey,
} from 'src/constants/compliance-rules';
import { callAi, parseAiJson } from 'src/utils/call-ai';
import { transcribeRecording } from 'src/utils/transcribe-recording';
import { defineLogicFunction } from 'twenty-sdk';
import { CoreApiClient } from 'twenty-sdk/generated';

// ============================================================
// Types
// ============================================================

type RedFlagResult = {
  violated: boolean;
  evidence: string;
  explanation: string;
};

type RedFlagAnalysis = {
  redFlags: Record<RedFlagKey, RedFlagResult>;
  callType: 'ACA_SALE' | 'ANCILLARY' | 'GENERAL';
  callDirection: 'INBOUND' | 'OUTBOUND' | 'CALLBACK' | 'UNKNOWN';
};

type CriterionResult = {
  score: number | null;
  evidence: string;
  notes: string;
};

type SectionResult = {
  score: number;
  criteria: Record<string, CriterionResult>;
};

type ScorecardAnalysis = {
  sections: Record<string, SectionResult>;
  overallScore: number;
  overallResult: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
  recommendations: string[];
  strengths: string[];
  areasForImprovement: string[];
};

type RequestBody = {
  // Provide either a callId (to look up recording URL) or a direct recordingUrl
  callId?: string;
  recordingUrl?: string;
  // Optional: pre-computed transcript (skip Deepgram)
  transcript?: string;
  // Optional: agent name for the scorecard title
  agentName?: string;
};

// ============================================================
// Helpers
// ============================================================

const buildRedFlagUserPrompt = (transcript: string): string => {
  const flagDescriptions = RED_FLAGS.map(
    (flag) => `- **${flag.label}**: ${flag.aiPromptGuidance}`,
  ).join('\n');

  return [
    'Analyze the following call transcript for compliance red flags.',
    '',
    '## Red Flag Definitions',
    flagDescriptions,
    '',
    '## Transcript',
    transcript,
  ].join('\n');
};

const buildScorecardUserPrompt = (
  transcript: string,
  callType: string,
): string => {
  const sectionDescriptions = SCORING_SECTIONS.map((section) => {
    const criteriaList = section.criteria
      .map((c) => {
        const tags = [];

        if (c.acaOnly) tags.push('ACA only');
        if (c.ancillaryOnly) tags.push('Ancillary only');
        const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';

        return `  - **${c.id}** (${c.label}, max ${c.maxPoints} pts${tagStr}): ${c.description}`;
      })
      .join('\n');

    return `### ${section.label}\n${section.description}\n${criteriaList}`;
  }).join('\n\n');

  return [
    `Analyze the following call transcript. The call type is: ${callType}`,
    '',
    '## Scoring Criteria',
    sectionDescriptions,
    '',
    '## Transcript',
    transcript,
  ].join('\n');
};

const buildRedFlagDetailsMarkdown = (
  analysis: RedFlagAnalysis,
): string | null => {
  const violations = RED_FLAGS.filter(
    (flag) => analysis.redFlags[flag.key]?.violated,
  );

  if (violations.length === 0) return null;

  return violations
    .map((flag) => {
      const result = analysis.redFlags[flag.key];

      return [
        `### ${flag.label}`,
        result.explanation,
        result.evidence ? `> ${result.evidence}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    })
    .join('\n\n---\n\n');
};

const buildScoreDetailsMarkdown = (analysis: ScorecardAnalysis): string => {
  const sectionDetails = SCORING_SECTIONS.map((section) => {
    const sectionResult = analysis.sections[section.id];

    if (!sectionResult) return '';

    const criteriaDetails = section.criteria
      .map((criterion) => {
        const result = sectionResult.criteria[criterion.id];

        if (!result) return `- **${criterion.label}**: Not scored`;

        const scoreStr =
          result.score !== null ? `${result.score}/100` : 'N/A';

        return [
          `- **${criterion.label}** — ${scoreStr}`,
          result.notes ? `  ${result.notes}` : '',
          result.evidence ? `  > ${result.evidence}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');

    return `### ${section.label} — ${sectionResult.score}/100\n${criteriaDetails}`;
  }).join('\n\n');

  const parts = [`## Score Breakdown\n\n${sectionDetails}`];

  if (analysis.strengths?.length) {
    parts.push(
      `## Strengths\n${analysis.strengths.map((s) => `- ${s}`).join('\n')}`,
    );
  }

  if (analysis.areasForImprovement?.length) {
    parts.push(
      `## Areas for Improvement\n${analysis.areasForImprovement.map((s) => `- ${s}`).join('\n')}`,
    );
  }

  return parts.join('\n\n');
};

const buildRecommendationsMarkdown = (
  analysis: ScorecardAnalysis,
): string | null => {
  if (!analysis.recommendations?.length) return null;

  return analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
};

// ============================================================
// Main Handler
// ============================================================

const handler = async (event: any) => {
  const body = event.body as RequestBody | null;

  if (!body?.callId && !body?.recordingUrl && !body?.transcript) {
    throw new Error(
      'Must provide either callId, recordingUrl, or transcript in request body',
    );
  }

  const client = new CoreApiClient();

  // Step 1: Resolve recording URL from call record if needed
  let recordingUrl = body.recordingUrl;
  let callName = '';

  if (body.callId && !recordingUrl) {
    const { call } = await client.query({
      call: {
        __args: { filter: { id: { eq: body.callId } } },
        id: true,
        name: true,
        recording: true,
      },
    } as any);

    if (!call) {
      throw new Error(`Call not found: ${body.callId}`);
    }

    // The recording field is a LINKS type — extract the primary URL
    const recording = (call as any).recording;

    if (recording?.primaryLinkUrl) {
      recordingUrl = recording.primaryLinkUrl;
    } else if (typeof recording === 'string') {
      recordingUrl = recording;
    }

    callName = (call as any).name || '';

    if (!recordingUrl) {
      throw new Error(`No recording URL found on call ${body.callId}`);
    }
  }

  // Step 2: Transcribe (or use provided transcript)
  let transcriptMarkdown = body.transcript ?? '';

  if (!transcriptMarkdown && recordingUrl) {
    console.log('[analyze] Transcribing recording...');

    // Update status to TRANSCRIBING if we have a scorecard already
    const transcription = await transcribeRecording(recordingUrl);

    transcriptMarkdown = transcription.markdown;
  }

  if (!transcriptMarkdown) {
    throw new Error('No transcript available for analysis');
  }

  // Step 3: Pass 1 — Red Flag Analysis
  console.log('[analyze] Pass 1: Red flag analysis...');
  const redFlagText = await callAi(
    RED_FLAG_SYSTEM_PROMPT,
    buildRedFlagUserPrompt(transcriptMarkdown),
  );
  const redFlagAnalysis = parseAiJson<RedFlagAnalysis>(redFlagText);

  // Check for any violations
  const hasRedFlag = RED_FLAGS.some(
    (flag) => redFlagAnalysis.redFlags[flag.key]?.violated,
  );

  // Step 4: Pass 2 — Full Scorecard Analysis
  console.log('[analyze] Pass 2: Full scorecard analysis...');
  const scorecardText = await callAi(
    FULL_SCORECARD_SYSTEM_PROMPT,
    buildScorecardUserPrompt(
      transcriptMarkdown,
      redFlagAnalysis.callType || 'GENERAL',
    ),
  );
  const scorecardAnalysis = parseAiJson<ScorecardAnalysis>(scorecardText);

  // Override overall result if red flags exist
  if (hasRedFlag && scorecardAnalysis.overallResult !== 'FAIL') {
    scorecardAnalysis.overallResult = 'FAIL';
  }

  // Step 5: Compute section scores
  const sectionScores: Record<string, number> = {};

  for (const section of SCORING_SECTIONS) {
    const sectionResult = scorecardAnalysis.sections[section.id];

    sectionScores[section.id] = sectionResult?.score ?? 0;
  }

  // Compute weighted overall score
  let computedOverall = 0;

  for (const [sectionId, weight] of Object.entries(SECTION_WEIGHTS)) {
    computedOverall += (sectionScores[sectionId] ?? 0) * weight;
  }

  const overallScore = Math.round(computedOverall);

  // Step 6: Build display name
  const agentLabel = body.agentName || 'Unknown Agent';
  const dateStr = new Date().toISOString().slice(0, 10);
  const scorecardName = `QA - ${agentLabel} - ${callName || dateStr}`;

  // Step 7: Create QaScorecard record
  console.log('[analyze] Creating QA Scorecard record...');

  const scoreDetails = buildScoreDetailsMarkdown(scorecardAnalysis);
  const redFlagDetails = buildRedFlagDetailsMarkdown(redFlagAnalysis);
  const recommendations = buildRecommendationsMarkdown(scorecardAnalysis);

  const scorecardData: Record<string, unknown> = {
    name: scorecardName,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    callType: redFlagAnalysis.callType || 'GENERAL',
    // Red flags
    redFlagRecordedLine:
      redFlagAnalysis.redFlags.recordedLineDisclosure?.violated ?? false,
    redFlagMarketplace:
      redFlagAnalysis.redFlags.marketplaceDisclosure?.violated ?? false,
    redFlagAor: redFlagAnalysis.redFlags.aorDisclosure?.violated ?? false,
    redFlagCommission:
      redFlagAnalysis.redFlags.commissionDisclosure?.violated ?? false,
    redFlagHealthSherpa:
      redFlagAnalysis.redFlags.healthSherpaDisclosure?.violated ?? false,
    redFlagAgentCoaching:
      redFlagAnalysis.redFlags.agentCoaching?.violated ?? false,
    redFlagDncViolation:
      redFlagAnalysis.redFlags.dncViolation?.violated ?? false,
    hasRedFlag,
    // Section scores
    openingScore: sectionScores.opening ?? 0,
    factFindingScore: sectionScores.factFinding ?? 0,
    eligibilityScore: sectionScores.eligibility ?? 0,
    presentationScore: sectionScores.presentation ?? 0,
    applicationScore: sectionScores.application ?? 0,
    closingScore: sectionScores.closing ?? 0,
    // Rich text fields
    scoreDetails: { blocknote: null, markdown: scoreDetails },
    transcript: { blocknote: null, markdown: transcriptMarkdown },
    // Status
    status: 'COMPLETED',
    analyzedAt: new Date().toISOString(),
  };

  if (redFlagDetails) {
    scorecardData.redFlagDetails = { blocknote: null, markdown: redFlagDetails };
  }

  if (recommendations) {
    scorecardData.recommendations = {
      blocknote: null,
      markdown: recommendations,
    };
  }

  // Link to call record if we have one
  if (body.callId) {
    scorecardData.callId = body.callId;
  }

  const mutation = {
    createQaScorecard: {
      __args: { data: scorecardData },
      id: true,
      name: true,
      overallScore: true,
      overallResult: true,
      hasRedFlag: true,
      status: true,
    },
  } as any;

  const result = await client.mutation(mutation);

  console.log(
    '[analyze] QA Scorecard created:',
    JSON.stringify({
      id: (result as any).createQaScorecard?.id,
      score: overallScore,
      result: scorecardAnalysis.overallResult,
      hasRedFlag,
      callType: redFlagAnalysis.callType,
    }),
  );

  return {
    scorecardId: (result as any).createQaScorecard?.id,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    hasRedFlag,
    callType: redFlagAnalysis.callType,
    redFlags: Object.fromEntries(
      RED_FLAGS.map((flag) => [
        flag.key,
        redFlagAnalysis.redFlags[flag.key]?.violated ?? false,
      ]),
    ),
  };
};

export default defineLogicFunction({
  universalIdentifier: 'b8c4a2e6-3d57-4f19-ae5b-7c9d1f3a5e08',
  name: 'analyze-call-compliance',
  description:
    'Transcribes a call recording and runs two-pass AI compliance analysis to generate a QA scorecard',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: '/analyze-call-compliance',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
