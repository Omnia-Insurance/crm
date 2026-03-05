import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/constants/compliance-rules.ts
var RED_FLAGS = [
  {
    key: "recordedLineDisclosure",
    label: "Recorded Line Disclosure",
    description: "Agent must disclose the call is being recorded within the first 30 seconds",
    scorecardField: "redFlagRecordedLine",
    keywords: [
      "recorded line",
      "being recorded",
      "call is recorded",
      "call may be recorded",
      "monitored and recorded",
      "quality assurance"
    ],
    aiPromptGuidance: 'Check if the agent clearly informed the consumer that the call is being recorded. This must happen within approximately the first 30 seconds of the call. Look for phrases like "this call is being recorded" or "you are on a recorded line".'
  },
  {
    key: "marketplaceDisclosure",
    label: "Marketplace Disclosure",
    description: "Agent must disclose they are not directly associated with the Health Insurance Marketplace or any government agency",
    scorecardField: "redFlagMarketplace",
    keywords: [
      "not the marketplace",
      "not directly associated",
      "not a government",
      "private insurance agency",
      "licensed insurance agency",
      "not affiliated with"
    ],
    aiPromptGuidance: "Check if the agent clearly stated they are NOT directly associated with the Health Insurance Marketplace, healthcare.gov, or any government agency. The agent should identify themselves as a private/licensed insurance agency."
  },
  {
    key: "aorDisclosure",
    label: "Agent of Record (AOR) Disclosure",
    description: "Agent must properly handle the Agent of Record disclosure \u2014 inform consumer they will become their agent and what that means",
    scorecardField: "redFlagAor",
    keywords: [
      "agent of record",
      "your agent",
      "assigned agent",
      "broker of record",
      "represent you"
    ],
    aiPromptGuidance: "Check if the agent explained the Agent of Record (AOR) relationship. The agent should inform the consumer that by proceeding, the agent will become their designated agent/broker of record for their health insurance plan. If this is a transfer/re-enrollment, the agent must explain the AOR change."
  },
  {
    key: "commissionDisclosure",
    label: "Commission Disclosure",
    description: "Agent must disclose that they are compensated via commission at no additional cost to the consumer",
    scorecardField: "redFlagCommission",
    keywords: [
      "commission",
      "compensated",
      "no cost to you",
      "no additional cost",
      "free service",
      "no charge",
      "paid by the insurance"
    ],
    aiPromptGuidance: "Check if the agent disclosed that their services are commission-based and that there is no additional cost to the consumer. The agent should explain they are compensated by the insurance carrier, not the consumer."
  },
  {
    key: "healthSherpaDisclosure",
    label: "HealthSherpa Disclosure",
    description: "When using HealthSherpa for enrollment, agent must provide the HealthSherpa-required disclosure",
    scorecardField: "redFlagHealthSherpa",
    keywords: [
      "healthsherpa",
      "health sherpa",
      "enrollment platform",
      "third-party platform",
      "secure website"
    ],
    aiPromptGuidance: "Check if the agent mentioned HealthSherpa or the enrollment platform when completing the application. If HealthSherpa was used for enrollment, the agent must have disclosed they are using a third-party enrollment platform. Only flag this if the call involves an ACA enrollment."
  },
  {
    key: "agentCoaching",
    label: "Agent Coaching",
    description: "Agent must NOT coach consumers on how to answer health or eligibility questions to manipulate outcomes",
    scorecardField: "redFlagAgentCoaching",
    keywords: [
      "just say",
      "tell them",
      "don't mention",
      "leave that out",
      "don't tell",
      "say you"
    ],
    aiPromptGuidance: "Check if the agent coached or instructed the consumer on how to answer health questions, income questions, or eligibility questions in a way that would manipulate the outcome. Examples: telling a consumer to say they dont have a condition, instructing them to report different income, or coaching them to answer verification questions incorrectly. This is a CRITICAL violation."
  },
  {
    key: "dncViolation",
    label: "DNC Violation",
    description: "If the consumer requests to be placed on the Do Not Call list, the agent must comply immediately",
    scorecardField: "redFlagDncViolation",
    keywords: [
      "do not call",
      "stop calling",
      "remove my number",
      "take me off",
      "dont call me",
      "don't call me",
      "dnc"
    ],
    aiPromptGuidance: "Check if the consumer requested to be placed on the Do Not Call list or asked to stop receiving calls. If so, verify the agent acknowledged the request and did not attempt to continue the sales pitch. The agent must comply immediately and not try to talk the consumer out of it."
  }
];
var SCORING_SECTIONS = [
  {
    id: "opening",
    label: "Opening",
    description: "How the agent opens the call \u2014 introductions, disclosures, and setting expectations",
    criteria: [
      {
        id: "opening-greeting",
        label: "Professional Greeting",
        description: "Agent greets the consumer professionally, states their name and agency",
        maxPoints: 15
      },
      {
        id: "opening-recorded-line",
        label: "Recorded Line Disclosure",
        description: "Agent discloses the call is being recorded (within first 30 seconds)",
        maxPoints: 20
      },
      {
        id: "opening-marketplace-disclosure",
        label: "Marketplace/Government Disclosure",
        description: "Agent states they are not associated with the marketplace or government",
        maxPoints: 20
      },
      {
        id: "opening-commission-disclosure",
        label: "Commission/No Cost Disclosure",
        description: "Agent discloses services are commission-based at no cost to consumer",
        maxPoints: 15
      },
      {
        id: "opening-permission",
        label: "Permission to Proceed",
        description: "Agent asks if the consumer has time or is ready to proceed",
        maxPoints: 10
      },
      {
        id: "opening-rapport",
        label: "Rapport Building",
        description: "Agent builds rapport \u2014 friendly, professional tone, engages the consumer",
        maxPoints: 20
      }
    ]
  },
  {
    id: "factFinding",
    label: "Fact Finding",
    description: "How thoroughly the agent gathers information about the consumer",
    criteria: [
      {
        id: "ff-household",
        label: "Household Information",
        description: "Agent asks about household size, dependents, and who needs coverage",
        maxPoints: 20
      },
      {
        id: "ff-income",
        label: "Income Verification",
        description: "Agent asks about income to determine subsidy eligibility (ACA)",
        maxPoints: 20,
        acaOnly: true
      },
      {
        id: "ff-current-coverage",
        label: "Current Coverage",
        description: "Agent asks about current insurance status and any existing coverage",
        maxPoints: 15
      },
      {
        id: "ff-health-needs",
        label: "Health Needs Assessment",
        description: "Agent asks about medical needs, doctors, prescriptions, conditions",
        maxPoints: 25
      },
      {
        id: "ff-budget",
        label: "Budget Discussion",
        description: "Agent discusses budget expectations and premium affordability",
        maxPoints: 20
      }
    ]
  },
  {
    id: "eligibility",
    label: "Eligibility",
    description: "How the agent determines and explains plan eligibility (ACA-specific)",
    criteria: [
      {
        id: "elig-sep-qle",
        label: "SEP/QLE Verification",
        description: "Agent verifies if there is a qualifying life event for Special Enrollment Period",
        maxPoints: 25,
        acaOnly: true
      },
      {
        id: "elig-subsidy",
        label: "Subsidy Explanation",
        description: "Agent explains premium tax credits and how subsidies work",
        maxPoints: 25,
        acaOnly: true
      },
      {
        id: "elig-medicaid",
        label: "Medicaid/CHIP Screening",
        description: "Agent screens for Medicaid/CHIP eligibility before ACA plans",
        maxPoints: 25,
        acaOnly: true
      },
      {
        id: "elig-documentation",
        label: "Documentation Requirements",
        description: "Agent explains what documents may be needed for enrollment",
        maxPoints: 25
      }
    ]
  },
  {
    id: "presentation",
    label: "Presentation",
    description: "How the agent presents plan options to the consumer",
    criteria: [
      {
        id: "pres-options",
        label: "Multiple Plan Options",
        description: "Agent presents multiple plan options for comparison, not just one",
        maxPoints: 20
      },
      {
        id: "pres-benefits",
        label: "Benefits Explanation",
        description: "Agent clearly explains plan benefits, deductibles, copays, and max out-of-pocket",
        maxPoints: 25
      },
      {
        id: "pres-network",
        label: "Network/Provider Discussion",
        description: "Agent discusses provider networks and whether consumer doctors are in-network",
        maxPoints: 20
      },
      {
        id: "pres-prescription",
        label: "Prescription Coverage",
        description: "Agent addresses prescription drug coverage and formulary",
        maxPoints: 15
      },
      {
        id: "pres-recommendation",
        label: "Clear Recommendation",
        description: "Agent provides a clear recommendation based on the consumer needs discussed",
        maxPoints: 20
      }
    ]
  },
  {
    id: "application",
    label: "Application",
    description: "How the agent handles the enrollment/application process",
    criteria: [
      {
        id: "app-aor",
        label: "AOR Disclosure",
        description: "Agent explains the Agent of Record relationship before enrollment",
        maxPoints: 25
      },
      {
        id: "app-healthsherpa",
        label: "HealthSherpa Disclosure",
        description: "Agent provides required HealthSherpa disclosure when using the platform",
        maxPoints: 25,
        acaOnly: true
      },
      {
        id: "app-accuracy",
        label: "Information Accuracy",
        description: "Agent verifies consumer information for accuracy during application",
        maxPoints: 25
      },
      {
        id: "app-consent",
        label: "Consumer Consent",
        description: "Agent obtains clear verbal consent before submitting the application",
        maxPoints: 25
      }
    ]
  },
  {
    id: "closing",
    label: "Closing",
    description: "How the agent closes the call and sets expectations",
    criteria: [
      {
        id: "close-recap",
        label: "Enrollment Recap",
        description: "Agent recaps the selected plan, effective date, and monthly premium",
        maxPoints: 25
      },
      {
        id: "close-next-steps",
        label: "Next Steps",
        description: "Agent explains next steps (welcome packet, ID cards, first payment)",
        maxPoints: 25
      },
      {
        id: "close-contact",
        label: "Contact Information",
        description: "Agent provides contact information for future questions or changes",
        maxPoints: 25
      },
      {
        id: "close-satisfaction",
        label: "Satisfaction Check",
        description: "Agent asks if the consumer has any remaining questions or concerns",
        maxPoints: 25
      }
    ]
  }
];
var RED_FLAG_SYSTEM_PROMPT = `You are a compliance QA analyst for an insurance agency. Your job is to analyze call transcripts and detect critical compliance violations (red flags) that result in automatic failure.

You MUST be thorough and conservative \u2014 when in doubt about whether a disclosure was made, flag it. Missing a red flag is worse than a false positive.

For each red flag, you must:
1. Determine if the violation occurred (true/false)
2. Provide a brief explanation with evidence (direct quotes from the transcript)
3. Note the approximate timestamp or position in the conversation

Return your analysis as JSON with this exact structure:
{
  "redFlags": {
    "recordedLineDisclosure": { "violated": boolean, "evidence": "string", "explanation": "string" },
    "marketplaceDisclosure": { "violated": boolean, "evidence": "string", "explanation": "string" },
    "aorDisclosure": { "violated": boolean, "evidence": "string", "explanation": "string" },
    "commissionDisclosure": { "violated": boolean, "evidence": "string", "explanation": "string" },
    "healthSherpaDisclosure": { "violated": boolean, "evidence": "string", "explanation": "string" },
    "agentCoaching": { "violated": boolean, "evidence": "string", "explanation": "string" },
    "dncViolation": { "violated": boolean, "evidence": "string", "explanation": "string" }
  },
  "callType": "ACA_SALE" | "ANCILLARY" | "GENERAL",
  "callDirection": "INBOUND" | "OUTBOUND" | "CALLBACK" | "UNKNOWN"
}

IMPORTANT RULES:
- "violated" means the agent FAILED to comply (true = bad, false = good)
- For recordedLineDisclosure: Must be stated within ~30 seconds of call start
- For marketplaceDisclosure: Must be stated during the opening
- For aorDisclosure: Must be explained before enrollment; if no enrollment, mark as not violated
- For commissionDisclosure: Must be stated during the opening
- For healthSherpaDisclosure: Only applicable if ACA enrollment occurs using HealthSherpa; if not an ACA enrollment, mark as not violated
- For agentCoaching: Look for agent telling consumer how to answer questions to manipulate outcomes
- For dncViolation: Only if consumer explicitly asks to stop being called and agent doesnt comply`;
var FULL_SCORECARD_SYSTEM_PROMPT = `You are a compliance QA analyst for an insurance agency. You are scoring a call transcript against a detailed scorecard with 6 sections.

Score each criterion on a 0-100 scale where:
- 100 = Perfectly executed
- 75-99 = Good with minor issues
- 50-74 = Adequate but notable gaps
- 25-49 = Poor execution
- 0-24 = Not addressed or major issues

For criteria marked as ACA-only, score them only if the call involves an ACA sale. For non-ACA calls, mark those criteria as "N/A" with a score of null.

Return your analysis as JSON with this exact structure:
{
  "sections": {
    "opening": {
      "score": number,
      "criteria": {
        "[criterionId]": { "score": number, "evidence": "string", "notes": "string" }
      }
    },
    "factFinding": { ... },
    "eligibility": { ... },
    "presentation": { ... },
    "application": { ... },
    "closing": { ... }
  },
  "overallScore": number,
  "overallResult": "PASS" | "FAIL" | "NEEDS_REVIEW",
  "recommendations": ["string"],
  "strengths": ["string"],
  "areasForImprovement": ["string"]
}

SCORING GUIDELINES:
- Overall score is a weighted average: Opening 15%, Fact Finding 20%, Eligibility 15%, Presentation 20%, Application 15%, Closing 15%
- PASS = overall score >= 80 AND no red flags
- FAIL = overall score < 60 OR has red flags
- NEEDS_REVIEW = overall score 60-79, for human reviewer to decide
- Be specific with evidence \u2014 quote the transcript
- Recommendations should be actionable coaching points`;
var SECTION_WEIGHTS = {
  opening: 0.15,
  factFinding: 0.2,
  eligibility: 0.15,
  presentation: 0.2,
  application: 0.15,
  closing: 0.15
};

// src/utils/call-ai.ts
var callAi = async (systemPrompt, userPrompt) => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token = process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
  if (!apiBaseUrl || !token) {
    throw new Error(
      "Missing TWENTY_API_URL or TWENTY_APP_ACCESS_TOKEN/TWENTY_API_KEY"
    );
  }
  const url = `${apiBaseUrl}/rest/ai/generate-text`;
  console.log("[callAi] Calling", url, "prompt length:", userPrompt.length);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ systemPrompt, userPrompt })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI request failed (${response.status}): ${errorBody}`);
  }
  const data = await response.json();
  console.log(
    "[callAi] Response:",
    JSON.stringify({
      textLength: data.text?.length ?? 0,
      inputTokens: data.usage?.inputTokens,
      outputTokens: data.usage?.outputTokens
    })
  );
  if (!data.text) {
    throw new Error("AI returned empty response");
  }
  return data.text;
};
var parseAiJson = (text) => {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, "");
    cleaned = cleaned.replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
};

// src/utils/transcribe-recording.ts
var formatTimestamp = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};
var transcribeRecording = async (recordingUrl) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY environment variable is not set");
  }
  console.log(
    "[transcribeRecording] Starting transcription for:",
    recordingUrl
  );
  const response = await fetch(
    "https://api.deepgram.com/v1/listen?" + new URLSearchParams({
      model: "nova-3",
      diarize: "true",
      smart_format: "true",
      punctuate: "true",
      utterances: "true"
    }).toString(),
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: recordingUrl })
    }
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Deepgram transcription failed (${response.status}): ${errorBody}`
    );
  }
  const data = await response.json();
  const utterances = data.results?.utterances;
  if (!utterances?.length) {
    const channelTranscript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return {
      segments: [
        { speaker: "Unknown", text: channelTranscript, startTime: 0, endTime: 0 }
      ],
      fullTranscript: channelTranscript,
      markdown: channelTranscript,
      durationSeconds: 0
    };
  }
  const speakerLabels = {};
  let speakerCount = 0;
  const segments = utterances.map((utterance) => {
    if (!(utterance.speaker in speakerLabels)) {
      speakerLabels[utterance.speaker] = speakerCount === 0 ? "Agent" : `Consumer${speakerCount > 1 ? ` ${speakerCount}` : ""}`;
      speakerCount++;
    }
    return {
      speaker: speakerLabels[utterance.speaker],
      text: utterance.transcript,
      startTime: utterance.start,
      endTime: utterance.end
    };
  });
  const lastUtterance = utterances[utterances.length - 1];
  const durationSeconds = lastUtterance ? lastUtterance.end : 0;
  const markdown = segments.map(
    (seg) => `**${seg.speaker}** [${formatTimestamp(seg.startTime)}]: ${seg.text}`
  ).join("\n\n");
  const fullTranscript = segments.map((seg) => `${seg.speaker}: ${seg.text}`).join("\n");
  console.log(
    "[transcribeRecording] Completed:",
    JSON.stringify({
      segments: segments.length,
      durationSeconds: Math.round(durationSeconds),
      speakerCount
    })
  );
  return { segments, fullTranscript, markdown, durationSeconds };
};

// src/logic-functions/analyze-call-compliance.ts
import { defineLogicFunction } from "twenty-sdk";

// node_modules/twenty-sdk/generated/core/index.ts
var CoreApiClient = class {
};

// src/logic-functions/analyze-call-compliance.ts
var buildRedFlagUserPrompt = (transcript) => {
  const flagDescriptions = RED_FLAGS.map(
    (flag) => `- **${flag.label}**: ${flag.aiPromptGuidance}`
  ).join("\n");
  return [
    "Analyze the following call transcript for compliance red flags.",
    "",
    "## Red Flag Definitions",
    flagDescriptions,
    "",
    "## Transcript",
    transcript
  ].join("\n");
};
var buildScorecardUserPrompt = (transcript, callType) => {
  const sectionDescriptions = SCORING_SECTIONS.map((section) => {
    const criteriaList = section.criteria.map((c) => {
      const tags = [];
      if (c.acaOnly) tags.push("ACA only");
      if (c.ancillaryOnly) tags.push("Ancillary only");
      const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
      return `  - **${c.id}** (${c.label}, max ${c.maxPoints} pts${tagStr}): ${c.description}`;
    }).join("\n");
    return `### ${section.label}
${section.description}
${criteriaList}`;
  }).join("\n\n");
  return [
    `Analyze the following call transcript. The call type is: ${callType}`,
    "",
    "## Scoring Criteria",
    sectionDescriptions,
    "",
    "## Transcript",
    transcript
  ].join("\n");
};
var buildRedFlagDetailsMarkdown = (analysis) => {
  const violations = RED_FLAGS.filter(
    (flag) => analysis.redFlags[flag.key]?.violated
  );
  if (violations.length === 0) return null;
  return violations.map((flag) => {
    const result = analysis.redFlags[flag.key];
    return [
      `### ${flag.label}`,
      result.explanation,
      result.evidence ? `> ${result.evidence}` : ""
    ].filter(Boolean).join("\n\n");
  }).join("\n\n---\n\n");
};
var buildScoreDetailsMarkdown = (analysis) => {
  const sectionDetails = SCORING_SECTIONS.map((section) => {
    const sectionResult = analysis.sections[section.id];
    if (!sectionResult) return "";
    const criteriaDetails = section.criteria.map((criterion) => {
      const result = sectionResult.criteria[criterion.id];
      if (!result) return `- **${criterion.label}**: Not scored`;
      const scoreStr = result.score !== null ? `${result.score}/100` : "N/A";
      return [
        `- **${criterion.label}** \u2014 ${scoreStr}`,
        result.notes ? `  ${result.notes}` : "",
        result.evidence ? `  > ${result.evidence}` : ""
      ].filter(Boolean).join("\n");
    }).join("\n");
    return `### ${section.label} \u2014 ${sectionResult.score}/100
${criteriaDetails}`;
  }).join("\n\n");
  const parts = [`## Score Breakdown

${sectionDetails}`];
  if (analysis.strengths?.length) {
    parts.push(
      `## Strengths
${analysis.strengths.map((s) => `- ${s}`).join("\n")}`
    );
  }
  if (analysis.areasForImprovement?.length) {
    parts.push(
      `## Areas for Improvement
${analysis.areasForImprovement.map((s) => `- ${s}`).join("\n")}`
    );
  }
  return parts.join("\n\n");
};
var buildRecommendationsMarkdown = (analysis) => {
  if (!analysis.recommendations?.length) return null;
  return analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
};
var handler = async (event) => {
  const body = event.body;
  if (!body?.callId && !body?.recordingUrl && !body?.transcript) {
    throw new Error(
      "Must provide either callId, recordingUrl, or transcript in request body"
    );
  }
  const client = new CoreApiClient();
  let recordingUrl = body.recordingUrl;
  let callName = "";
  if (body.callId && !recordingUrl) {
    const { call } = await client.query({
      call: {
        __args: { filter: { id: { eq: body.callId } } },
        id: true,
        name: true,
        recording: true
      }
    });
    if (!call) {
      throw new Error(`Call not found: ${body.callId}`);
    }
    const recording = call.recording;
    if (recording?.primaryLinkUrl) {
      recordingUrl = recording.primaryLinkUrl;
    } else if (typeof recording === "string") {
      recordingUrl = recording;
    }
    callName = call.name || "";
    if (!recordingUrl) {
      throw new Error(`No recording URL found on call ${body.callId}`);
    }
  }
  let transcriptMarkdown = body.transcript ?? "";
  if (!transcriptMarkdown && recordingUrl) {
    console.log("[analyze] Transcribing recording...");
    const transcription = await transcribeRecording(recordingUrl);
    transcriptMarkdown = transcription.markdown;
  }
  if (!transcriptMarkdown) {
    throw new Error("No transcript available for analysis");
  }
  console.log("[analyze] Pass 1: Red flag analysis...");
  const redFlagText = await callAi(
    RED_FLAG_SYSTEM_PROMPT,
    buildRedFlagUserPrompt(transcriptMarkdown)
  );
  const redFlagAnalysis = parseAiJson(redFlagText);
  const hasRedFlag = RED_FLAGS.some(
    (flag) => redFlagAnalysis.redFlags[flag.key]?.violated
  );
  console.log("[analyze] Pass 2: Full scorecard analysis...");
  const scorecardText = await callAi(
    FULL_SCORECARD_SYSTEM_PROMPT,
    buildScorecardUserPrompt(
      transcriptMarkdown,
      redFlagAnalysis.callType || "GENERAL"
    )
  );
  const scorecardAnalysis = parseAiJson(scorecardText);
  if (hasRedFlag && scorecardAnalysis.overallResult !== "FAIL") {
    scorecardAnalysis.overallResult = "FAIL";
  }
  const sectionScores = {};
  for (const section of SCORING_SECTIONS) {
    const sectionResult = scorecardAnalysis.sections[section.id];
    sectionScores[section.id] = sectionResult?.score ?? 0;
  }
  let computedOverall = 0;
  for (const [sectionId, weight] of Object.entries(SECTION_WEIGHTS)) {
    computedOverall += (sectionScores[sectionId] ?? 0) * weight;
  }
  const overallScore = Math.round(computedOverall);
  const agentLabel = body.agentName || "Unknown Agent";
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const scorecardName = `QA - ${agentLabel} - ${callName || dateStr}`;
  console.log("[analyze] Creating QA Scorecard record...");
  const scoreDetails = buildScoreDetailsMarkdown(scorecardAnalysis);
  const redFlagDetails = buildRedFlagDetailsMarkdown(redFlagAnalysis);
  const recommendations = buildRecommendationsMarkdown(scorecardAnalysis);
  const scorecardData = {
    name: scorecardName,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    callType: redFlagAnalysis.callType || "GENERAL",
    // Red flags
    redFlagRecordedLine: redFlagAnalysis.redFlags.recordedLineDisclosure?.violated ?? false,
    redFlagMarketplace: redFlagAnalysis.redFlags.marketplaceDisclosure?.violated ?? false,
    redFlagAor: redFlagAnalysis.redFlags.aorDisclosure?.violated ?? false,
    redFlagCommission: redFlagAnalysis.redFlags.commissionDisclosure?.violated ?? false,
    redFlagHealthSherpa: redFlagAnalysis.redFlags.healthSherpaDisclosure?.violated ?? false,
    redFlagAgentCoaching: redFlagAnalysis.redFlags.agentCoaching?.violated ?? false,
    redFlagDncViolation: redFlagAnalysis.redFlags.dncViolation?.violated ?? false,
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
    status: "COMPLETED",
    analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (redFlagDetails) {
    scorecardData.redFlagDetails = { blocknote: null, markdown: redFlagDetails };
  }
  if (recommendations) {
    scorecardData.recommendations = {
      blocknote: null,
      markdown: recommendations
    };
  }
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
      status: true
    }
  };
  const result = await client.mutation(mutation);
  console.log(
    "[analyze] QA Scorecard created:",
    JSON.stringify({
      id: result.createQaScorecard?.id,
      score: overallScore,
      result: scorecardAnalysis.overallResult,
      hasRedFlag,
      callType: redFlagAnalysis.callType
    })
  );
  return {
    scorecardId: result.createQaScorecard?.id,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    hasRedFlag,
    callType: redFlagAnalysis.callType,
    redFlags: Object.fromEntries(
      RED_FLAGS.map((flag) => [
        flag.key,
        redFlagAnalysis.redFlags[flag.key]?.violated ?? false
      ])
    )
  };
};
var analyze_call_compliance_default = defineLogicFunction({
  universalIdentifier: "b8c4a2e6-3d57-4f19-ae5b-7c9d1f3a5e08",
  name: "analyze-call-compliance",
  description: "Transcribes a call recording and runs two-pass AI compliance analysis to generate a QA scorecard",
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: "/analyze-call-compliance",
    httpMethod: "POST",
    isAuthRequired: false
  }
});
export {
  analyze_call_compliance_default as default
};
//# sourceMappingURL=analyze-call-compliance.mjs.map
