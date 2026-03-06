import {
  FULL_SCORECARD_SYSTEM_PROMPT,
  RED_FLAGS,
  RED_FLAG_SYSTEM_PROMPT,
  SCORING_SECTIONS,
  SECTION_WEIGHTS,
  type RedFlagKey,
} from 'src/constants/compliance-rules';
import { callAi, parseAiJson } from 'src/utils/call-ai';
import { transcribeRecording } from 'src/utils/transcribe-recording';
import { defineLogicFunction } from 'twenty-sdk';
import { CoreApiClient } from 'twenty-sdk/generated';
import type {
  QaScorecardCallTypeEnum,
  QaScorecardCreateInput,
  QaScorecardOverallResultEnum,
  QaScorecardStatusEnum,
} from 'twenty-sdk/generated/core';

// ============================================================
// Types
// ============================================================

type RedFlagResult = {
  violated: boolean;
  evidence: string;
  explanation: string;
};

type RedFlagAnalysis = {
  callQuality: 'SCORABLE' | 'NOT_SCORABLE';
  redFlags: Record<RedFlagKey, RedFlagResult>;
  callType: QaScorecardCallTypeEnum;
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

type StructuredRecommendation = {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  detail: string;
};

type ScorecardAnalysis = {
  sections: Record<string, SectionResult>;
  overallScore: number;
  overallResult: QaScorecardOverallResultEnum;
  recommendations: StructuredRecommendation[];
  strengths: string[];
  areasForImprovement: string[];
};

type RequestBody = {
  recordingUrl?: string;
  transcript?: string;
  agentId?: string;
  agentName?: string;
  callId?: string;
  callName?: string;
};

// Note: The app token is scoped to this app's objects only.
// Workspace objects (agentProfile, call) must be resolved via the
// workspace-level API key, not the app access token.

// ============================================================
// Helpers
// ============================================================

const resolveAgentName = async (agentId: string): Promise<string | null> => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token =
    process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;

  if (!apiBaseUrl || !token) return null;

  const response = await fetch(`${apiBaseUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: `query { agentProfile(filter: { id: { eq: "${agentId}" } }) { name } }`,
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    data?: { agentProfile?: { name?: string } };
  };

  return data.data?.agentProfile?.name ?? null;
};

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

  return analysis.recommendations
    .map((r) => {
      if (typeof r === 'string') return r;

      const category = r.category
        ? `[${r.category.charAt(0).toUpperCase() + r.category.slice(1)}]`
        : '';

      return `**${r.priority}** ${category} — ${r.title}\n${r.detail}`;
    })
    .join('\n\n');
};

// ============================================================
// Main Handler
// ============================================================

const handler = async (event: { body: RequestBody | null }) => {
  const body = event.body;

  if (!body?.recordingUrl && !body?.transcript) {
    throw new Error(
      'Must provide either recordingUrl or transcript in request body',
    );
  }

  const client = new CoreApiClient();

  const recordingUrl = body.recordingUrl;

  // Step 1b: Resolve agent name from agentId if not provided
  let agentName = body.agentName;

  if (!agentName && body.agentId) {
    console.log('[analyze] Resolving agent name for', body.agentId);
    agentName = (await resolveAgentName(body.agentId)) ?? undefined;
    console.log('[analyze] Resolved agent name:', agentName ?? 'not found');
  }

  // Helper to link agentProfile and call after scorecard creation
  const linkRelations = async (scorecardId: string) => {
    const updateFields: Record<string, string> = {};

    if (body.agentId) updateFields.agentProfileId = body.agentId;
    if (body.callId) updateFields.callId = body.callId;

    if (Object.keys(updateFields).length === 0) return;

    try {
      const apiBaseUrl = process.env.TWENTY_API_URL;
      const token =
        process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;

      if (!apiBaseUrl || !token) return;

      const dataStr = Object.entries(updateFields)
        .map(([k, v]) => `${k}: "${v}"`)
        .join(', ');

      await fetch(`${apiBaseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `mutation { updateQaScorecard(id: "${scorecardId}", data: { ${dataStr} }) { id } }`,
        }),
      });

      console.log(
        '[analyze] Linked relations to scorecard',
        scorecardId,
        updateFields,
      );
    } catch (err) {
      console.warn('[analyze] Failed to link relations:', err);
    }
  };

  // Step 2: Transcribe (or use provided transcript)
  let transcriptMarkdown = body.transcript ?? '';

  if (!transcriptMarkdown && recordingUrl) {
    console.log('[analyze] Transcribing recording...');

    try {
      const transcription = await transcribeRecording(recordingUrl);

      transcriptMarkdown = transcription.markdown;
    } catch (transcriptionError) {
      // Recording is empty, inaccessible, or too short for Deepgram.
      // Create a SKIPPED scorecard instead of failing the workflow.
      console.warn(
        '[analyze] Transcription failed, creating SKIPPED scorecard:',
        transcriptionError,
      );

      const agentLabel = agentName || 'Unknown Agent';
      const dateStr = new Date().toISOString().slice(0, 10);
      const scorecardName = `QA - ${agentLabel} - ${body.callName || dateStr}`;
      const errorMsg =
        transcriptionError instanceof Error
          ? transcriptionError.message
          : 'Unknown transcription error';

      const scorecardData: QaScorecardCreateInput = {
        name: scorecardName,
        overallScore: 0,
        overallResult:
          'NOT_APPLICABLE' as unknown as QaScorecardOverallResultEnum,
        callType: 'GENERAL',
        redFlagRecordedLine: false,
        redFlagMarketplace: false,
        redFlagAor: false,
        redFlagCommission: false,
        redFlagHealthSherpa: false,
        redFlagAgentCoaching: false,
        redFlagDncViolation: false,
        hasRedFlag: false,
        openingScore: 0,
        factFindingScore: 0,
        eligibilityScore: 0,
        presentationScore: 0,
        applicationScore: 0,
        closingScore: 0,
        scoreDetails: {
          blocknote: null,
          markdown: `Transcription failed: ${errorMsg}`,
        },
        status: 'SKIPPED' as unknown as QaScorecardStatusEnum,
        analyzedAt: new Date().toISOString(),
      };

      const result = await client.mutation({
        createQaScorecard: {
          __args: { data: scorecardData },
          id: true,
          name: true,
          status: true,
        },
      });

      const scorecardId = result.createQaScorecard?.id;

      if (scorecardId) {
        await linkRelations(scorecardId);
      }

      return {
        scorecardId,
        overallScore: 0,
        overallResult: 'NOT_APPLICABLE',
        hasRedFlag: false,
        callQuality: 'NOT_SCORABLE',
        error: errorMsg,
      };
    }
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

  const isNotScorable = redFlagAnalysis.callQuality === 'NOT_SCORABLE';

  // Step 3b: Build display name (needed for both paths)
  const agentLabel = agentName || 'Unknown Agent';
  const dateStr = new Date().toISOString().slice(0, 10);
  const scorecardName = `QA - ${agentLabel} - ${body.callName || dateStr}`;

  // Step 4: Handle NOT_SCORABLE calls — skip Pass 2
  if (isNotScorable) {
    console.log(
      '[analyze] Call classified as NOT_SCORABLE — skipping full scorecard analysis',
    );

    const scorecardData: QaScorecardCreateInput = {
      name: scorecardName,
      overallScore: 0,
      overallResult:
        'NOT_APPLICABLE' as unknown as QaScorecardOverallResultEnum,
      callType: redFlagAnalysis.callType || 'GENERAL',
      redFlagRecordedLine: false,
      redFlagMarketplace: false,
      redFlagAor: false,
      redFlagCommission: false,
      redFlagHealthSherpa: false,
      redFlagAgentCoaching: false,
      redFlagDncViolation: false,
      hasRedFlag: false,
      openingScore: 0,
      factFindingScore: 0,
      eligibilityScore: 0,
      presentationScore: 0,
      applicationScore: 0,
      closingScore: 0,
      transcript: { blocknote: null, markdown: transcriptMarkdown },
      status: 'SKIPPED' as unknown as QaScorecardStatusEnum,
      analyzedAt: new Date().toISOString(),
    };

    const result = await client.mutation({
      createQaScorecard: {
        __args: { data: scorecardData },
        id: true,
        name: true,
        overallScore: true,
        overallResult: true,
        hasRedFlag: true,
        status: true,
      },
    });

    const scorecardId = result.createQaScorecard?.id;

    if (scorecardId) {
      await linkRelations(scorecardId);
    }

    console.log(
      '[analyze] QA Scorecard created (SKIPPED):',
      JSON.stringify({
        id: scorecardId,
        score: 0,
        result: 'NOT_APPLICABLE',
        hasRedFlag: false,
        callType: redFlagAnalysis.callType,
      }),
    );

    return {
      scorecardId,
      overallScore: 0,
      overallResult: 'NOT_APPLICABLE',
      hasRedFlag: false,
      callType: redFlagAnalysis.callType,
      callQuality: 'NOT_SCORABLE',
      redFlags: Object.fromEntries(
        RED_FLAGS.map((flag) => [flag.key, false]),
      ),
    };
  }

  // Step 5: Pass 2 — Full Scorecard Analysis (SCORABLE calls only)
  const hasRedFlag = RED_FLAGS.some(
    (flag) => redFlagAnalysis.redFlags[flag.key]?.violated,
  );

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

  // Step 6: Compute section scores
  const sectionScores: Record<string, number> = {};

  for (const section of SCORING_SECTIONS) {
    const sectionResult = scorecardAnalysis.sections[section.id];

    sectionScores[section.id] = sectionResult?.score ?? 0;
  }

  let computedOverall = 0;

  for (const [sectionId, weight] of Object.entries(SECTION_WEIGHTS)) {
    computedOverall += (sectionScores[sectionId] ?? 0) * weight;
  }

  const overallScore = Math.round(computedOverall);

  // Step 7: Create QaScorecard record
  console.log('[analyze] Creating QA Scorecard record...');

  const scoreDetails = buildScoreDetailsMarkdown(scorecardAnalysis);
  const redFlagDetails = buildRedFlagDetailsMarkdown(redFlagAnalysis);
  const recommendations = buildRecommendationsMarkdown(scorecardAnalysis);

  const scorecardData: QaScorecardCreateInput = {
    name: scorecardName,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    callType: redFlagAnalysis.callType || 'GENERAL',
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
    openingScore: sectionScores.opening ?? 0,
    factFindingScore: sectionScores.factFinding ?? 0,
    eligibilityScore: sectionScores.eligibility ?? 0,
    presentationScore: sectionScores.presentation ?? 0,
    applicationScore: sectionScores.application ?? 0,
    closingScore: sectionScores.closing ?? 0,
    scoreDetails: { blocknote: null, markdown: scoreDetails },
    transcript: { blocknote: null, markdown: transcriptMarkdown },
    status: 'COMPLETED',
    analyzedAt: new Date().toISOString(),
  };

  if (redFlagDetails) {
    scorecardData.redFlagDetails = {
      blocknote: null,
      markdown: redFlagDetails,
    };
  }

  if (recommendations) {
    scorecardData.recommendations = {
      blocknote: null,
      markdown: recommendations,
    };
  }

  const result = await client.mutation({
    createQaScorecard: {
      __args: { data: scorecardData },
      id: true,
      name: true,
      overallScore: true,
      overallResult: true,
      hasRedFlag: true,
      status: true,
    },
  });

  const scorecardId = result.createQaScorecard?.id;

  if (scorecardId) {
    await linkRelations(scorecardId);
  }

  console.log(
    '[analyze] QA Scorecard created:',
    JSON.stringify({
      id: scorecardId,
      score: overallScore,
      result: scorecardAnalysis.overallResult,
      hasRedFlag,
      callType: redFlagAnalysis.callType,
    }),
  );

  return {
    scorecardId,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    hasRedFlag,
    callType: redFlagAnalysis.callType,
    callQuality: 'SCORABLE',
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
