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

## Step 1: Call Classification

Before analyzing red flags, classify the call as SCORABLE or NOT_SCORABLE.

A call is NOT_SCORABLE if ANY of these apply:
- Voicemail: the agent left a voicemail and no live conversation occurred
- Wrong number: the person reached is not the intended consumer
- Mailbox full / no answer: no real connection was made
- No two-way conversation: only one party speaks (e.g. automated message, hold music, dead air)
- Trivially short: under ~15 seconds of actual dialogue between agent and consumer

If the call is NOT_SCORABLE:
- Set "callQuality" to "NOT_SCORABLE"
- Set ALL red flags to "violated": false
- Set evidence/explanation to a brief reason (e.g. "Voicemail \u2014 no live conversation")
- Return immediately without further analysis

If the call is SCORABLE, set "callQuality" to "SCORABLE" and proceed to Step 2.

## Step 2: Red Flag Analysis (SCORABLE calls only)

You MUST be thorough and conservative \u2014 when in doubt about whether a disclosure was made, flag it. Missing a red flag is worse than a false positive.

For each red flag, you must:
1. Determine if the violation occurred (true/false)
2. Provide a brief explanation with evidence (direct quotes from the transcript)
3. Note the approximate timestamp or position in the conversation

Return your analysis as JSON with this exact structure:
{
  "callQuality": "SCORABLE" | "NOT_SCORABLE",
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
- For dncViolation: Only if consumer explicitly asks to stop being called and agent doesnt comply
- For disclosure flags (recordedLine, marketplace, commission, aor, healthSherpa): only flag as violated if the call progressed past the opening \u2014 the agent had a real conversation with the consumer. A 10-second call where the consumer hangs up immediately should NOT trigger missing disclosure flags.`;
var FULL_SCORECARD_SYSTEM_PROMPT = `You are a compliance QA analyst for an insurance agency. You are scoring a call transcript against a detailed scorecard with 6 sections.

## Not-Scorable Calls

If the call was classified as NOT_SCORABLE (voicemail, wrong number, trivially short, no real conversation), return immediately with:
{
  "sections": {},
  "overallScore": 0,
  "overallResult": "NOT_APPLICABLE",
  "recommendations": [],
  "strengths": [],
  "areasForImprovement": []
}

Do NOT attempt to score a not-scorable call.

## Scoring (SCORABLE calls only)

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
  "recommendations": [
    {
      "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "category": "disclosure" | "scripting" | "fact-finding" | "presentation" | "closing" | "conduct",
      "title": "Short action title",
      "detail": "One sentence explanation"
    }
  ],
  "strengths": ["string"],
  "areasForImprovement": ["string"]
}

SCORING GUIDELINES:
- Overall score is a weighted average: Opening 15%, Fact Finding 20%, Eligibility 15%, Presentation 20%, Application 15%, Closing 15%
- PASS = overall score >= 80 AND no red flags
- FAIL = overall score < 60 OR has red flags
- NEEDS_REVIEW = overall score 60-79, for human reviewer to decide
- Be specific with evidence \u2014 quote the transcript
- Recommendations must be structured objects with priority, category, title, and detail \u2014 NOT plain strings`;
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
  try {
    return JSON.parse(cleaned);
  } catch {
    const startIdx = cleaned.search(/[{[]/);
    if (startIdx === -1) {
      throw new Error("No JSON found in AI response");
    }
    const opener = cleaned[startIdx];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = startIdx; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === opener) depth++;
      if (ch === closer) depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(startIdx, i + 1));
      }
    }
    throw new Error("Malformed JSON in AI response");
  }
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
  console.log("[transcribeRecording] Downloading recording...");
  const downloadResponse = await fetch(recordingUrl);
  if (!downloadResponse.ok) {
    throw new Error(
      `Failed to download recording (${downloadResponse.status}): ${await downloadResponse.text()}`
    );
  }
  const audioBuffer = await downloadResponse.arrayBuffer();
  const contentType = downloadResponse.headers.get("content-type") ?? "audio/mpeg";
  console.log(
    "[transcribeRecording] Downloaded",
    audioBuffer.byteLength,
    "bytes, sending to Deepgram..."
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
        "Content-Type": contentType
      },
      body: audioBuffer
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

// node_modules/twenty-sdk/generated/core/runtime/error.ts
var GenqlError = class extends Error {
  constructor(errors, data) {
    let message = Array.isArray(errors) ? errors.map((x) => x?.message || "").join("\n") : "";
    if (!message) {
      message = "GraphQL error";
    }
    super(message);
    this.errors = [];
    this.errors = errors;
    this.data = data;
  }
};

// node_modules/twenty-sdk/generated/core/runtime/batcher.ts
function dispatchQueueBatch(client, queue) {
  let batchedQuery = queue.map((item) => item.request);
  if (batchedQuery.length === 1) {
    batchedQuery = batchedQuery[0];
  }
  client.fetcher(batchedQuery).then((responses) => {
    if (queue.length === 1 && !Array.isArray(responses)) {
      if (responses.errors && responses.errors.length) {
        queue[0].reject(
          new GenqlError(responses.errors, responses.data)
        );
        return;
      }
      queue[0].resolve(responses);
      return;
    } else if (responses.length !== queue.length) {
      throw new Error("response length did not match query length");
    }
    for (let i = 0; i < queue.length; i++) {
      if (responses[i].errors && responses[i].errors.length) {
        queue[i].reject(
          new GenqlError(responses[i].errors, responses[i].data)
        );
      } else {
        queue[i].resolve(responses[i]);
      }
    }
  });
}
function dispatchQueue(client, options) {
  const queue = client._queue;
  const maxBatchSize = options.maxBatchSize || 0;
  client._queue = [];
  if (maxBatchSize > 0 && maxBatchSize < queue.length) {
    for (let i = 0; i < queue.length / maxBatchSize; i++) {
      dispatchQueueBatch(
        client,
        queue.slice(i * maxBatchSize, (i + 1) * maxBatchSize)
      );
    }
  } else {
    dispatchQueueBatch(client, queue);
  }
}
var QueryBatcher = class _QueryBatcher {
  constructor(fetcher, {
    batchInterval = 6,
    shouldBatch = true,
    maxBatchSize = 0
  } = {}) {
    this.fetcher = fetcher;
    this._options = {
      batchInterval,
      shouldBatch,
      maxBatchSize
    };
    this._queue = [];
  }
  /**
   * Fetch will send a graphql request and return the parsed json.
   * @param {string}      query          - the graphql query.
   * @param {Variables}   variables      - any variables you wish to inject as key/value pairs.
   * @param {[string]}    operationName  - the graphql operationName.
   * @param {Options}     overrides      - the client options overrides.
   *
   * @return {promise} resolves to parsed json of server response
   *
   * @example
   * client.fetch(`
   *    query getHuman($id: ID!) {
   *      human(id: $id) {
   *        name
   *        height
   *      }
   *    }
   * `, { id: "1001" }, 'getHuman')
   *    .then(human => {
   *      // do something with human
   *      console.log(human);
   *    });
   */
  fetch(query, variables, operationName, overrides = {}) {
    const request = {
      query
    };
    const options = Object.assign({}, this._options, overrides);
    if (variables) {
      request.variables = variables;
    }
    if (operationName) {
      request.operationName = operationName;
    }
    const promise = new Promise((resolve, reject) => {
      this._queue.push({
        request,
        resolve,
        reject
      });
      if (this._queue.length === 1) {
        if (options.shouldBatch) {
          setTimeout(
            () => dispatchQueue(this, options),
            options.batchInterval
          );
        } else {
          dispatchQueue(this, options);
        }
      }
    });
    return promise;
  }
  /**
   * Fetch will send a graphql request and return the parsed json.
   * @param {string}      query          - the graphql query.
   * @param {Variables}   variables      - any variables you wish to inject as key/value pairs.
   * @param {[string]}    operationName  - the graphql operationName.
   * @param {Options}     overrides      - the client options overrides.
   *
   * @return {Promise<Array<Result>>} resolves to parsed json of server response
   *
   * @example
   * client.forceFetch(`
   *    query getHuman($id: ID!) {
   *      human(id: $id) {
   *        name
   *        height
   *      }
   *    }
   * `, { id: "1001" }, 'getHuman')
   *    .then(human => {
   *      // do something with human
   *      console.log(human);
   *    });
   */
  forceFetch(query, variables, operationName, overrides = {}) {
    const request = {
      query
    };
    const options = Object.assign({}, this._options, overrides, {
      shouldBatch: false
    });
    if (variables) {
      request.variables = variables;
    }
    if (operationName) {
      request.operationName = operationName;
    }
    const promise = new Promise((resolve, reject) => {
      const client = new _QueryBatcher(this.fetcher, this._options);
      client._queue = [
        {
          request,
          resolve,
          reject
        }
      ];
      dispatchQueue(client, options);
    });
    return promise;
  }
};

// node_modules/twenty-sdk/generated/core/runtime/fetcher.ts
var DEFAULT_BATCH_OPTIONS = {
  maxBatchSize: 10,
  batchInterval: 40
};
var createFetcher = ({
  url,
  headers = {},
  fetcher,
  fetch: _fetch,
  batch = false,
  ...rest
}) => {
  if (!url && !fetcher) {
    throw new Error("url or fetcher is required");
  }
  if (!fetcher) {
    fetcher = async (body) => {
      let headersObject = typeof headers == "function" ? await headers() : headers;
      headersObject = headersObject || {};
      if (typeof fetch === "undefined" && !_fetch) {
        throw new Error(
          "Global `fetch` function is not available, pass a fetch polyfill to Genql `createClient`"
        );
      }
      let fetchImpl = _fetch || fetch;
      const res = await fetchImpl(url, {
        headers: {
          "Content-Type": "application/json",
          ...headersObject
        },
        method: "POST",
        body: JSON.stringify(body),
        ...rest
      });
      if (!res.ok) {
        throw new Error(`${res.statusText}: ${await res.text()}`);
      }
      const json = await res.json();
      return json;
    };
  }
  if (!batch) {
    return async (body) => {
      const json = await fetcher(body);
      if (Array.isArray(json)) {
        return json.map((json2) => {
          if (json2?.errors?.length) {
            throw new GenqlError(json2.errors || [], json2.data);
          }
          return json2.data;
        });
      } else {
        if (json?.errors?.length) {
          throw new GenqlError(json.errors || [], json.data);
        }
        return json.data;
      }
    };
  }
  const batcher = new QueryBatcher(
    async (batchedQuery) => {
      const json = await fetcher(batchedQuery);
      return json;
    },
    batch === true ? DEFAULT_BATCH_OPTIONS : batch
  );
  return async ({ query, variables }) => {
    const json = await batcher.fetch(query, variables);
    if (json?.data) {
      return json.data;
    }
    throw new Error(
      "Genql batch fetcher returned unexpected result " + JSON.stringify(json)
    );
  };
};

// node_modules/twenty-sdk/generated/core/runtime/generateGraphqlOperation.ts
var parseRequest = (request, ctx, path) => {
  if (typeof request === "object" && "__args" in request) {
    const args = request.__args;
    let fields = { ...request };
    delete fields.__args;
    const argNames = Object.keys(args);
    if (argNames.length === 0) {
      return parseRequest(fields, ctx, path);
    }
    const field = getFieldFromPath(ctx.root, path);
    const argStrings = argNames.map((argName) => {
      ctx.varCounter++;
      const varName = `v${ctx.varCounter}`;
      const typing = field.args && field.args[argName];
      if (!typing) {
        throw new Error(
          `no typing defined for argument \`${argName}\` in path \`${path.join(
            "."
          )}\``
        );
      }
      ctx.variables[varName] = {
        value: args[argName],
        typing
      };
      return `${argName}:$${varName}`;
    });
    return `(${argStrings})${parseRequest(fields, ctx, path)}`;
  } else if (typeof request === "object" && Object.keys(request).length > 0) {
    const fields = request;
    const fieldNames = Object.keys(fields).filter((k) => Boolean(fields[k]));
    if (fieldNames.length === 0) {
      throw new Error(
        `field selection should not be empty: ${path.join(".")}`
      );
    }
    const type = path.length > 0 ? getFieldFromPath(ctx.root, path).type : ctx.root;
    const scalarFields = type.scalar;
    let scalarFieldsFragment;
    if (fieldNames.includes("__scalar")) {
      const falsyFieldNames = new Set(
        Object.keys(fields).filter((k) => !Boolean(fields[k]))
      );
      if (scalarFields?.length) {
        ctx.fragmentCounter++;
        scalarFieldsFragment = `f${ctx.fragmentCounter}`;
        ctx.fragments.push(
          `fragment ${scalarFieldsFragment} on ${type.name}{${scalarFields.filter((f) => !falsyFieldNames.has(f)).join(",")}}`
        );
      }
    }
    const fieldsSelection = fieldNames.filter((f) => !["__scalar", "__name"].includes(f)).map((f) => {
      const parsed = parseRequest(fields[f], ctx, [...path, f]);
      if (f.startsWith("on_")) {
        ctx.fragmentCounter++;
        const implementationFragment = `f${ctx.fragmentCounter}`;
        const typeMatch = f.match(/^on_(.+)/);
        if (!typeMatch || !typeMatch[1])
          throw new Error("match failed");
        ctx.fragments.push(
          `fragment ${implementationFragment} on ${typeMatch[1]}${parsed}`
        );
        return `...${implementationFragment}`;
      } else {
        return `${f}${parsed}`;
      }
    }).concat(scalarFieldsFragment ? [`...${scalarFieldsFragment}`] : []).join(",");
    return `{${fieldsSelection}}`;
  } else {
    return "";
  }
};
var generateGraphqlOperation = (operation, root, fields) => {
  const ctx = {
    root,
    varCounter: 0,
    variables: {},
    fragmentCounter: 0,
    fragments: []
  };
  const result = parseRequest(fields, ctx, []);
  const varNames = Object.keys(ctx.variables);
  const varsString = varNames.length > 0 ? `(${varNames.map((v) => {
    const variableType = ctx.variables[v].typing[1];
    return `$${v}:${variableType}`;
  })})` : "";
  const operationName = fields?.__name || "";
  return {
    query: [
      `${operation} ${operationName}${varsString}${result}`,
      ...ctx.fragments
    ].join(","),
    variables: Object.keys(ctx.variables).reduce(
      (r, v) => {
        r[v] = ctx.variables[v].value;
        return r;
      },
      {}
    ),
    ...operationName ? { operationName: operationName.toString() } : {}
  };
};
var getFieldFromPath = (root, path) => {
  let current;
  if (!root) throw new Error("root type is not provided");
  if (path.length === 0) throw new Error(`path is empty`);
  path.forEach((f) => {
    const type = current ? current.type : root;
    if (!type.fields)
      throw new Error(`type \`${type.name}\` does not have fields`);
    const possibleTypes = Object.keys(type.fields).filter((i) => i.startsWith("on_")).reduce(
      (types, fieldName) => {
        const field2 = type.fields && type.fields[fieldName];
        if (field2) types.push(field2.type);
        return types;
      },
      [type]
    );
    let field = null;
    possibleTypes.forEach((type2) => {
      const found = type2.fields && type2.fields[f];
      if (found) field = found;
    });
    if (!field)
      throw new Error(
        `type \`${type.name}\` does not have a field \`${f}\``
      );
    current = field;
  });
  return current;
};

// node_modules/twenty-sdk/generated/core/runtime/createClient.ts
var createClient = ({
  queryRoot,
  mutationRoot,
  subscriptionRoot,
  ...options
}) => {
  const fetcher = createFetcher(options);
  const client = {};
  if (queryRoot) {
    client.query = (request) => {
      if (!queryRoot) throw new Error("queryRoot argument is missing");
      const resultPromise = fetcher(
        generateGraphqlOperation("query", queryRoot, request)
      );
      return resultPromise;
    };
  }
  if (mutationRoot) {
    client.mutation = (request) => {
      if (!mutationRoot)
        throw new Error("mutationRoot argument is missing");
      const resultPromise = fetcher(
        generateGraphqlOperation("mutation", mutationRoot, request)
      );
      return resultPromise;
    };
  }
  return client;
};

// node_modules/twenty-sdk/generated/core/runtime/linkTypeMap.ts
var linkTypeMap = (typeMap3) => {
  const indexToName = Object.assign(
    {},
    ...Object.keys(typeMap3.types).map((k, i) => ({ [i]: k }))
  );
  let intermediaryTypeMap = Object.assign(
    {},
    ...Object.keys(typeMap3.types || {}).map(
      (k) => {
        const type = typeMap3.types[k];
        const fields = type || {};
        return {
          [k]: {
            name: k,
            // type scalar properties
            scalar: Object.keys(fields).filter((f) => {
              const [type2] = fields[f] || [];
              return type2 && typeMap3.scalars.includes(type2);
            }),
            // fields with corresponding `type` and `args`
            fields: Object.assign(
              {},
              ...Object.keys(fields).map(
                (f) => {
                  const [typeIndex, args] = fields[f] || [];
                  if (typeIndex == null) {
                    return {};
                  }
                  return {
                    [f]: {
                      // replace index with type name
                      type: indexToName[typeIndex],
                      args: Object.assign(
                        {},
                        ...Object.keys(args || {}).map(
                          (k2) => {
                            if (!args || !args[k2]) {
                              return;
                            }
                            const [
                              argTypeName,
                              argTypeString
                            ] = args[k2];
                            return {
                              [k2]: [
                                indexToName[argTypeName],
                                argTypeString || indexToName[argTypeName]
                              ]
                            };
                          }
                        )
                      )
                    }
                  };
                }
              )
            )
          }
        };
      }
    )
  );
  const res = resolveConcreteTypes(intermediaryTypeMap);
  return res;
};
var resolveConcreteTypes = (linkedTypeMap) => {
  Object.keys(linkedTypeMap).forEach((typeNameFromKey) => {
    const type = linkedTypeMap[typeNameFromKey];
    if (!type.fields) {
      return;
    }
    const fields = type.fields;
    Object.keys(fields).forEach((f) => {
      const field = fields[f];
      if (field.args) {
        const args = field.args;
        Object.keys(args).forEach((key) => {
          const arg = args[key];
          if (arg) {
            const [typeName2] = arg;
            if (typeof typeName2 === "string") {
              if (!linkedTypeMap[typeName2]) {
                linkedTypeMap[typeName2] = { name: typeName2 };
              }
              arg[0] = linkedTypeMap[typeName2];
            }
          }
        });
      }
      const typeName = field.type;
      if (typeof typeName === "string") {
        if (!linkedTypeMap[typeName]) {
          linkedTypeMap[typeName] = { name: typeName };
        }
        field.type = linkedTypeMap[typeName];
      }
    });
  });
  return linkedTypeMap;
};

// node_modules/twenty-sdk/generated/core/types.ts
var types_default = {
  "scalars": [
    1,
    2,
    6,
    7,
    8,
    10,
    13,
    14,
    22,
    23,
    25,
    29,
    34,
    59,
    62,
    81,
    107,
    108,
    111,
    115,
    118,
    160,
    161,
    162,
    163,
    185,
    246,
    247,
    294,
    309,
    310,
    311,
    312,
    313,
    314,
    315,
    330,
    345,
    380,
    427,
    475,
    505,
    533,
    548,
    549,
    550,
    614,
    644,
    645,
    646
  ],
  "types": {
    "TimelineCalendarEventParticipant": {
      "personId": [
        2
      ],
      "workspaceMemberId": [
        2
      ],
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "displayName": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "handle": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "String": {},
    "UUID": {},
    "LinkMetadata": {
      "label": [
        1
      ],
      "url": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "LinksMetadata": {
      "primaryLinkLabel": [
        1
      ],
      "primaryLinkUrl": [
        1
      ],
      "secondaryLinks": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "TimelineCalendarEvent": {
      "id": [
        2
      ],
      "title": [
        1
      ],
      "isCanceled": [
        6
      ],
      "isFullDay": [
        6
      ],
      "startsAt": [
        7
      ],
      "endsAt": [
        7
      ],
      "description": [
        1
      ],
      "location": [
        1
      ],
      "conferenceSolution": [
        1
      ],
      "conferenceLink": [
        4
      ],
      "participants": [
        0
      ],
      "visibility": [
        8
      ],
      "__typename": [
        1
      ]
    },
    "Boolean": {},
    "DateTime": {},
    "CalendarChannelVisibility": {},
    "TimelineCalendarEventsWithTotal": {
      "totalNumberOfCalendarEvents": [
        10
      ],
      "timelineCalendarEvents": [
        5
      ],
      "__typename": [
        1
      ]
    },
    "Int": {},
    "TimelineThreadParticipant": {
      "personId": [
        2
      ],
      "workspaceMemberId": [
        2
      ],
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "displayName": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "handle": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "TimelineThread": {
      "id": [
        2
      ],
      "read": [
        6
      ],
      "visibility": [
        14
      ],
      "firstParticipant": [
        11
      ],
      "lastTwoParticipants": [
        11
      ],
      "lastMessageReceivedAt": [
        7
      ],
      "lastMessageBody": [
        1
      ],
      "subject": [
        1
      ],
      "numberOfMessagesInThread": [
        13
      ],
      "participantCount": [
        13
      ],
      "__typename": [
        1
      ]
    },
    "Float": {},
    "MessageChannelVisibility": {},
    "TimelineThreadsWithTotal": {
      "totalNumberOfThreads": [
        10
      ],
      "timelineThreads": [
        12
      ],
      "__typename": [
        1
      ]
    },
    "SearchRecord": {
      "recordId": [
        2
      ],
      "objectNameSingular": [
        1
      ],
      "objectLabelSingular": [
        1
      ],
      "label": [
        1
      ],
      "imageUrl": [
        1
      ],
      "tsRankCD": [
        13
      ],
      "tsRank": [
        13
      ],
      "__typename": [
        1
      ]
    },
    "SearchResultEdge": {
      "node": [
        16
      ],
      "cursor": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "SearchResultPageInfo": {
      "endCursor": [
        1
      ],
      "hasNextPage": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "SearchResultConnection": {
      "edges": [
        17
      ],
      "pageInfo": [
        18
      ],
      "__typename": [
        1
      ]
    },
    "RunWorkflowVersion": {
      "workflowRunId": [
        2
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRun": {
      "id": [
        2
      ],
      "status": [
        23
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "enqueuedAt": [
        7
      ],
      "startedAt": [
        7
      ],
      "endedAt": [
        7
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "state": [
        25
      ],
      "context": [
        25
      ],
      "output": [
        25
      ],
      "position": [
        246
      ],
      "searchVector": [
        247
      ],
      "workflowId": [
        22
      ],
      "workflowVersionId": [
        22
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "workflow": [
        476
      ],
      "workflowVersion": [
        534
      ],
      "__typename": [
        1
      ]
    },
    "ID": {},
    "WorkflowRunStatusEnum": {},
    "WorkflowVersionStepChanges": {
      "triggerDiff": [
        25
      ],
      "stepsDiff": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "JSON": {},
    "TestHttpRequest": {
      "success": [
        6
      ],
      "message": [
        1
      ],
      "result": [
        25
      ],
      "error": [
        25
      ],
      "status": [
        13
      ],
      "statusText": [
        1
      ],
      "headers": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowStepPosition": {
      "x": [
        13
      ],
      "y": [
        13
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAction": {
      "id": [
        2
      ],
      "name": [
        1
      ],
      "type": [
        29
      ],
      "settings": [
        25
      ],
      "valid": [
        6
      ],
      "nextStepIds": [
        2
      ],
      "position": [
        27
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowActionType": {},
    "WorkflowVersionDTO": {
      "id": [
        2
      ],
      "name": [
        1
      ],
      "createdAt": [
        1
      ],
      "updatedAt": [
        1
      ],
      "workflowId": [
        2
      ],
      "status": [
        1
      ],
      "trigger": [
        25
      ],
      "steps": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "Query": {
      "search": [
        19,
        {
          "searchInput": [
            1,
            "String!"
          ],
          "limit": [
            10,
            "Int!"
          ],
          "after": [
            1
          ],
          "includedObjectNameSingulars": [
            1,
            "[String!]"
          ],
          "filter": [
            32
          ],
          "excludedObjectNameSingulars": [
            1,
            "[String!]"
          ]
        }
      ],
      "getTimelineCalendarEventsFromPersonId": [
        9,
        {
          "personId": [
            2,
            "UUID!"
          ],
          "page": [
            10,
            "Int!"
          ],
          "pageSize": [
            10,
            "Int!"
          ]
        }
      ],
      "getTimelineCalendarEventsFromCompanyId": [
        9,
        {
          "companyId": [
            2,
            "UUID!"
          ],
          "page": [
            10,
            "Int!"
          ],
          "pageSize": [
            10,
            "Int!"
          ]
        }
      ],
      "getTimelineCalendarEventsFromOpportunityId": [
        9,
        {
          "opportunityId": [
            2,
            "UUID!"
          ],
          "page": [
            10,
            "Int!"
          ],
          "pageSize": [
            10,
            "Int!"
          ]
        }
      ],
      "getTimelineThreadsFromPersonId": [
        15,
        {
          "personId": [
            2,
            "UUID!"
          ],
          "page": [
            10,
            "Int!"
          ],
          "pageSize": [
            10,
            "Int!"
          ]
        }
      ],
      "getTimelineThreadsFromCompanyId": [
        15,
        {
          "companyId": [
            2,
            "UUID!"
          ],
          "page": [
            10,
            "Int!"
          ],
          "pageSize": [
            10,
            "Int!"
          ]
        }
      ],
      "getTimelineThreadsFromOpportunityId": [
        15,
        {
          "opportunityId": [
            2,
            "UUID!"
          ],
          "page": [
            10,
            "Int!"
          ],
          "pageSize": [
            10,
            "Int!"
          ]
        }
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "attachment": [
        112,
        {
          "filter": [
            126,
            "AttachmentFilterInput!"
          ]
        }
      ],
      "attachmentsGroupBy": [
        119,
        {
          "groupBy": [
            131,
            "[AttachmentGroupByInput!]!"
          ],
          "filter": [
            126
          ],
          "orderBy": [
            129,
            "[AttachmentOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            128,
            "[AttachmentOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "blocklists": [
        134,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            141
          ],
          "orderBy": [
            142,
            "[BlocklistOrderByInput]"
          ]
        }
      ],
      "blocklist": [
        132,
        {
          "filter": [
            141,
            "BlocklistFilterInput!"
          ]
        }
      ],
      "blocklistsGroupBy": [
        135,
        {
          "groupBy": [
            145,
            "[BlocklistGroupByInput!]!"
          ],
          "filter": [
            141
          ],
          "orderBy": [
            143,
            "[BlocklistOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            142,
            "[BlocklistOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "calendarChannelEventAssociations": [
        148,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            155
          ],
          "orderBy": [
            156,
            "[CalendarChannelEventAssociationOrderByInput]"
          ]
        }
      ],
      "calendarChannelEventAssociation": [
        146,
        {
          "filter": [
            155,
            "CalendarChannelEventAssociationFilterInput!"
          ]
        }
      ],
      "calendarChannelEventAssociationsGroupBy": [
        149,
        {
          "groupBy": [
            159,
            "[CalendarChannelEventAssociationGroupByInput!]!"
          ],
          "filter": [
            155
          ],
          "orderBy": [
            157,
            "[CalendarChannelEventAssociationOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            156,
            "[CalendarChannelEventAssociationOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "calendarChannels": [
        166,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            173
          ],
          "orderBy": [
            181,
            "[CalendarChannelOrderByInput]"
          ]
        }
      ],
      "calendarChannel": [
        164,
        {
          "filter": [
            173,
            "CalendarChannelFilterInput!"
          ]
        }
      ],
      "calendarChannelsGroupBy": [
        167,
        {
          "groupBy": [
            184,
            "[CalendarChannelGroupByInput!]!"
          ],
          "filter": [
            173
          ],
          "orderBy": [
            182,
            "[CalendarChannelOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            181,
            "[CalendarChannelOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "calendarEventParticipants": [
        188,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            195
          ],
          "orderBy": [
            197,
            "[CalendarEventParticipantOrderByInput]"
          ]
        }
      ],
      "calendarEventParticipant": [
        186,
        {
          "filter": [
            195,
            "CalendarEventParticipantFilterInput!"
          ]
        }
      ],
      "calendarEventParticipantsGroupBy": [
        189,
        {
          "groupBy": [
            200,
            "[CalendarEventParticipantGroupByInput!]!"
          ],
          "filter": [
            195
          ],
          "orderBy": [
            198,
            "[CalendarEventParticipantOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            197,
            "[CalendarEventParticipantOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "calendarEvents": [
        203,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            210
          ],
          "orderBy": [
            213,
            "[CalendarEventOrderByInput]"
          ]
        }
      ],
      "calendarEvent": [
        201,
        {
          "filter": [
            210,
            "CalendarEventFilterInput!"
          ]
        }
      ],
      "calendarEventsGroupBy": [
        204,
        {
          "groupBy": [
            216,
            "[CalendarEventGroupByInput!]!"
          ],
          "filter": [
            210
          ],
          "orderBy": [
            214,
            "[CalendarEventOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            213,
            "[CalendarEventOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "connectedAccounts": [
        219,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            226
          ],
          "orderBy": [
            241,
            "[ConnectedAccountOrderByInput]"
          ]
        }
      ],
      "connectedAccount": [
        217,
        {
          "filter": [
            226,
            "ConnectedAccountFilterInput!"
          ]
        }
      ],
      "connectedAccountsGroupBy": [
        220,
        {
          "groupBy": [
            244,
            "[ConnectedAccountGroupByInput!]!"
          ],
          "filter": [
            226
          ],
          "orderBy": [
            242,
            "[ConnectedAccountOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            241,
            "[ConnectedAccountOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "dashboards": [
        249,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            256
          ],
          "orderBy": [
            261,
            "[DashboardOrderByInput]"
          ]
        }
      ],
      "dashboard": [
        245,
        {
          "filter": [
            256,
            "DashboardFilterInput!"
          ]
        }
      ],
      "dashboardsGroupBy": [
        250,
        {
          "groupBy": [
            264,
            "[DashboardGroupByInput!]!"
          ],
          "filter": [
            256
          ],
          "orderBy": [
            262,
            "[DashboardOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            261,
            "[DashboardOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "favorite": [
        265,
        {
          "filter": [
            274,
            "FavoriteFilterInput!"
          ]
        }
      ],
      "favoritesGroupBy": [
        268,
        {
          "groupBy": [
            278,
            "[FavoriteGroupByInput!]!"
          ],
          "filter": [
            274
          ],
          "orderBy": [
            276,
            "[FavoriteOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            275,
            "[FavoriteOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "favoriteFolders": [
        281,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            288
          ],
          "orderBy": [
            290,
            "[FavoriteFolderOrderByInput]"
          ]
        }
      ],
      "favoriteFolder": [
        279,
        {
          "filter": [
            288,
            "FavoriteFolderFilterInput!"
          ]
        }
      ],
      "favoriteFoldersGroupBy": [
        282,
        {
          "groupBy": [
            293,
            "[FavoriteFolderGroupByInput!]!"
          ],
          "filter": [
            288
          ],
          "orderBy": [
            291,
            "[FavoriteFolderOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            290,
            "[FavoriteFolderOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "messageChannelMessageAssociations": [
        297,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            304
          ],
          "orderBy": [
            305,
            "[MessageChannelMessageAssociationOrderByInput]"
          ]
        }
      ],
      "messageChannelMessageAssociation": [
        295,
        {
          "filter": [
            304,
            "MessageChannelMessageAssociationFilterInput!"
          ]
        }
      ],
      "messageChannelMessageAssociationsGroupBy": [
        298,
        {
          "groupBy": [
            308,
            "[MessageChannelMessageAssociationGroupByInput!]!"
          ],
          "filter": [
            304
          ],
          "orderBy": [
            306,
            "[MessageChannelMessageAssociationOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            305,
            "[MessageChannelMessageAssociationOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "messageChannels": [
        318,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            325
          ],
          "orderBy": [
            326,
            "[MessageChannelOrderByInput]"
          ]
        }
      ],
      "messageChannel": [
        316,
        {
          "filter": [
            325,
            "MessageChannelFilterInput!"
          ]
        }
      ],
      "messageChannelsGroupBy": [
        319,
        {
          "groupBy": [
            329,
            "[MessageChannelGroupByInput!]!"
          ],
          "filter": [
            325
          ],
          "orderBy": [
            327,
            "[MessageChannelOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            326,
            "[MessageChannelOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "messageFolders": [
        333,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            340
          ],
          "orderBy": [
            341,
            "[MessageFolderOrderByInput]"
          ]
        }
      ],
      "messageFolder": [
        331,
        {
          "filter": [
            340,
            "MessageFolderFilterInput!"
          ]
        }
      ],
      "messageFoldersGroupBy": [
        334,
        {
          "groupBy": [
            344,
            "[MessageFolderGroupByInput!]!"
          ],
          "filter": [
            340
          ],
          "orderBy": [
            342,
            "[MessageFolderOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            341,
            "[MessageFolderOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "messageParticipants": [
        348,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            355
          ],
          "orderBy": [
            357,
            "[MessageParticipantOrderByInput]"
          ]
        }
      ],
      "messageParticipant": [
        346,
        {
          "filter": [
            355,
            "MessageParticipantFilterInput!"
          ]
        }
      ],
      "messageParticipantsGroupBy": [
        349,
        {
          "groupBy": [
            360,
            "[MessageParticipantGroupByInput!]!"
          ],
          "filter": [
            355
          ],
          "orderBy": [
            358,
            "[MessageParticipantOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            357,
            "[MessageParticipantOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "messageThreads": [
        363,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            370
          ],
          "orderBy": [
            376,
            "[MessageThreadOrderByInput]"
          ]
        }
      ],
      "messageThread": [
        361,
        {
          "filter": [
            370,
            "MessageThreadFilterInput!"
          ]
        }
      ],
      "messageThreadsGroupBy": [
        364,
        {
          "groupBy": [
            379,
            "[MessageThreadGroupByInput!]!"
          ],
          "filter": [
            370
          ],
          "orderBy": [
            377,
            "[MessageThreadOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            376,
            "[MessageThreadOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "messages": [
        383,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            390
          ],
          "orderBy": [
            391,
            "[MessageOrderByInput]"
          ]
        }
      ],
      "message": [
        381,
        {
          "filter": [
            390,
            "MessageFilterInput!"
          ]
        }
      ],
      "messagesGroupBy": [
        384,
        {
          "groupBy": [
            394,
            "[MessageGroupByInput!]!"
          ],
          "filter": [
            390
          ],
          "orderBy": [
            392,
            "[MessageOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            391,
            "[MessageOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "notes": [
        397,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            404
          ],
          "orderBy": [
            409,
            "[NoteOrderByInput]"
          ]
        }
      ],
      "note": [
        395,
        {
          "filter": [
            404,
            "NoteFilterInput!"
          ]
        }
      ],
      "notesGroupBy": [
        398,
        {
          "groupBy": [
            412,
            "[NoteGroupByInput!]!"
          ],
          "filter": [
            404
          ],
          "orderBy": [
            410,
            "[NoteOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            409,
            "[NoteOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "noteTargets": [
        415,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            422
          ],
          "orderBy": [
            423,
            "[NoteTargetOrderByInput]"
          ]
        }
      ],
      "noteTarget": [
        413,
        {
          "filter": [
            422,
            "NoteTargetFilterInput!"
          ]
        }
      ],
      "noteTargetsGroupBy": [
        416,
        {
          "groupBy": [
            426,
            "[NoteTargetGroupByInput!]!"
          ],
          "filter": [
            422
          ],
          "orderBy": [
            424,
            "[NoteTargetOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            423,
            "[NoteTargetOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "tasks": [
        430,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            437
          ],
          "orderBy": [
            443,
            "[TaskOrderByInput]"
          ]
        }
      ],
      "task": [
        428,
        {
          "filter": [
            437,
            "TaskFilterInput!"
          ]
        }
      ],
      "tasksGroupBy": [
        431,
        {
          "groupBy": [
            446,
            "[TaskGroupByInput!]!"
          ],
          "filter": [
            437
          ],
          "orderBy": [
            444,
            "[TaskOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            443,
            "[TaskOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "taskTargets": [
        449,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            456
          ],
          "orderBy": [
            457,
            "[TaskTargetOrderByInput]"
          ]
        }
      ],
      "taskTarget": [
        447,
        {
          "filter": [
            456,
            "TaskTargetFilterInput!"
          ]
        }
      ],
      "taskTargetsGroupBy": [
        450,
        {
          "groupBy": [
            460,
            "[TaskTargetGroupByInput!]!"
          ],
          "filter": [
            456
          ],
          "orderBy": [
            458,
            "[TaskTargetOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            457,
            "[TaskTargetOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "timelineActivity": [
        461,
        {
          "filter": [
            470,
            "TimelineActivityFilterInput!"
          ]
        }
      ],
      "timelineActivitiesGroupBy": [
        464,
        {
          "groupBy": [
            474,
            "[TimelineActivityGroupByInput!]!"
          ],
          "filter": [
            470
          ],
          "orderBy": [
            472,
            "[TimelineActivityOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            471,
            "[TimelineActivityOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "workflows": [
        478,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            485
          ],
          "orderBy": [
            501,
            "[WorkflowOrderByInput]"
          ]
        }
      ],
      "workflow": [
        476,
        {
          "filter": [
            485,
            "WorkflowFilterInput!"
          ]
        }
      ],
      "workflowsGroupBy": [
        479,
        {
          "groupBy": [
            504,
            "[WorkflowGroupByInput!]!"
          ],
          "filter": [
            485
          ],
          "orderBy": [
            502,
            "[WorkflowOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            501,
            "[WorkflowOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "workflowAutomatedTriggers": [
        508,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            515
          ],
          "orderBy": [
            516,
            "[WorkflowAutomatedTriggerOrderByInput]"
          ]
        }
      ],
      "workflowAutomatedTrigger": [
        506,
        {
          "filter": [
            515,
            "WorkflowAutomatedTriggerFilterInput!"
          ]
        }
      ],
      "workflowAutomatedTriggersGroupBy": [
        509,
        {
          "groupBy": [
            519,
            "[WorkflowAutomatedTriggerGroupByInput!]!"
          ],
          "filter": [
            515
          ],
          "orderBy": [
            517,
            "[WorkflowAutomatedTriggerOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            516,
            "[WorkflowAutomatedTriggerOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "workflowRuns": [
        521,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            528
          ],
          "orderBy": [
            529,
            "[WorkflowRunOrderByInput]"
          ]
        }
      ],
      "workflowRun": [
        21,
        {
          "filter": [
            528,
            "WorkflowRunFilterInput!"
          ]
        }
      ],
      "workflowRunsGroupBy": [
        522,
        {
          "groupBy": [
            532,
            "[WorkflowRunGroupByInput!]!"
          ],
          "filter": [
            528
          ],
          "orderBy": [
            530,
            "[WorkflowRunOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            529,
            "[WorkflowRunOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "workflowVersions": [
        536,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            543
          ],
          "orderBy": [
            544,
            "[WorkflowVersionOrderByInput]"
          ]
        }
      ],
      "workflowVersion": [
        534,
        {
          "filter": [
            543,
            "WorkflowVersionFilterInput!"
          ]
        }
      ],
      "workflowVersionsGroupBy": [
        537,
        {
          "groupBy": [
            547,
            "[WorkflowVersionGroupByInput!]!"
          ],
          "filter": [
            543
          ],
          "orderBy": [
            545,
            "[WorkflowVersionOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            544,
            "[WorkflowVersionOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "workspaceMembers": [
        553,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            560
          ],
          "orderBy": [
            595,
            "[WorkspaceMemberOrderByInput]"
          ]
        }
      ],
      "workspaceMember": [
        551,
        {
          "filter": [
            560,
            "WorkspaceMemberFilterInput!"
          ]
        }
      ],
      "workspaceMembersGroupBy": [
        554,
        {
          "groupBy": [
            598,
            "[WorkspaceMemberGroupByInput!]!"
          ],
          "filter": [
            560
          ],
          "orderBy": [
            596,
            "[WorkspaceMemberOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            595,
            "[WorkspaceMemberOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "companies": [
        601,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            609
          ],
          "orderBy": [
            610,
            "[CompanyOrderByInput]"
          ]
        }
      ],
      "company": [
        599,
        {
          "filter": [
            609,
            "CompanyFilterInput!"
          ]
        }
      ],
      "companyDuplicates": [
        601,
        {
          "ids": [
            2,
            "[UUID]"
          ],
          "data": [
            607,
            "[CompanyCreateInput]"
          ]
        }
      ],
      "companiesGroupBy": [
        602,
        {
          "groupBy": [
            613,
            "[CompanyGroupByInput!]!"
          ],
          "filter": [
            609
          ],
          "orderBy": [
            611,
            "[CompanyOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            610,
            "[CompanyOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "opportunities": [
        617,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            624
          ],
          "orderBy": [
            625,
            "[OpportunityOrderByInput]"
          ]
        }
      ],
      "opportunity": [
        615,
        {
          "filter": [
            624,
            "OpportunityFilterInput!"
          ]
        }
      ],
      "opportunitiesGroupBy": [
        618,
        {
          "groupBy": [
            628,
            "[OpportunityGroupByInput!]!"
          ],
          "filter": [
            624
          ],
          "orderBy": [
            626,
            "[OpportunityOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            625,
            "[OpportunityOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "people": [
        631,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            639
          ],
          "orderBy": [
            640,
            "[PersonOrderByInput]"
          ]
        }
      ],
      "person": [
        629,
        {
          "filter": [
            639,
            "PersonFilterInput!"
          ]
        }
      ],
      "personDuplicates": [
        631,
        {
          "ids": [
            2,
            "[UUID]"
          ],
          "data": [
            637,
            "[PersonCreateInput]"
          ]
        }
      ],
      "peopleGroupBy": [
        632,
        {
          "groupBy": [
            643,
            "[PersonGroupByInput!]!"
          ],
          "filter": [
            639
          ],
          "orderBy": [
            641,
            "[PersonOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            640,
            "[PersonOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "qaScorecards": [
        649,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            656
          ],
          "orderBy": [
            665,
            "[QaScorecardOrderByInput]"
          ]
        }
      ],
      "qaScorecard": [
        647,
        {
          "filter": [
            656,
            "QaScorecardFilterInput!"
          ]
        }
      ],
      "qaScorecardsGroupBy": [
        650,
        {
          "groupBy": [
            668,
            "[QaScorecardGroupByInput!]!"
          ],
          "filter": [
            656
          ],
          "orderBy": [
            666,
            "[QaScorecardOrderByWithGroupByInput]"
          ],
          "orderByForRecords": [
            665,
            "[QaScorecardOrderByInput]"
          ],
          "viewId": [
            2
          ],
          "limit": [
            10
          ],
          "offsetForRecords": [
            10
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "ObjectRecordFilterInput": {
      "and": [
        32
      ],
      "not": [
        32
      ],
      "or": [
        32
      ],
      "id": [
        33
      ],
      "createdAt": [
        35
      ],
      "updatedAt": [
        35
      ],
      "deletedAt": [
        35
      ],
      "__typename": [
        1
      ]
    },
    "UUIDFilter": {
      "eq": [
        2
      ],
      "gt": [
        2
      ],
      "gte": [
        2
      ],
      "in": [
        2
      ],
      "lt": [
        2
      ],
      "lte": [
        2
      ],
      "neq": [
        2
      ],
      "is": [
        34
      ],
      "__typename": [
        1
      ]
    },
    "FilterIs": {},
    "DateTimeFilter": {
      "eq": [
        7
      ],
      "gt": [
        7
      ],
      "gte": [
        7
      ],
      "in": [
        7
      ],
      "lt": [
        7
      ],
      "lte": [
        7
      ],
      "neq": [
        7
      ],
      "is": [
        34
      ],
      "__typename": [
        1
      ]
    },
    "Mutation": {
      "activateWorkflowVersion": [
        6,
        {
          "workflowVersionId": [
            2,
            "UUID!"
          ]
        }
      ],
      "deactivateWorkflowVersion": [
        6,
        {
          "workflowVersionId": [
            2,
            "UUID!"
          ]
        }
      ],
      "runWorkflowVersion": [
        20,
        {
          "input": [
            37,
            "RunWorkflowVersionInput!"
          ]
        }
      ],
      "stopWorkflowRun": [
        21,
        {
          "workflowRunId": [
            2,
            "UUID!"
          ]
        }
      ],
      "computeStepOutputSchema": [
        25,
        {
          "input": [
            38,
            "ComputeStepOutputSchemaInput!"
          ]
        }
      ],
      "createWorkflowVersionStep": [
        24,
        {
          "input": [
            39,
            "CreateWorkflowVersionStepInput!"
          ]
        }
      ],
      "updateWorkflowVersionStep": [
        28,
        {
          "input": [
            41,
            "UpdateWorkflowVersionStepInput!"
          ]
        }
      ],
      "deleteWorkflowVersionStep": [
        24,
        {
          "input": [
            42,
            "DeleteWorkflowVersionStepInput!"
          ]
        }
      ],
      "submitFormStep": [
        6,
        {
          "input": [
            43,
            "SubmitFormStepInput!"
          ]
        }
      ],
      "updateWorkflowRunStep": [
        28,
        {
          "input": [
            44,
            "UpdateWorkflowRunStepInput!"
          ]
        }
      ],
      "duplicateWorkflowVersionStep": [
        24,
        {
          "input": [
            45,
            "DuplicateWorkflowVersionStepInput!"
          ]
        }
      ],
      "testHttpRequest": [
        26,
        {
          "input": [
            46,
            "TestHttpRequestInput!"
          ]
        }
      ],
      "createWorkflowVersionEdge": [
        24,
        {
          "input": [
            47,
            "CreateWorkflowVersionEdgeInput!"
          ]
        }
      ],
      "deleteWorkflowVersionEdge": [
        24,
        {
          "input": [
            47,
            "CreateWorkflowVersionEdgeInput!"
          ]
        }
      ],
      "createDraftFromWorkflowVersion": [
        30,
        {
          "input": [
            48,
            "CreateDraftFromWorkflowVersionInput!"
          ]
        }
      ],
      "duplicateWorkflow": [
        30,
        {
          "input": [
            49,
            "DuplicateWorkflowInput!"
          ]
        }
      ],
      "updateWorkflowVersionPositions": [
        6,
        {
          "input": [
            50,
            "UpdateWorkflowVersionPositionsInput!"
          ]
        }
      ],
      "dismissReconnectAccountBanner": [
        6,
        {
          "connectedAccountId": [
            2,
            "UUID!"
          ]
        }
      ],
      "createAttachments": [
        112,
        {
          "data": [
            123,
            "[AttachmentCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createAttachment": [
        112,
        {
          "data": [
            123,
            "AttachmentCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateAttachment": [
        112,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            125,
            "AttachmentUpdateInput!"
          ]
        }
      ],
      "deleteAttachment": [
        112,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateAttachments": [
        112,
        {
          "data": [
            125,
            "AttachmentUpdateInput!"
          ],
          "filter": [
            126,
            "AttachmentFilterInput!"
          ]
        }
      ],
      "deleteAttachments": [
        112,
        {
          "filter": [
            126,
            "AttachmentFilterInput!"
          ]
        }
      ],
      "destroyAttachment": [
        112,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyAttachments": [
        112,
        {
          "filter": [
            126,
            "AttachmentFilterInput!"
          ]
        }
      ],
      "restoreAttachment": [
        112,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreAttachments": [
        112,
        {
          "filter": [
            126,
            "AttachmentFilterInput!"
          ]
        }
      ],
      "createBlocklists": [
        132,
        {
          "data": [
            139,
            "[BlocklistCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createBlocklist": [
        132,
        {
          "data": [
            139,
            "BlocklistCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateBlocklist": [
        132,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            140,
            "BlocklistUpdateInput!"
          ]
        }
      ],
      "deleteBlocklist": [
        132,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateBlocklists": [
        132,
        {
          "data": [
            140,
            "BlocklistUpdateInput!"
          ],
          "filter": [
            141,
            "BlocklistFilterInput!"
          ]
        }
      ],
      "deleteBlocklists": [
        132,
        {
          "filter": [
            141,
            "BlocklistFilterInput!"
          ]
        }
      ],
      "destroyBlocklist": [
        132,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyBlocklists": [
        132,
        {
          "filter": [
            141,
            "BlocklistFilterInput!"
          ]
        }
      ],
      "restoreBlocklist": [
        132,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreBlocklists": [
        132,
        {
          "filter": [
            141,
            "BlocklistFilterInput!"
          ]
        }
      ],
      "createCalendarChannelEventAssociations": [
        146,
        {
          "data": [
            153,
            "[CalendarChannelEventAssociationCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createCalendarChannelEventAssociation": [
        146,
        {
          "data": [
            153,
            "CalendarChannelEventAssociationCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateCalendarChannelEventAssociation": [
        146,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            154,
            "CalendarChannelEventAssociationUpdateInput!"
          ]
        }
      ],
      "deleteCalendarChannelEventAssociation": [
        146,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateCalendarChannelEventAssociations": [
        146,
        {
          "data": [
            154,
            "CalendarChannelEventAssociationUpdateInput!"
          ],
          "filter": [
            155,
            "CalendarChannelEventAssociationFilterInput!"
          ]
        }
      ],
      "deleteCalendarChannelEventAssociations": [
        146,
        {
          "filter": [
            155,
            "CalendarChannelEventAssociationFilterInput!"
          ]
        }
      ],
      "destroyCalendarChannelEventAssociation": [
        146,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyCalendarChannelEventAssociations": [
        146,
        {
          "filter": [
            155,
            "CalendarChannelEventAssociationFilterInput!"
          ]
        }
      ],
      "restoreCalendarChannelEventAssociation": [
        146,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreCalendarChannelEventAssociations": [
        146,
        {
          "filter": [
            155,
            "CalendarChannelEventAssociationFilterInput!"
          ]
        }
      ],
      "createCalendarChannels": [
        164,
        {
          "data": [
            171,
            "[CalendarChannelCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createCalendarChannel": [
        164,
        {
          "data": [
            171,
            "CalendarChannelCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateCalendarChannel": [
        164,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            172,
            "CalendarChannelUpdateInput!"
          ]
        }
      ],
      "deleteCalendarChannel": [
        164,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateCalendarChannels": [
        164,
        {
          "data": [
            172,
            "CalendarChannelUpdateInput!"
          ],
          "filter": [
            173,
            "CalendarChannelFilterInput!"
          ]
        }
      ],
      "deleteCalendarChannels": [
        164,
        {
          "filter": [
            173,
            "CalendarChannelFilterInput!"
          ]
        }
      ],
      "destroyCalendarChannel": [
        164,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyCalendarChannels": [
        164,
        {
          "filter": [
            173,
            "CalendarChannelFilterInput!"
          ]
        }
      ],
      "restoreCalendarChannel": [
        164,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreCalendarChannels": [
        164,
        {
          "filter": [
            173,
            "CalendarChannelFilterInput!"
          ]
        }
      ],
      "createCalendarEventParticipants": [
        186,
        {
          "data": [
            193,
            "[CalendarEventParticipantCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createCalendarEventParticipant": [
        186,
        {
          "data": [
            193,
            "CalendarEventParticipantCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateCalendarEventParticipant": [
        186,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            194,
            "CalendarEventParticipantUpdateInput!"
          ]
        }
      ],
      "deleteCalendarEventParticipant": [
        186,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateCalendarEventParticipants": [
        186,
        {
          "data": [
            194,
            "CalendarEventParticipantUpdateInput!"
          ],
          "filter": [
            195,
            "CalendarEventParticipantFilterInput!"
          ]
        }
      ],
      "deleteCalendarEventParticipants": [
        186,
        {
          "filter": [
            195,
            "CalendarEventParticipantFilterInput!"
          ]
        }
      ],
      "destroyCalendarEventParticipant": [
        186,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyCalendarEventParticipants": [
        186,
        {
          "filter": [
            195,
            "CalendarEventParticipantFilterInput!"
          ]
        }
      ],
      "restoreCalendarEventParticipant": [
        186,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreCalendarEventParticipants": [
        186,
        {
          "filter": [
            195,
            "CalendarEventParticipantFilterInput!"
          ]
        }
      ],
      "createCalendarEvents": [
        201,
        {
          "data": [
            208,
            "[CalendarEventCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createCalendarEvent": [
        201,
        {
          "data": [
            208,
            "CalendarEventCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateCalendarEvent": [
        201,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            209,
            "CalendarEventUpdateInput!"
          ]
        }
      ],
      "deleteCalendarEvent": [
        201,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateCalendarEvents": [
        201,
        {
          "data": [
            209,
            "CalendarEventUpdateInput!"
          ],
          "filter": [
            210,
            "CalendarEventFilterInput!"
          ]
        }
      ],
      "deleteCalendarEvents": [
        201,
        {
          "filter": [
            210,
            "CalendarEventFilterInput!"
          ]
        }
      ],
      "destroyCalendarEvent": [
        201,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyCalendarEvents": [
        201,
        {
          "filter": [
            210,
            "CalendarEventFilterInput!"
          ]
        }
      ],
      "restoreCalendarEvent": [
        201,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreCalendarEvents": [
        201,
        {
          "filter": [
            210,
            "CalendarEventFilterInput!"
          ]
        }
      ],
      "createConnectedAccounts": [
        217,
        {
          "data": [
            224,
            "[ConnectedAccountCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createConnectedAccount": [
        217,
        {
          "data": [
            224,
            "ConnectedAccountCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateConnectedAccount": [
        217,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            225,
            "ConnectedAccountUpdateInput!"
          ]
        }
      ],
      "deleteConnectedAccount": [
        217,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateConnectedAccounts": [
        217,
        {
          "data": [
            225,
            "ConnectedAccountUpdateInput!"
          ],
          "filter": [
            226,
            "ConnectedAccountFilterInput!"
          ]
        }
      ],
      "deleteConnectedAccounts": [
        217,
        {
          "filter": [
            226,
            "ConnectedAccountFilterInput!"
          ]
        }
      ],
      "destroyConnectedAccount": [
        217,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyConnectedAccounts": [
        217,
        {
          "filter": [
            226,
            "ConnectedAccountFilterInput!"
          ]
        }
      ],
      "restoreConnectedAccount": [
        217,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreConnectedAccounts": [
        217,
        {
          "filter": [
            226,
            "ConnectedAccountFilterInput!"
          ]
        }
      ],
      "createDashboards": [
        245,
        {
          "data": [
            254,
            "[DashboardCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createDashboard": [
        245,
        {
          "data": [
            254,
            "DashboardCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateDashboard": [
        245,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            255,
            "DashboardUpdateInput!"
          ]
        }
      ],
      "deleteDashboard": [
        245,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateDashboards": [
        245,
        {
          "data": [
            255,
            "DashboardUpdateInput!"
          ],
          "filter": [
            256,
            "DashboardFilterInput!"
          ]
        }
      ],
      "deleteDashboards": [
        245,
        {
          "filter": [
            256,
            "DashboardFilterInput!"
          ]
        }
      ],
      "destroyDashboard": [
        245,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyDashboards": [
        245,
        {
          "filter": [
            256,
            "DashboardFilterInput!"
          ]
        }
      ],
      "restoreDashboard": [
        245,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreDashboards": [
        245,
        {
          "filter": [
            256,
            "DashboardFilterInput!"
          ]
        }
      ],
      "createFavorites": [
        265,
        {
          "data": [
            272,
            "[FavoriteCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createFavorite": [
        265,
        {
          "data": [
            272,
            "FavoriteCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateFavorite": [
        265,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            273,
            "FavoriteUpdateInput!"
          ]
        }
      ],
      "deleteFavorite": [
        265,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateFavorites": [
        265,
        {
          "data": [
            273,
            "FavoriteUpdateInput!"
          ],
          "filter": [
            274,
            "FavoriteFilterInput!"
          ]
        }
      ],
      "deleteFavorites": [
        265,
        {
          "filter": [
            274,
            "FavoriteFilterInput!"
          ]
        }
      ],
      "destroyFavorite": [
        265,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyFavorites": [
        265,
        {
          "filter": [
            274,
            "FavoriteFilterInput!"
          ]
        }
      ],
      "restoreFavorite": [
        265,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreFavorites": [
        265,
        {
          "filter": [
            274,
            "FavoriteFilterInput!"
          ]
        }
      ],
      "createFavoriteFolders": [
        279,
        {
          "data": [
            286,
            "[FavoriteFolderCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createFavoriteFolder": [
        279,
        {
          "data": [
            286,
            "FavoriteFolderCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateFavoriteFolder": [
        279,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            287,
            "FavoriteFolderUpdateInput!"
          ]
        }
      ],
      "deleteFavoriteFolder": [
        279,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateFavoriteFolders": [
        279,
        {
          "data": [
            287,
            "FavoriteFolderUpdateInput!"
          ],
          "filter": [
            288,
            "FavoriteFolderFilterInput!"
          ]
        }
      ],
      "deleteFavoriteFolders": [
        279,
        {
          "filter": [
            288,
            "FavoriteFolderFilterInput!"
          ]
        }
      ],
      "destroyFavoriteFolder": [
        279,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyFavoriteFolders": [
        279,
        {
          "filter": [
            288,
            "FavoriteFolderFilterInput!"
          ]
        }
      ],
      "restoreFavoriteFolder": [
        279,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreFavoriteFolders": [
        279,
        {
          "filter": [
            288,
            "FavoriteFolderFilterInput!"
          ]
        }
      ],
      "createMessageChannelMessageAssociations": [
        295,
        {
          "data": [
            302,
            "[MessageChannelMessageAssociationCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createMessageChannelMessageAssociation": [
        295,
        {
          "data": [
            302,
            "MessageChannelMessageAssociationCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateMessageChannelMessageAssociation": [
        295,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            303,
            "MessageChannelMessageAssociationUpdateInput!"
          ]
        }
      ],
      "deleteMessageChannelMessageAssociation": [
        295,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateMessageChannelMessageAssociations": [
        295,
        {
          "data": [
            303,
            "MessageChannelMessageAssociationUpdateInput!"
          ],
          "filter": [
            304,
            "MessageChannelMessageAssociationFilterInput!"
          ]
        }
      ],
      "deleteMessageChannelMessageAssociations": [
        295,
        {
          "filter": [
            304,
            "MessageChannelMessageAssociationFilterInput!"
          ]
        }
      ],
      "destroyMessageChannelMessageAssociation": [
        295,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyMessageChannelMessageAssociations": [
        295,
        {
          "filter": [
            304,
            "MessageChannelMessageAssociationFilterInput!"
          ]
        }
      ],
      "restoreMessageChannelMessageAssociation": [
        295,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreMessageChannelMessageAssociations": [
        295,
        {
          "filter": [
            304,
            "MessageChannelMessageAssociationFilterInput!"
          ]
        }
      ],
      "createMessageChannels": [
        316,
        {
          "data": [
            323,
            "[MessageChannelCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createMessageChannel": [
        316,
        {
          "data": [
            323,
            "MessageChannelCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateMessageChannel": [
        316,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            324,
            "MessageChannelUpdateInput!"
          ]
        }
      ],
      "deleteMessageChannel": [
        316,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateMessageChannels": [
        316,
        {
          "data": [
            324,
            "MessageChannelUpdateInput!"
          ],
          "filter": [
            325,
            "MessageChannelFilterInput!"
          ]
        }
      ],
      "deleteMessageChannels": [
        316,
        {
          "filter": [
            325,
            "MessageChannelFilterInput!"
          ]
        }
      ],
      "destroyMessageChannel": [
        316,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyMessageChannels": [
        316,
        {
          "filter": [
            325,
            "MessageChannelFilterInput!"
          ]
        }
      ],
      "restoreMessageChannel": [
        316,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreMessageChannels": [
        316,
        {
          "filter": [
            325,
            "MessageChannelFilterInput!"
          ]
        }
      ],
      "createMessageFolders": [
        331,
        {
          "data": [
            338,
            "[MessageFolderCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createMessageFolder": [
        331,
        {
          "data": [
            338,
            "MessageFolderCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateMessageFolder": [
        331,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            339,
            "MessageFolderUpdateInput!"
          ]
        }
      ],
      "deleteMessageFolder": [
        331,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateMessageFolders": [
        331,
        {
          "data": [
            339,
            "MessageFolderUpdateInput!"
          ],
          "filter": [
            340,
            "MessageFolderFilterInput!"
          ]
        }
      ],
      "deleteMessageFolders": [
        331,
        {
          "filter": [
            340,
            "MessageFolderFilterInput!"
          ]
        }
      ],
      "destroyMessageFolder": [
        331,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyMessageFolders": [
        331,
        {
          "filter": [
            340,
            "MessageFolderFilterInput!"
          ]
        }
      ],
      "restoreMessageFolder": [
        331,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreMessageFolders": [
        331,
        {
          "filter": [
            340,
            "MessageFolderFilterInput!"
          ]
        }
      ],
      "createMessageParticipants": [
        346,
        {
          "data": [
            353,
            "[MessageParticipantCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createMessageParticipant": [
        346,
        {
          "data": [
            353,
            "MessageParticipantCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateMessageParticipant": [
        346,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            354,
            "MessageParticipantUpdateInput!"
          ]
        }
      ],
      "deleteMessageParticipant": [
        346,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateMessageParticipants": [
        346,
        {
          "data": [
            354,
            "MessageParticipantUpdateInput!"
          ],
          "filter": [
            355,
            "MessageParticipantFilterInput!"
          ]
        }
      ],
      "deleteMessageParticipants": [
        346,
        {
          "filter": [
            355,
            "MessageParticipantFilterInput!"
          ]
        }
      ],
      "destroyMessageParticipant": [
        346,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyMessageParticipants": [
        346,
        {
          "filter": [
            355,
            "MessageParticipantFilterInput!"
          ]
        }
      ],
      "restoreMessageParticipant": [
        346,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreMessageParticipants": [
        346,
        {
          "filter": [
            355,
            "MessageParticipantFilterInput!"
          ]
        }
      ],
      "createMessageThreads": [
        361,
        {
          "data": [
            368,
            "[MessageThreadCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createMessageThread": [
        361,
        {
          "data": [
            368,
            "MessageThreadCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateMessageThread": [
        361,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            369,
            "MessageThreadUpdateInput!"
          ]
        }
      ],
      "deleteMessageThread": [
        361,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateMessageThreads": [
        361,
        {
          "data": [
            369,
            "MessageThreadUpdateInput!"
          ],
          "filter": [
            370,
            "MessageThreadFilterInput!"
          ]
        }
      ],
      "deleteMessageThreads": [
        361,
        {
          "filter": [
            370,
            "MessageThreadFilterInput!"
          ]
        }
      ],
      "destroyMessageThread": [
        361,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyMessageThreads": [
        361,
        {
          "filter": [
            370,
            "MessageThreadFilterInput!"
          ]
        }
      ],
      "restoreMessageThread": [
        361,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreMessageThreads": [
        361,
        {
          "filter": [
            370,
            "MessageThreadFilterInput!"
          ]
        }
      ],
      "createMessages": [
        381,
        {
          "data": [
            388,
            "[MessageCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createMessage": [
        381,
        {
          "data": [
            388,
            "MessageCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateMessage": [
        381,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            389,
            "MessageUpdateInput!"
          ]
        }
      ],
      "deleteMessage": [
        381,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateMessages": [
        381,
        {
          "data": [
            389,
            "MessageUpdateInput!"
          ],
          "filter": [
            390,
            "MessageFilterInput!"
          ]
        }
      ],
      "deleteMessages": [
        381,
        {
          "filter": [
            390,
            "MessageFilterInput!"
          ]
        }
      ],
      "destroyMessage": [
        381,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyMessages": [
        381,
        {
          "filter": [
            390,
            "MessageFilterInput!"
          ]
        }
      ],
      "restoreMessage": [
        381,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreMessages": [
        381,
        {
          "filter": [
            390,
            "MessageFilterInput!"
          ]
        }
      ],
      "createNotes": [
        395,
        {
          "data": [
            402,
            "[NoteCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createNote": [
        395,
        {
          "data": [
            402,
            "NoteCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateNote": [
        395,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            403,
            "NoteUpdateInput!"
          ]
        }
      ],
      "deleteNote": [
        395,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateNotes": [
        395,
        {
          "data": [
            403,
            "NoteUpdateInput!"
          ],
          "filter": [
            404,
            "NoteFilterInput!"
          ]
        }
      ],
      "deleteNotes": [
        395,
        {
          "filter": [
            404,
            "NoteFilterInput!"
          ]
        }
      ],
      "destroyNote": [
        395,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyNotes": [
        395,
        {
          "filter": [
            404,
            "NoteFilterInput!"
          ]
        }
      ],
      "restoreNote": [
        395,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreNotes": [
        395,
        {
          "filter": [
            404,
            "NoteFilterInput!"
          ]
        }
      ],
      "createNoteTargets": [
        413,
        {
          "data": [
            420,
            "[NoteTargetCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createNoteTarget": [
        413,
        {
          "data": [
            420,
            "NoteTargetCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateNoteTarget": [
        413,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            421,
            "NoteTargetUpdateInput!"
          ]
        }
      ],
      "deleteNoteTarget": [
        413,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateNoteTargets": [
        413,
        {
          "data": [
            421,
            "NoteTargetUpdateInput!"
          ],
          "filter": [
            422,
            "NoteTargetFilterInput!"
          ]
        }
      ],
      "deleteNoteTargets": [
        413,
        {
          "filter": [
            422,
            "NoteTargetFilterInput!"
          ]
        }
      ],
      "destroyNoteTarget": [
        413,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyNoteTargets": [
        413,
        {
          "filter": [
            422,
            "NoteTargetFilterInput!"
          ]
        }
      ],
      "restoreNoteTarget": [
        413,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreNoteTargets": [
        413,
        {
          "filter": [
            422,
            "NoteTargetFilterInput!"
          ]
        }
      ],
      "createTasks": [
        428,
        {
          "data": [
            435,
            "[TaskCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createTask": [
        428,
        {
          "data": [
            435,
            "TaskCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateTask": [
        428,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            436,
            "TaskUpdateInput!"
          ]
        }
      ],
      "deleteTask": [
        428,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateTasks": [
        428,
        {
          "data": [
            436,
            "TaskUpdateInput!"
          ],
          "filter": [
            437,
            "TaskFilterInput!"
          ]
        }
      ],
      "deleteTasks": [
        428,
        {
          "filter": [
            437,
            "TaskFilterInput!"
          ]
        }
      ],
      "destroyTask": [
        428,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyTasks": [
        428,
        {
          "filter": [
            437,
            "TaskFilterInput!"
          ]
        }
      ],
      "restoreTask": [
        428,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreTasks": [
        428,
        {
          "filter": [
            437,
            "TaskFilterInput!"
          ]
        }
      ],
      "createTaskTargets": [
        447,
        {
          "data": [
            454,
            "[TaskTargetCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createTaskTarget": [
        447,
        {
          "data": [
            454,
            "TaskTargetCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateTaskTarget": [
        447,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            455,
            "TaskTargetUpdateInput!"
          ]
        }
      ],
      "deleteTaskTarget": [
        447,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateTaskTargets": [
        447,
        {
          "data": [
            455,
            "TaskTargetUpdateInput!"
          ],
          "filter": [
            456,
            "TaskTargetFilterInput!"
          ]
        }
      ],
      "deleteTaskTargets": [
        447,
        {
          "filter": [
            456,
            "TaskTargetFilterInput!"
          ]
        }
      ],
      "destroyTaskTarget": [
        447,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyTaskTargets": [
        447,
        {
          "filter": [
            456,
            "TaskTargetFilterInput!"
          ]
        }
      ],
      "restoreTaskTarget": [
        447,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreTaskTargets": [
        447,
        {
          "filter": [
            456,
            "TaskTargetFilterInput!"
          ]
        }
      ],
      "createTimelineActivities": [
        461,
        {
          "data": [
            468,
            "[TimelineActivityCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createTimelineActivity": [
        461,
        {
          "data": [
            468,
            "TimelineActivityCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateTimelineActivity": [
        461,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            469,
            "TimelineActivityUpdateInput!"
          ]
        }
      ],
      "deleteTimelineActivity": [
        461,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateTimelineActivities": [
        461,
        {
          "data": [
            469,
            "TimelineActivityUpdateInput!"
          ],
          "filter": [
            470,
            "TimelineActivityFilterInput!"
          ]
        }
      ],
      "deleteTimelineActivities": [
        461,
        {
          "filter": [
            470,
            "TimelineActivityFilterInput!"
          ]
        }
      ],
      "destroyTimelineActivity": [
        461,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyTimelineActivities": [
        461,
        {
          "filter": [
            470,
            "TimelineActivityFilterInput!"
          ]
        }
      ],
      "restoreTimelineActivity": [
        461,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreTimelineActivities": [
        461,
        {
          "filter": [
            470,
            "TimelineActivityFilterInput!"
          ]
        }
      ],
      "createWorkflows": [
        476,
        {
          "data": [
            483,
            "[WorkflowCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createWorkflow": [
        476,
        {
          "data": [
            483,
            "WorkflowCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateWorkflow": [
        476,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            484,
            "WorkflowUpdateInput!"
          ]
        }
      ],
      "deleteWorkflow": [
        476,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateWorkflows": [
        476,
        {
          "data": [
            484,
            "WorkflowUpdateInput!"
          ],
          "filter": [
            485,
            "WorkflowFilterInput!"
          ]
        }
      ],
      "deleteWorkflows": [
        476,
        {
          "filter": [
            485,
            "WorkflowFilterInput!"
          ]
        }
      ],
      "destroyWorkflow": [
        476,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyWorkflows": [
        476,
        {
          "filter": [
            485,
            "WorkflowFilterInput!"
          ]
        }
      ],
      "restoreWorkflow": [
        476,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreWorkflows": [
        476,
        {
          "filter": [
            485,
            "WorkflowFilterInput!"
          ]
        }
      ],
      "createWorkflowAutomatedTriggers": [
        506,
        {
          "data": [
            513,
            "[WorkflowAutomatedTriggerCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createWorkflowAutomatedTrigger": [
        506,
        {
          "data": [
            513,
            "WorkflowAutomatedTriggerCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateWorkflowAutomatedTrigger": [
        506,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            514,
            "WorkflowAutomatedTriggerUpdateInput!"
          ]
        }
      ],
      "deleteWorkflowAutomatedTrigger": [
        506,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateWorkflowAutomatedTriggers": [
        506,
        {
          "data": [
            514,
            "WorkflowAutomatedTriggerUpdateInput!"
          ],
          "filter": [
            515,
            "WorkflowAutomatedTriggerFilterInput!"
          ]
        }
      ],
      "deleteWorkflowAutomatedTriggers": [
        506,
        {
          "filter": [
            515,
            "WorkflowAutomatedTriggerFilterInput!"
          ]
        }
      ],
      "destroyWorkflowAutomatedTrigger": [
        506,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyWorkflowAutomatedTriggers": [
        506,
        {
          "filter": [
            515,
            "WorkflowAutomatedTriggerFilterInput!"
          ]
        }
      ],
      "restoreWorkflowAutomatedTrigger": [
        506,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreWorkflowAutomatedTriggers": [
        506,
        {
          "filter": [
            515,
            "WorkflowAutomatedTriggerFilterInput!"
          ]
        }
      ],
      "createWorkflowRuns": [
        21,
        {
          "data": [
            526,
            "[WorkflowRunCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createWorkflowRun": [
        21,
        {
          "data": [
            526,
            "WorkflowRunCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateWorkflowRun": [
        21,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            527,
            "WorkflowRunUpdateInput!"
          ]
        }
      ],
      "deleteWorkflowRun": [
        21,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateWorkflowRuns": [
        21,
        {
          "data": [
            527,
            "WorkflowRunUpdateInput!"
          ],
          "filter": [
            528,
            "WorkflowRunFilterInput!"
          ]
        }
      ],
      "deleteWorkflowRuns": [
        21,
        {
          "filter": [
            528,
            "WorkflowRunFilterInput!"
          ]
        }
      ],
      "destroyWorkflowRun": [
        21,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyWorkflowRuns": [
        21,
        {
          "filter": [
            528,
            "WorkflowRunFilterInput!"
          ]
        }
      ],
      "restoreWorkflowRun": [
        21,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreWorkflowRuns": [
        21,
        {
          "filter": [
            528,
            "WorkflowRunFilterInput!"
          ]
        }
      ],
      "createWorkflowVersions": [
        534,
        {
          "data": [
            541,
            "[WorkflowVersionCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createWorkflowVersion": [
        534,
        {
          "data": [
            541,
            "WorkflowVersionCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateWorkflowVersion": [
        534,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            542,
            "WorkflowVersionUpdateInput!"
          ]
        }
      ],
      "deleteWorkflowVersion": [
        534,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateWorkflowVersions": [
        534,
        {
          "data": [
            542,
            "WorkflowVersionUpdateInput!"
          ],
          "filter": [
            543,
            "WorkflowVersionFilterInput!"
          ]
        }
      ],
      "deleteWorkflowVersions": [
        534,
        {
          "filter": [
            543,
            "WorkflowVersionFilterInput!"
          ]
        }
      ],
      "destroyWorkflowVersion": [
        534,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyWorkflowVersions": [
        534,
        {
          "filter": [
            543,
            "WorkflowVersionFilterInput!"
          ]
        }
      ],
      "restoreWorkflowVersion": [
        534,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreWorkflowVersions": [
        534,
        {
          "filter": [
            543,
            "WorkflowVersionFilterInput!"
          ]
        }
      ],
      "createWorkspaceMembers": [
        551,
        {
          "data": [
            558,
            "[WorkspaceMemberCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createWorkspaceMember": [
        551,
        {
          "data": [
            558,
            "WorkspaceMemberCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateWorkspaceMember": [
        551,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            559,
            "WorkspaceMemberUpdateInput!"
          ]
        }
      ],
      "deleteWorkspaceMember": [
        551,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateWorkspaceMembers": [
        551,
        {
          "data": [
            559,
            "WorkspaceMemberUpdateInput!"
          ],
          "filter": [
            560,
            "WorkspaceMemberFilterInput!"
          ]
        }
      ],
      "deleteWorkspaceMembers": [
        551,
        {
          "filter": [
            560,
            "WorkspaceMemberFilterInput!"
          ]
        }
      ],
      "destroyWorkspaceMember": [
        551,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyWorkspaceMembers": [
        551,
        {
          "filter": [
            560,
            "WorkspaceMemberFilterInput!"
          ]
        }
      ],
      "restoreWorkspaceMember": [
        551,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreWorkspaceMembers": [
        551,
        {
          "filter": [
            560,
            "WorkspaceMemberFilterInput!"
          ]
        }
      ],
      "createCompanies": [
        599,
        {
          "data": [
            607,
            "[CompanyCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createCompany": [
        599,
        {
          "data": [
            607,
            "CompanyCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateCompany": [
        599,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            608,
            "CompanyUpdateInput!"
          ]
        }
      ],
      "deleteCompany": [
        599,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateCompanies": [
        599,
        {
          "data": [
            608,
            "CompanyUpdateInput!"
          ],
          "filter": [
            609,
            "CompanyFilterInput!"
          ]
        }
      ],
      "deleteCompanies": [
        599,
        {
          "filter": [
            609,
            "CompanyFilterInput!"
          ]
        }
      ],
      "destroyCompany": [
        599,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyCompanies": [
        599,
        {
          "filter": [
            609,
            "CompanyFilterInput!"
          ]
        }
      ],
      "restoreCompany": [
        599,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreCompanies": [
        599,
        {
          "filter": [
            609,
            "CompanyFilterInput!"
          ]
        }
      ],
      "mergeCompanies": [
        599,
        {
          "ids": [
            2,
            "[UUID!]!"
          ],
          "conflictPriorityIndex": [
            10,
            "Int!"
          ],
          "dryRun": [
            6
          ]
        }
      ],
      "createOpportunities": [
        615,
        {
          "data": [
            622,
            "[OpportunityCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createOpportunity": [
        615,
        {
          "data": [
            622,
            "OpportunityCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateOpportunity": [
        615,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            623,
            "OpportunityUpdateInput!"
          ]
        }
      ],
      "deleteOpportunity": [
        615,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateOpportunities": [
        615,
        {
          "data": [
            623,
            "OpportunityUpdateInput!"
          ],
          "filter": [
            624,
            "OpportunityFilterInput!"
          ]
        }
      ],
      "deleteOpportunities": [
        615,
        {
          "filter": [
            624,
            "OpportunityFilterInput!"
          ]
        }
      ],
      "destroyOpportunity": [
        615,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyOpportunities": [
        615,
        {
          "filter": [
            624,
            "OpportunityFilterInput!"
          ]
        }
      ],
      "restoreOpportunity": [
        615,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreOpportunities": [
        615,
        {
          "filter": [
            624,
            "OpportunityFilterInput!"
          ]
        }
      ],
      "createPeople": [
        629,
        {
          "data": [
            637,
            "[PersonCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createPerson": [
        629,
        {
          "data": [
            637,
            "PersonCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updatePerson": [
        629,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            638,
            "PersonUpdateInput!"
          ]
        }
      ],
      "deletePerson": [
        629,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updatePeople": [
        629,
        {
          "data": [
            638,
            "PersonUpdateInput!"
          ],
          "filter": [
            639,
            "PersonFilterInput!"
          ]
        }
      ],
      "deletePeople": [
        629,
        {
          "filter": [
            639,
            "PersonFilterInput!"
          ]
        }
      ],
      "destroyPerson": [
        629,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyPeople": [
        629,
        {
          "filter": [
            639,
            "PersonFilterInput!"
          ]
        }
      ],
      "restorePerson": [
        629,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restorePeople": [
        629,
        {
          "filter": [
            639,
            "PersonFilterInput!"
          ]
        }
      ],
      "mergePeople": [
        629,
        {
          "ids": [
            2,
            "[UUID!]!"
          ],
          "conflictPriorityIndex": [
            10,
            "Int!"
          ],
          "dryRun": [
            6
          ]
        }
      ],
      "createQaScorecards": [
        647,
        {
          "data": [
            654,
            "[QaScorecardCreateInput!]!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "createQaScorecard": [
        647,
        {
          "data": [
            654,
            "QaScorecardCreateInput!"
          ],
          "upsert": [
            6
          ]
        }
      ],
      "updateQaScorecard": [
        647,
        {
          "id": [
            2,
            "UUID!"
          ],
          "data": [
            655,
            "QaScorecardUpdateInput!"
          ]
        }
      ],
      "deleteQaScorecard": [
        647,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "updateQaScorecards": [
        647,
        {
          "data": [
            655,
            "QaScorecardUpdateInput!"
          ],
          "filter": [
            656,
            "QaScorecardFilterInput!"
          ]
        }
      ],
      "deleteQaScorecards": [
        647,
        {
          "filter": [
            656,
            "QaScorecardFilterInput!"
          ]
        }
      ],
      "destroyQaScorecard": [
        647,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "destroyQaScorecards": [
        647,
        {
          "filter": [
            656,
            "QaScorecardFilterInput!"
          ]
        }
      ],
      "restoreQaScorecard": [
        647,
        {
          "id": [
            2,
            "UUID!"
          ]
        }
      ],
      "restoreQaScorecards": [
        647,
        {
          "filter": [
            656,
            "QaScorecardFilterInput!"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "RunWorkflowVersionInput": {
      "workflowVersionId": [
        2
      ],
      "workflowRunId": [
        2
      ],
      "payload": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "ComputeStepOutputSchemaInput": {
      "step": [
        25
      ],
      "workflowVersionId": [
        2
      ],
      "__typename": [
        1
      ]
    },
    "CreateWorkflowVersionStepInput": {
      "workflowVersionId": [
        2
      ],
      "stepType": [
        1
      ],
      "parentStepId": [
        1
      ],
      "parentStepConnectionOptions": [
        25
      ],
      "nextStepId": [
        2
      ],
      "position": [
        40
      ],
      "id": [
        1
      ],
      "defaultSettings": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowStepPositionInput": {
      "x": [
        13
      ],
      "y": [
        13
      ],
      "__typename": [
        1
      ]
    },
    "UpdateWorkflowVersionStepInput": {
      "workflowVersionId": [
        2
      ],
      "step": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "DeleteWorkflowVersionStepInput": {
      "workflowVersionId": [
        2
      ],
      "stepId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "SubmitFormStepInput": {
      "stepId": [
        2
      ],
      "workflowRunId": [
        2
      ],
      "response": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "UpdateWorkflowRunStepInput": {
      "workflowRunId": [
        2
      ],
      "step": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "DuplicateWorkflowVersionStepInput": {
      "stepId": [
        1
      ],
      "workflowVersionId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "TestHttpRequestInput": {
      "url": [
        1
      ],
      "method": [
        1
      ],
      "headers": [
        25
      ],
      "body": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "CreateWorkflowVersionEdgeInput": {
      "workflowVersionId": [
        1
      ],
      "source": [
        1
      ],
      "target": [
        1
      ],
      "sourceConnectionOptions": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "CreateDraftFromWorkflowVersionInput": {
      "workflowId": [
        2
      ],
      "workflowVersionIdToCopy": [
        2
      ],
      "__typename": [
        1
      ]
    },
    "DuplicateWorkflowInput": {
      "workflowIdToDuplicate": [
        2
      ],
      "workflowVersionIdToCopy": [
        2
      ],
      "__typename": [
        1
      ]
    },
    "UpdateWorkflowVersionPositionsInput": {
      "workflowVersionId": [
        2
      ],
      "positions": [
        51
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowStepPositionUpdateInput": {
      "id": [
        1
      ],
      "position": [
        40
      ],
      "__typename": [
        1
      ]
    },
    "Links": {
      "primaryLinkLabel": [
        1
      ],
      "primaryLinkUrl": [
        1
      ],
      "secondaryLinks": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "LinksCreateInput": {
      "primaryLinkLabel": [
        1
      ],
      "primaryLinkUrl": [
        1
      ],
      "secondaryLinks": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "LinksUpdateInput": {
      "primaryLinkLabel": [
        1
      ],
      "primaryLinkUrl": [
        1
      ],
      "secondaryLinks": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "LinksFilterInput": {
      "primaryLinkLabel": [
        56
      ],
      "primaryLinkUrl": [
        56
      ],
      "secondaryLinks": [
        57
      ],
      "__typename": [
        1
      ]
    },
    "StringFilter": {
      "eq": [
        1
      ],
      "gt": [
        1
      ],
      "gte": [
        1
      ],
      "in": [
        1
      ],
      "lt": [
        1
      ],
      "lte": [
        1
      ],
      "neq": [
        1
      ],
      "startsWith": [
        1
      ],
      "endsWith": [
        1
      ],
      "like": [
        1
      ],
      "ilike": [
        1
      ],
      "regex": [
        1
      ],
      "iregex": [
        1
      ],
      "is": [
        34
      ],
      "__typename": [
        1
      ]
    },
    "RawJsonFilter": {
      "is": [
        34
      ],
      "like": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "LinksOrderByInput": {
      "primaryLinkLabel": [
        59
      ],
      "primaryLinkUrl": [
        59
      ],
      "secondaryLinks": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "OrderByDirection": {},
    "LinksGroupByInput": {
      "primaryLinkLabel": [
        6
      ],
      "primaryLinkUrl": [
        6
      ],
      "secondaryLinks": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "Currency": {
      "amountMicros": [
        62
      ],
      "currencyCode": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "BigFloat": {},
    "CurrencyCreateInput": {
      "amountMicros": [
        62
      ],
      "currencyCode": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CurrencyUpdateInput": {
      "amountMicros": [
        62
      ],
      "currencyCode": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CurrencyFilterInput": {
      "amountMicros": [
        66
      ],
      "currencyCode": [
        56
      ],
      "__typename": [
        1
      ]
    },
    "BigFloatFilter": {
      "eq": [
        62
      ],
      "gt": [
        62
      ],
      "gte": [
        62
      ],
      "in": [
        62
      ],
      "lt": [
        62
      ],
      "lte": [
        62
      ],
      "neq": [
        62
      ],
      "is": [
        34
      ],
      "__typename": [
        1
      ]
    },
    "CurrencyOrderByInput": {
      "amountMicros": [
        59
      ],
      "currencyCode": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "CurrencyGroupByInput": {
      "amountMicros": [
        6
      ],
      "currencyCode": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "FullName": {
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "FullNameCreateInput": {
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "FullNameUpdateInput": {
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "FullNameFilterInput": {
      "firstName": [
        56
      ],
      "lastName": [
        56
      ],
      "__typename": [
        1
      ]
    },
    "FullNameOrderByInput": {
      "firstName": [
        59
      ],
      "lastName": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "FullNameGroupByInput": {
      "firstName": [
        6
      ],
      "lastName": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "Address": {
      "addressStreet1": [
        1
      ],
      "addressStreet2": [
        1
      ],
      "addressCity": [
        1
      ],
      "addressPostcode": [
        1
      ],
      "addressState": [
        1
      ],
      "addressCountry": [
        1
      ],
      "addressLat": [
        62
      ],
      "addressLng": [
        62
      ],
      "__typename": [
        1
      ]
    },
    "AddressCreateInput": {
      "addressStreet1": [
        1
      ],
      "addressStreet2": [
        1
      ],
      "addressCity": [
        1
      ],
      "addressPostcode": [
        1
      ],
      "addressState": [
        1
      ],
      "addressCountry": [
        1
      ],
      "addressLat": [
        62
      ],
      "addressLng": [
        62
      ],
      "__typename": [
        1
      ]
    },
    "AddressUpdateInput": {
      "addressStreet1": [
        1
      ],
      "addressStreet2": [
        1
      ],
      "addressCity": [
        1
      ],
      "addressPostcode": [
        1
      ],
      "addressState": [
        1
      ],
      "addressCountry": [
        1
      ],
      "addressLat": [
        62
      ],
      "addressLng": [
        62
      ],
      "__typename": [
        1
      ]
    },
    "AddressFilterInput": {
      "addressStreet1": [
        56
      ],
      "addressStreet2": [
        56
      ],
      "addressCity": [
        56
      ],
      "addressPostcode": [
        56
      ],
      "addressState": [
        56
      ],
      "addressCountry": [
        56
      ],
      "addressLat": [
        66
      ],
      "addressLng": [
        66
      ],
      "__typename": [
        1
      ]
    },
    "AddressOrderByInput": {
      "addressStreet1": [
        59
      ],
      "addressStreet2": [
        59
      ],
      "addressCity": [
        59
      ],
      "addressPostcode": [
        59
      ],
      "addressState": [
        59
      ],
      "addressCountry": [
        59
      ],
      "addressLat": [
        59
      ],
      "addressLng": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "AddressGroupByInput": {
      "addressStreet1": [
        6
      ],
      "addressStreet2": [
        6
      ],
      "addressCity": [
        6
      ],
      "addressPostcode": [
        6
      ],
      "addressState": [
        6
      ],
      "addressCountry": [
        6
      ],
      "addressLat": [
        6
      ],
      "addressLng": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ActorSourceEnum": {},
    "Actor": {
      "source": [
        81
      ],
      "workspaceMemberId": [
        2
      ],
      "name": [
        1
      ],
      "context": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "ActorCreateInput": {
      "source": [
        81
      ],
      "context": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "ActorUpdateInput": {
      "source": [
        81
      ],
      "context": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "ActorFilterInput": {
      "source": [
        86
      ],
      "workspaceMemberId": [
        33
      ],
      "name": [
        56
      ],
      "context": [
        57
      ],
      "__typename": [
        1
      ]
    },
    "ActorSourceEnumFilter": {
      "eq": [
        81
      ],
      "neq": [
        81
      ],
      "in": [
        81
      ],
      "containsAny": [
        81
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ActorOrderByInput": {
      "source": [
        59
      ],
      "workspaceMemberId": [
        59
      ],
      "name": [
        59
      ],
      "context": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "ActorGroupByInput": {
      "source": [
        6
      ],
      "workspaceMemberId": [
        6
      ],
      "name": [
        6
      ],
      "context": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "Emails": {
      "primaryEmail": [
        1
      ],
      "additionalEmails": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "EmailsCreateInput": {
      "primaryEmail": [
        1
      ],
      "additionalEmails": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "EmailsUpdateInput": {
      "primaryEmail": [
        1
      ],
      "additionalEmails": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "EmailsFilterInput": {
      "primaryEmail": [
        56
      ],
      "additionalEmails": [
        57
      ],
      "__typename": [
        1
      ]
    },
    "EmailsOrderByInput": {
      "primaryEmail": [
        59
      ],
      "additionalEmails": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "EmailsGroupByInput": {
      "primaryEmail": [
        6
      ],
      "additionalEmails": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "Phones": {
      "primaryPhoneNumber": [
        1
      ],
      "primaryPhoneCountryCode": [
        1
      ],
      "primaryPhoneCallingCode": [
        1
      ],
      "additionalPhones": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "PhonesCreateInput": {
      "primaryPhoneNumber": [
        1
      ],
      "primaryPhoneCountryCode": [
        1
      ],
      "primaryPhoneCallingCode": [
        1
      ],
      "additionalPhones": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "PhonesUpdateInput": {
      "primaryPhoneNumber": [
        1
      ],
      "primaryPhoneCountryCode": [
        1
      ],
      "primaryPhoneCallingCode": [
        1
      ],
      "additionalPhones": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "PhonesFilterInput": {
      "primaryPhoneNumber": [
        56
      ],
      "primaryPhoneCountryCode": [
        56
      ],
      "primaryPhoneCallingCode": [
        56
      ],
      "additionalPhones": [
        57
      ],
      "__typename": [
        1
      ]
    },
    "PhonesOrderByInput": {
      "primaryPhoneNumber": [
        59
      ],
      "primaryPhoneCountryCode": [
        59
      ],
      "primaryPhoneCallingCode": [
        59
      ],
      "additionalPhones": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "PhonesGroupByInput": {
      "primaryPhoneNumber": [
        6
      ],
      "primaryPhoneCountryCode": [
        6
      ],
      "primaryPhoneCallingCode": [
        6
      ],
      "additionalPhones": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "RichTextV2": {
      "blocknote": [
        1
      ],
      "markdown": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "RichTextV2CreateInput": {
      "blocknote": [
        1
      ],
      "markdown": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "RichTextV2UpdateInput": {
      "blocknote": [
        1
      ],
      "markdown": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "RichTextV2FilterInput": {
      "blocknote": [
        56
      ],
      "markdown": [
        56
      ],
      "__typename": [
        1
      ]
    },
    "RichTextV2OrderByInput": {
      "blocknote": [
        59
      ],
      "markdown": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "RichTextV2GroupByInput": {
      "blocknote": [
        6
      ],
      "markdown": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "DateGranularityEnum": {},
    "FirstDayOfTheWeek": {},
    "GroupByDateGranularityInput": {
      "granularity": [
        107
      ],
      "weekStartDay": [
        108
      ],
      "timeZone": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "OrderByDateGranularityInput": {
      "orderBy": [
        59
      ],
      "granularity": [
        107
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentFileCategoryEnum": {},
    "Attachment": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "file": [
        113
      ],
      "fullPath": [
        1
      ],
      "fileCategory": [
        111
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "targetTaskId": [
        22
      ],
      "targetNoteId": [
        22
      ],
      "targetPersonId": [
        22
      ],
      "targetCompanyId": [
        22
      ],
      "targetOpportunityId": [
        22
      ],
      "targetDashboardId": [
        22
      ],
      "targetWorkflowId": [
        22
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetTask": [
        428
      ],
      "targetNote": [
        395
      ],
      "targetPerson": [
        629
      ],
      "targetCompany": [
        599
      ],
      "targetOpportunity": [
        615
      ],
      "targetDashboard": [
        245
      ],
      "targetWorkflow": [
        476
      ],
      "targetQaScorecard": [
        647
      ],
      "__typename": [
        1
      ]
    },
    "FileObject": {
      "fileId": [
        2
      ],
      "label": [
        1
      ],
      "extension": [
        1
      ],
      "url": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentEdge": {
      "node": [
        112
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "Cursor": {},
    "AttachmentConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesFile": [
        10
      ],
      "countEmptyFile": [
        10
      ],
      "countNotEmptyFile": [
        10
      ],
      "percentageEmptyFile": [
        13
      ],
      "percentageNotEmptyFile": [
        13
      ],
      "countUniqueValuesFullPath": [
        10
      ],
      "countEmptyFullPath": [
        10
      ],
      "countNotEmptyFullPath": [
        10
      ],
      "percentageEmptyFullPath": [
        13
      ],
      "percentageNotEmptyFullPath": [
        13
      ],
      "countUniqueValuesFileCategory": [
        10
      ],
      "countEmptyFileCategory": [
        10
      ],
      "countNotEmptyFileCategory": [
        10
      ],
      "percentageEmptyFileCategory": [
        13
      ],
      "percentageNotEmptyFileCategory": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesTargetTask": [
        10
      ],
      "countEmptyTargetTask": [
        10
      ],
      "countNotEmptyTargetTask": [
        10
      ],
      "percentageEmptyTargetTask": [
        13
      ],
      "percentageNotEmptyTargetTask": [
        13
      ],
      "countUniqueValuesTargetNote": [
        10
      ],
      "countEmptyTargetNote": [
        10
      ],
      "countNotEmptyTargetNote": [
        10
      ],
      "percentageEmptyTargetNote": [
        13
      ],
      "percentageNotEmptyTargetNote": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetDashboard": [
        10
      ],
      "countEmptyTargetDashboard": [
        10
      ],
      "countNotEmptyTargetDashboard": [
        10
      ],
      "percentageEmptyTargetDashboard": [
        13
      ],
      "percentageNotEmptyTargetDashboard": [
        13
      ],
      "countUniqueValuesTargetWorkflow": [
        10
      ],
      "countEmptyTargetWorkflow": [
        10
      ],
      "countNotEmptyTargetWorkflow": [
        10
      ],
      "percentageEmptyTargetWorkflow": [
        13
      ],
      "percentageNotEmptyTargetWorkflow": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        114
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "PageInfo": {
      "startCursor": [
        118
      ],
      "endCursor": [
        118
      ],
      "hasNextPage": [
        6
      ],
      "hasPreviousPage": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ConnectionCursor": {},
    "AttachmentGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesFile": [
        10
      ],
      "countEmptyFile": [
        10
      ],
      "countNotEmptyFile": [
        10
      ],
      "percentageEmptyFile": [
        13
      ],
      "percentageNotEmptyFile": [
        13
      ],
      "countUniqueValuesFullPath": [
        10
      ],
      "countEmptyFullPath": [
        10
      ],
      "countNotEmptyFullPath": [
        10
      ],
      "percentageEmptyFullPath": [
        13
      ],
      "percentageNotEmptyFullPath": [
        13
      ],
      "countUniqueValuesFileCategory": [
        10
      ],
      "countEmptyFileCategory": [
        10
      ],
      "countNotEmptyFileCategory": [
        10
      ],
      "percentageEmptyFileCategory": [
        13
      ],
      "percentageNotEmptyFileCategory": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesTargetTask": [
        10
      ],
      "countEmptyTargetTask": [
        10
      ],
      "countNotEmptyTargetTask": [
        10
      ],
      "percentageEmptyTargetTask": [
        13
      ],
      "percentageNotEmptyTargetTask": [
        13
      ],
      "countUniqueValuesTargetNote": [
        10
      ],
      "countEmptyTargetNote": [
        10
      ],
      "countNotEmptyTargetNote": [
        10
      ],
      "percentageEmptyTargetNote": [
        13
      ],
      "percentageNotEmptyTargetNote": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetDashboard": [
        10
      ],
      "countEmptyTargetDashboard": [
        10
      ],
      "countNotEmptyTargetDashboard": [
        10
      ],
      "percentageEmptyTargetDashboard": [
        13
      ],
      "percentageNotEmptyTargetDashboard": [
        13
      ],
      "countUniqueValuesTargetWorkflow": [
        10
      ],
      "countEmptyTargetWorkflow": [
        10
      ],
      "countNotEmptyTargetWorkflow": [
        10
      ],
      "percentageEmptyTargetWorkflow": [
        13
      ],
      "percentageNotEmptyTargetWorkflow": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        114
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentRelationInput": {
      "connect": [
        121
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentConnectInput": {
      "where": [
        122
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "file": [
        124
      ],
      "fullPath": [
        1
      ],
      "fileCategory": [
        111
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "targetTaskId": [
        22
      ],
      "targetTask": [
        432
      ],
      "targetNoteId": [
        22
      ],
      "targetNote": [
        399
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetDashboardId": [
        22
      ],
      "targetDashboard": [
        251
      ],
      "targetWorkflowId": [
        22
      ],
      "targetWorkflow": [
        480
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "FileItemInput": {
      "fileId": [
        2
      ],
      "label": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "file": [
        124
      ],
      "fullPath": [
        1
      ],
      "fileCategory": [
        111
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "targetTaskId": [
        22
      ],
      "targetTask": [
        432
      ],
      "targetNoteId": [
        22
      ],
      "targetNote": [
        399
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetDashboardId": [
        22
      ],
      "targetDashboard": [
        251
      ],
      "targetWorkflowId": [
        22
      ],
      "targetWorkflow": [
        480
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "and": [
        126
      ],
      "or": [
        126
      ],
      "not": [
        126
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentFileCategoryEnumFilter": {
      "eq": [
        111
      ],
      "neq": [
        111
      ],
      "in": [
        111
      ],
      "containsAny": [
        111
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        59
      ],
      "file": [
        59
      ],
      "fullPath": [
        59
      ],
      "fileCategory": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "targetTaskId": [
        59
      ],
      "targetTask": [
        443
      ],
      "targetNoteId": [
        59
      ],
      "targetNote": [
        409
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetDashboardId": [
        59
      ],
      "targetDashboard": [
        261
      ],
      "targetWorkflowId": [
        59
      ],
      "targetWorkflow": [
        501
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentOrderByWithGroupByInput": {
      "aggregate": [
        130
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        59
      ],
      "file": [
        59
      ],
      "fullPath": [
        59
      ],
      "fileCategory": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "targetTaskId": [
        59
      ],
      "targetTask": [
        444
      ],
      "targetNoteId": [
        59
      ],
      "targetNote": [
        410
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        641
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        611
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        626
      ],
      "targetDashboardId": [
        59
      ],
      "targetDashboard": [
        262
      ],
      "targetWorkflowId": [
        59
      ],
      "targetWorkflow": [
        502
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        666
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesFile": [
        59
      ],
      "countEmptyFile": [
        59
      ],
      "countNotEmptyFile": [
        59
      ],
      "percentageEmptyFile": [
        59
      ],
      "percentageNotEmptyFile": [
        59
      ],
      "countUniqueValuesFullPath": [
        59
      ],
      "countEmptyFullPath": [
        59
      ],
      "countNotEmptyFullPath": [
        59
      ],
      "percentageEmptyFullPath": [
        59
      ],
      "percentageNotEmptyFullPath": [
        59
      ],
      "countUniqueValuesFileCategory": [
        59
      ],
      "countEmptyFileCategory": [
        59
      ],
      "countNotEmptyFileCategory": [
        59
      ],
      "percentageEmptyFileCategory": [
        59
      ],
      "percentageNotEmptyFileCategory": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "targetTaskId": [
        59
      ],
      "targetTask": [
        443
      ],
      "targetNoteId": [
        59
      ],
      "targetNote": [
        409
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetDashboardId": [
        59
      ],
      "targetDashboard": [
        261
      ],
      "targetWorkflowId": [
        59
      ],
      "targetWorkflow": [
        501
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "AttachmentGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        6
      ],
      "file": [
        6
      ],
      "fullPath": [
        6
      ],
      "fileCategory": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "targetTask": [
        446
      ],
      "targetNote": [
        412
      ],
      "targetPerson": [
        643
      ],
      "targetCompany": [
        613
      ],
      "targetOpportunity": [
        628
      ],
      "targetDashboard": [
        264
      ],
      "targetWorkflow": [
        504
      ],
      "targetQaScorecard": [
        668
      ],
      "__typename": [
        1
      ]
    },
    "Blocklist": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        551
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistEdge": {
      "node": [
        132
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "edges": [
        133
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "edges": [
        133
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistRelationInput": {
      "connect": [
        137
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistConnectInput": {
      "where": [
        138
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "workspaceMemberId": [
        33
      ],
      "and": [
        141
      ],
      "or": [
        141
      ],
      "not": [
        141
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "handle": [
        59
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistOrderByWithGroupByInput": {
      "aggregate": [
        144
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "handle": [
        59
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        596
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesHandle": [
        59
      ],
      "countEmptyHandle": [
        59
      ],
      "countNotEmptyHandle": [
        59
      ],
      "percentageEmptyHandle": [
        59
      ],
      "percentageNotEmptyHandle": [
        59
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "BlocklistGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "handle": [
        6
      ],
      "workspaceMember": [
        598
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociation": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "eventExternalId": [
        1
      ],
      "recurringEventExternalId": [
        1
      ],
      "calendarChannelId": [
        22
      ],
      "calendarEventId": [
        22
      ],
      "calendarChannel": [
        164
      ],
      "calendarEvent": [
        201
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationEdge": {
      "node": [
        146
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesEventExternalId": [
        10
      ],
      "countEmptyEventExternalId": [
        10
      ],
      "countNotEmptyEventExternalId": [
        10
      ],
      "percentageEmptyEventExternalId": [
        13
      ],
      "percentageNotEmptyEventExternalId": [
        13
      ],
      "countUniqueValuesRecurringEventExternalId": [
        10
      ],
      "countEmptyRecurringEventExternalId": [
        10
      ],
      "countNotEmptyRecurringEventExternalId": [
        10
      ],
      "percentageEmptyRecurringEventExternalId": [
        13
      ],
      "percentageNotEmptyRecurringEventExternalId": [
        13
      ],
      "edges": [
        147
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesEventExternalId": [
        10
      ],
      "countEmptyEventExternalId": [
        10
      ],
      "countNotEmptyEventExternalId": [
        10
      ],
      "percentageEmptyEventExternalId": [
        13
      ],
      "percentageNotEmptyEventExternalId": [
        13
      ],
      "countUniqueValuesRecurringEventExternalId": [
        10
      ],
      "countEmptyRecurringEventExternalId": [
        10
      ],
      "countNotEmptyRecurringEventExternalId": [
        10
      ],
      "percentageEmptyRecurringEventExternalId": [
        13
      ],
      "percentageNotEmptyRecurringEventExternalId": [
        13
      ],
      "edges": [
        147
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationRelationInput": {
      "connect": [
        151
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationConnectInput": {
      "where": [
        152
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "eventExternalId": [
        1
      ],
      "recurringEventExternalId": [
        1
      ],
      "calendarChannelId": [
        22
      ],
      "calendarChannel": [
        168
      ],
      "calendarEventId": [
        22
      ],
      "calendarEvent": [
        205
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "eventExternalId": [
        1
      ],
      "recurringEventExternalId": [
        1
      ],
      "calendarChannelId": [
        22
      ],
      "calendarChannel": [
        168
      ],
      "calendarEventId": [
        22
      ],
      "calendarEvent": [
        205
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "eventExternalId": [
        56
      ],
      "recurringEventExternalId": [
        56
      ],
      "calendarChannelId": [
        33
      ],
      "calendarEventId": [
        33
      ],
      "and": [
        155
      ],
      "or": [
        155
      ],
      "not": [
        155
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "eventExternalId": [
        59
      ],
      "recurringEventExternalId": [
        59
      ],
      "calendarChannelId": [
        59
      ],
      "calendarChannel": [
        181
      ],
      "calendarEventId": [
        59
      ],
      "calendarEvent": [
        213
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationOrderByWithGroupByInput": {
      "aggregate": [
        158
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "eventExternalId": [
        59
      ],
      "recurringEventExternalId": [
        59
      ],
      "calendarChannelId": [
        59
      ],
      "calendarChannel": [
        182
      ],
      "calendarEventId": [
        59
      ],
      "calendarEvent": [
        214
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesEventExternalId": [
        59
      ],
      "countEmptyEventExternalId": [
        59
      ],
      "countNotEmptyEventExternalId": [
        59
      ],
      "percentageEmptyEventExternalId": [
        59
      ],
      "percentageNotEmptyEventExternalId": [
        59
      ],
      "countUniqueValuesRecurringEventExternalId": [
        59
      ],
      "countEmptyRecurringEventExternalId": [
        59
      ],
      "countNotEmptyRecurringEventExternalId": [
        59
      ],
      "percentageEmptyRecurringEventExternalId": [
        59
      ],
      "percentageNotEmptyRecurringEventExternalId": [
        59
      ],
      "calendarChannelId": [
        59
      ],
      "calendarChannel": [
        181
      ],
      "calendarEventId": [
        59
      ],
      "calendarEvent": [
        213
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEventAssociationGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "eventExternalId": [
        6
      ],
      "recurringEventExternalId": [
        6
      ],
      "calendarChannel": [
        184
      ],
      "calendarEvent": [
        216
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelVisibilityEnum": {},
    "CalendarChannelContactAutoCreationPolicyEnum": {},
    "CalendarChannelSyncStatusEnum": {},
    "CalendarChannelSyncStageEnum": {},
    "CalendarChannel": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "visibility": [
        160
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        161
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        1
      ],
      "syncStatus": [
        162
      ],
      "syncStage": [
        163
      ],
      "syncStageStartedAt": [
        7
      ],
      "syncedAt": [
        7
      ],
      "throttleFailureCount": [
        13
      ],
      "connectedAccountId": [
        22
      ],
      "calendarChannelEventAssociations": [
        148,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            155
          ],
          "orderBy": [
            156,
            "[CalendarChannelEventAssociationOrderByInput]"
          ]
        }
      ],
      "connectedAccount": [
        217
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelEdge": {
      "node": [
        164
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesVisibility": [
        10
      ],
      "countEmptyVisibility": [
        10
      ],
      "countNotEmptyVisibility": [
        10
      ],
      "percentageEmptyVisibility": [
        13
      ],
      "percentageNotEmptyVisibility": [
        13
      ],
      "countUniqueValuesIsContactAutoCreationEnabled": [
        10
      ],
      "countEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "countNotEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "percentageEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "percentageNotEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "countTrueIsContactAutoCreationEnabled": [
        10
      ],
      "countFalseIsContactAutoCreationEnabled": [
        10
      ],
      "countUniqueValuesContactAutoCreationPolicy": [
        10
      ],
      "countEmptyContactAutoCreationPolicy": [
        10
      ],
      "countNotEmptyContactAutoCreationPolicy": [
        10
      ],
      "percentageEmptyContactAutoCreationPolicy": [
        13
      ],
      "percentageNotEmptyContactAutoCreationPolicy": [
        13
      ],
      "countUniqueValuesIsSyncEnabled": [
        10
      ],
      "countEmptyIsSyncEnabled": [
        10
      ],
      "countNotEmptyIsSyncEnabled": [
        10
      ],
      "percentageEmptyIsSyncEnabled": [
        13
      ],
      "percentageNotEmptyIsSyncEnabled": [
        13
      ],
      "countTrueIsSyncEnabled": [
        10
      ],
      "countFalseIsSyncEnabled": [
        10
      ],
      "countUniqueValuesSyncCursor": [
        10
      ],
      "countEmptySyncCursor": [
        10
      ],
      "countNotEmptySyncCursor": [
        10
      ],
      "percentageEmptySyncCursor": [
        13
      ],
      "percentageNotEmptySyncCursor": [
        13
      ],
      "countUniqueValuesSyncStatus": [
        10
      ],
      "countEmptySyncStatus": [
        10
      ],
      "countNotEmptySyncStatus": [
        10
      ],
      "percentageEmptySyncStatus": [
        13
      ],
      "percentageNotEmptySyncStatus": [
        13
      ],
      "countUniqueValuesSyncStage": [
        10
      ],
      "countEmptySyncStage": [
        10
      ],
      "countNotEmptySyncStage": [
        10
      ],
      "percentageEmptySyncStage": [
        13
      ],
      "percentageNotEmptySyncStage": [
        13
      ],
      "countUniqueValuesSyncStageStartedAt": [
        10
      ],
      "countEmptySyncStageStartedAt": [
        10
      ],
      "countNotEmptySyncStageStartedAt": [
        10
      ],
      "percentageEmptySyncStageStartedAt": [
        13
      ],
      "percentageNotEmptySyncStageStartedAt": [
        13
      ],
      "minSyncStageStartedAt": [
        7
      ],
      "maxSyncStageStartedAt": [
        7
      ],
      "countUniqueValuesSyncedAt": [
        10
      ],
      "countEmptySyncedAt": [
        10
      ],
      "countNotEmptySyncedAt": [
        10
      ],
      "percentageEmptySyncedAt": [
        13
      ],
      "percentageNotEmptySyncedAt": [
        13
      ],
      "minSyncedAt": [
        7
      ],
      "maxSyncedAt": [
        7
      ],
      "countUniqueValuesThrottleFailureCount": [
        10
      ],
      "countEmptyThrottleFailureCount": [
        10
      ],
      "countNotEmptyThrottleFailureCount": [
        10
      ],
      "percentageEmptyThrottleFailureCount": [
        13
      ],
      "percentageNotEmptyThrottleFailureCount": [
        13
      ],
      "minThrottleFailureCount": [
        13
      ],
      "maxThrottleFailureCount": [
        13
      ],
      "avgThrottleFailureCount": [
        13
      ],
      "sumThrottleFailureCount": [
        13
      ],
      "edges": [
        165
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesVisibility": [
        10
      ],
      "countEmptyVisibility": [
        10
      ],
      "countNotEmptyVisibility": [
        10
      ],
      "percentageEmptyVisibility": [
        13
      ],
      "percentageNotEmptyVisibility": [
        13
      ],
      "countUniqueValuesIsContactAutoCreationEnabled": [
        10
      ],
      "countEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "countNotEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "percentageEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "percentageNotEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "countTrueIsContactAutoCreationEnabled": [
        10
      ],
      "countFalseIsContactAutoCreationEnabled": [
        10
      ],
      "countUniqueValuesContactAutoCreationPolicy": [
        10
      ],
      "countEmptyContactAutoCreationPolicy": [
        10
      ],
      "countNotEmptyContactAutoCreationPolicy": [
        10
      ],
      "percentageEmptyContactAutoCreationPolicy": [
        13
      ],
      "percentageNotEmptyContactAutoCreationPolicy": [
        13
      ],
      "countUniqueValuesIsSyncEnabled": [
        10
      ],
      "countEmptyIsSyncEnabled": [
        10
      ],
      "countNotEmptyIsSyncEnabled": [
        10
      ],
      "percentageEmptyIsSyncEnabled": [
        13
      ],
      "percentageNotEmptyIsSyncEnabled": [
        13
      ],
      "countTrueIsSyncEnabled": [
        10
      ],
      "countFalseIsSyncEnabled": [
        10
      ],
      "countUniqueValuesSyncCursor": [
        10
      ],
      "countEmptySyncCursor": [
        10
      ],
      "countNotEmptySyncCursor": [
        10
      ],
      "percentageEmptySyncCursor": [
        13
      ],
      "percentageNotEmptySyncCursor": [
        13
      ],
      "countUniqueValuesSyncStatus": [
        10
      ],
      "countEmptySyncStatus": [
        10
      ],
      "countNotEmptySyncStatus": [
        10
      ],
      "percentageEmptySyncStatus": [
        13
      ],
      "percentageNotEmptySyncStatus": [
        13
      ],
      "countUniqueValuesSyncStage": [
        10
      ],
      "countEmptySyncStage": [
        10
      ],
      "countNotEmptySyncStage": [
        10
      ],
      "percentageEmptySyncStage": [
        13
      ],
      "percentageNotEmptySyncStage": [
        13
      ],
      "countUniqueValuesSyncStageStartedAt": [
        10
      ],
      "countEmptySyncStageStartedAt": [
        10
      ],
      "countNotEmptySyncStageStartedAt": [
        10
      ],
      "percentageEmptySyncStageStartedAt": [
        13
      ],
      "percentageNotEmptySyncStageStartedAt": [
        13
      ],
      "minSyncStageStartedAt": [
        7
      ],
      "maxSyncStageStartedAt": [
        7
      ],
      "countUniqueValuesSyncedAt": [
        10
      ],
      "countEmptySyncedAt": [
        10
      ],
      "countNotEmptySyncedAt": [
        10
      ],
      "percentageEmptySyncedAt": [
        13
      ],
      "percentageNotEmptySyncedAt": [
        13
      ],
      "minSyncedAt": [
        7
      ],
      "maxSyncedAt": [
        7
      ],
      "countUniqueValuesThrottleFailureCount": [
        10
      ],
      "countEmptyThrottleFailureCount": [
        10
      ],
      "countNotEmptyThrottleFailureCount": [
        10
      ],
      "percentageEmptyThrottleFailureCount": [
        13
      ],
      "percentageNotEmptyThrottleFailureCount": [
        13
      ],
      "minThrottleFailureCount": [
        13
      ],
      "maxThrottleFailureCount": [
        13
      ],
      "avgThrottleFailureCount": [
        13
      ],
      "sumThrottleFailureCount": [
        13
      ],
      "edges": [
        165
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelRelationInput": {
      "connect": [
        169
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelConnectInput": {
      "where": [
        170
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "visibility": [
        160
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        161
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        1
      ],
      "syncStatus": [
        162
      ],
      "syncStage": [
        163
      ],
      "syncStageStartedAt": [
        7
      ],
      "syncedAt": [
        7
      ],
      "throttleFailureCount": [
        13
      ],
      "connectedAccountId": [
        22
      ],
      "connectedAccount": [
        221
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "visibility": [
        160
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        161
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        1
      ],
      "syncStatus": [
        162
      ],
      "syncStage": [
        163
      ],
      "syncStageStartedAt": [
        7
      ],
      "syncedAt": [
        7
      ],
      "throttleFailureCount": [
        13
      ],
      "connectedAccountId": [
        22
      ],
      "connectedAccount": [
        221
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "visibility": [
        174
      ],
      "isContactAutoCreationEnabled": [
        175
      ],
      "contactAutoCreationPolicy": [
        176
      ],
      "isSyncEnabled": [
        175
      ],
      "syncCursor": [
        56
      ],
      "syncStatus": [
        177
      ],
      "syncStage": [
        178
      ],
      "syncStageStartedAt": [
        7
      ],
      "syncedAt": [
        7
      ],
      "throttleFailureCount": [
        179
      ],
      "calendarChannelEventAssociations": [
        180
      ],
      "connectedAccountId": [
        33
      ],
      "and": [
        173
      ],
      "or": [
        173
      ],
      "not": [
        173
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelVisibilityEnumFilter": {
      "eq": [
        160
      ],
      "neq": [
        160
      ],
      "in": [
        160
      ],
      "containsAny": [
        160
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "BooleanFilter": {
      "eq": [
        6
      ],
      "is": [
        34
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelContactAutoCreationPolicyEnumFilter": {
      "eq": [
        161
      ],
      "neq": [
        161
      ],
      "in": [
        161
      ],
      "containsAny": [
        161
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelSyncStatusEnumFilter": {
      "eq": [
        162
      ],
      "neq": [
        162
      ],
      "in": [
        162
      ],
      "containsAny": [
        162
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelSyncStageEnumFilter": {
      "eq": [
        163
      ],
      "neq": [
        163
      ],
      "in": [
        163
      ],
      "containsAny": [
        163
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "FloatFilter": {
      "eq": [
        13
      ],
      "gt": [
        13
      ],
      "gte": [
        13
      ],
      "in": [
        13
      ],
      "lt": [
        13
      ],
      "lte": [
        13
      ],
      "neq": [
        13
      ],
      "is": [
        34
      ],
      "__typename": [
        1
      ]
    },
    "calendarChannelEventAssociationsOneToManyFilter_59081af3": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "eventExternalId": [
        56
      ],
      "recurringEventExternalId": [
        56
      ],
      "calendarChannelId": [
        33
      ],
      "calendarEventId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "handle": [
        59
      ],
      "visibility": [
        59
      ],
      "isContactAutoCreationEnabled": [
        59
      ],
      "contactAutoCreationPolicy": [
        59
      ],
      "isSyncEnabled": [
        59
      ],
      "syncCursor": [
        59
      ],
      "syncStatus": [
        59
      ],
      "syncStage": [
        59
      ],
      "syncStageStartedAt": [
        59
      ],
      "syncedAt": [
        59
      ],
      "throttleFailureCount": [
        59
      ],
      "connectedAccountId": [
        59
      ],
      "connectedAccount": [
        241
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelOrderByWithGroupByInput": {
      "aggregate": [
        183
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "handle": [
        59
      ],
      "visibility": [
        59
      ],
      "isContactAutoCreationEnabled": [
        59
      ],
      "contactAutoCreationPolicy": [
        59
      ],
      "isSyncEnabled": [
        59
      ],
      "syncCursor": [
        59
      ],
      "syncStatus": [
        59
      ],
      "syncStage": [
        59
      ],
      "syncStageStartedAt": [
        110
      ],
      "syncedAt": [
        110
      ],
      "throttleFailureCount": [
        59
      ],
      "connectedAccountId": [
        59
      ],
      "connectedAccount": [
        242
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesHandle": [
        59
      ],
      "countEmptyHandle": [
        59
      ],
      "countNotEmptyHandle": [
        59
      ],
      "percentageEmptyHandle": [
        59
      ],
      "percentageNotEmptyHandle": [
        59
      ],
      "countUniqueValuesVisibility": [
        59
      ],
      "countEmptyVisibility": [
        59
      ],
      "countNotEmptyVisibility": [
        59
      ],
      "percentageEmptyVisibility": [
        59
      ],
      "percentageNotEmptyVisibility": [
        59
      ],
      "countUniqueValuesIsContactAutoCreationEnabled": [
        59
      ],
      "countEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "countNotEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "percentageEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "percentageNotEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "countTrueIsContactAutoCreationEnabled": [
        59
      ],
      "countFalseIsContactAutoCreationEnabled": [
        59
      ],
      "countUniqueValuesContactAutoCreationPolicy": [
        59
      ],
      "countEmptyContactAutoCreationPolicy": [
        59
      ],
      "countNotEmptyContactAutoCreationPolicy": [
        59
      ],
      "percentageEmptyContactAutoCreationPolicy": [
        59
      ],
      "percentageNotEmptyContactAutoCreationPolicy": [
        59
      ],
      "countUniqueValuesIsSyncEnabled": [
        59
      ],
      "countEmptyIsSyncEnabled": [
        59
      ],
      "countNotEmptyIsSyncEnabled": [
        59
      ],
      "percentageEmptyIsSyncEnabled": [
        59
      ],
      "percentageNotEmptyIsSyncEnabled": [
        59
      ],
      "countTrueIsSyncEnabled": [
        59
      ],
      "countFalseIsSyncEnabled": [
        59
      ],
      "countUniqueValuesSyncCursor": [
        59
      ],
      "countEmptySyncCursor": [
        59
      ],
      "countNotEmptySyncCursor": [
        59
      ],
      "percentageEmptySyncCursor": [
        59
      ],
      "percentageNotEmptySyncCursor": [
        59
      ],
      "countUniqueValuesSyncStatus": [
        59
      ],
      "countEmptySyncStatus": [
        59
      ],
      "countNotEmptySyncStatus": [
        59
      ],
      "percentageEmptySyncStatus": [
        59
      ],
      "percentageNotEmptySyncStatus": [
        59
      ],
      "countUniqueValuesSyncStage": [
        59
      ],
      "countEmptySyncStage": [
        59
      ],
      "countNotEmptySyncStage": [
        59
      ],
      "percentageEmptySyncStage": [
        59
      ],
      "percentageNotEmptySyncStage": [
        59
      ],
      "countUniqueValuesSyncStageStartedAt": [
        59
      ],
      "countEmptySyncStageStartedAt": [
        59
      ],
      "countNotEmptySyncStageStartedAt": [
        59
      ],
      "percentageEmptySyncStageStartedAt": [
        59
      ],
      "percentageNotEmptySyncStageStartedAt": [
        59
      ],
      "minSyncStageStartedAt": [
        59
      ],
      "maxSyncStageStartedAt": [
        59
      ],
      "countUniqueValuesSyncedAt": [
        59
      ],
      "countEmptySyncedAt": [
        59
      ],
      "countNotEmptySyncedAt": [
        59
      ],
      "percentageEmptySyncedAt": [
        59
      ],
      "percentageNotEmptySyncedAt": [
        59
      ],
      "minSyncedAt": [
        59
      ],
      "maxSyncedAt": [
        59
      ],
      "countUniqueValuesThrottleFailureCount": [
        59
      ],
      "countEmptyThrottleFailureCount": [
        59
      ],
      "countNotEmptyThrottleFailureCount": [
        59
      ],
      "percentageEmptyThrottleFailureCount": [
        59
      ],
      "percentageNotEmptyThrottleFailureCount": [
        59
      ],
      "minThrottleFailureCount": [
        59
      ],
      "maxThrottleFailureCount": [
        59
      ],
      "avgThrottleFailureCount": [
        59
      ],
      "sumThrottleFailureCount": [
        59
      ],
      "connectedAccountId": [
        59
      ],
      "connectedAccount": [
        241
      ],
      "__typename": [
        1
      ]
    },
    "CalendarChannelGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "handle": [
        6
      ],
      "visibility": [
        6
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        6
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        6
      ],
      "syncStatus": [
        6
      ],
      "syncStage": [
        6
      ],
      "syncStageStartedAt": [
        109
      ],
      "syncedAt": [
        109
      ],
      "throttleFailureCount": [
        6
      ],
      "connectedAccount": [
        244
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantResponseStatusEnum": {},
    "CalendarEventParticipant": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "displayName": [
        1
      ],
      "isOrganizer": [
        6
      ],
      "responseStatus": [
        185
      ],
      "calendarEventId": [
        22
      ],
      "personId": [
        22
      ],
      "workspaceMemberId": [
        22
      ],
      "calendarEvent": [
        201
      ],
      "person": [
        629
      ],
      "workspaceMember": [
        551
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantEdge": {
      "node": [
        186
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesDisplayName": [
        10
      ],
      "countEmptyDisplayName": [
        10
      ],
      "countNotEmptyDisplayName": [
        10
      ],
      "percentageEmptyDisplayName": [
        13
      ],
      "percentageNotEmptyDisplayName": [
        13
      ],
      "countUniqueValuesIsOrganizer": [
        10
      ],
      "countEmptyIsOrganizer": [
        10
      ],
      "countNotEmptyIsOrganizer": [
        10
      ],
      "percentageEmptyIsOrganizer": [
        13
      ],
      "percentageNotEmptyIsOrganizer": [
        13
      ],
      "countTrueIsOrganizer": [
        10
      ],
      "countFalseIsOrganizer": [
        10
      ],
      "countUniqueValuesResponseStatus": [
        10
      ],
      "countEmptyResponseStatus": [
        10
      ],
      "countNotEmptyResponseStatus": [
        10
      ],
      "percentageEmptyResponseStatus": [
        13
      ],
      "percentageNotEmptyResponseStatus": [
        13
      ],
      "edges": [
        187
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesDisplayName": [
        10
      ],
      "countEmptyDisplayName": [
        10
      ],
      "countNotEmptyDisplayName": [
        10
      ],
      "percentageEmptyDisplayName": [
        13
      ],
      "percentageNotEmptyDisplayName": [
        13
      ],
      "countUniqueValuesIsOrganizer": [
        10
      ],
      "countEmptyIsOrganizer": [
        10
      ],
      "countNotEmptyIsOrganizer": [
        10
      ],
      "percentageEmptyIsOrganizer": [
        13
      ],
      "percentageNotEmptyIsOrganizer": [
        13
      ],
      "countTrueIsOrganizer": [
        10
      ],
      "countFalseIsOrganizer": [
        10
      ],
      "countUniqueValuesResponseStatus": [
        10
      ],
      "countEmptyResponseStatus": [
        10
      ],
      "countNotEmptyResponseStatus": [
        10
      ],
      "percentageEmptyResponseStatus": [
        13
      ],
      "percentageNotEmptyResponseStatus": [
        13
      ],
      "edges": [
        187
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantRelationInput": {
      "connect": [
        191
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantConnectInput": {
      "where": [
        192
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "displayName": [
        1
      ],
      "isOrganizer": [
        6
      ],
      "responseStatus": [
        185
      ],
      "calendarEventId": [
        22
      ],
      "calendarEvent": [
        205
      ],
      "personId": [
        22
      ],
      "person": [
        633
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "displayName": [
        1
      ],
      "isOrganizer": [
        6
      ],
      "responseStatus": [
        185
      ],
      "calendarEventId": [
        22
      ],
      "calendarEvent": [
        205
      ],
      "personId": [
        22
      ],
      "person": [
        633
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "isOrganizer": [
        175
      ],
      "responseStatus": [
        196
      ],
      "calendarEventId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "and": [
        195
      ],
      "or": [
        195
      ],
      "not": [
        195
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantResponseStatusEnumFilter": {
      "eq": [
        185
      ],
      "neq": [
        185
      ],
      "in": [
        185
      ],
      "containsAny": [
        185
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "handle": [
        59
      ],
      "displayName": [
        59
      ],
      "isOrganizer": [
        59
      ],
      "responseStatus": [
        59
      ],
      "calendarEventId": [
        59
      ],
      "calendarEvent": [
        213
      ],
      "personId": [
        59
      ],
      "person": [
        640
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantOrderByWithGroupByInput": {
      "aggregate": [
        199
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "handle": [
        59
      ],
      "displayName": [
        59
      ],
      "isOrganizer": [
        59
      ],
      "responseStatus": [
        59
      ],
      "calendarEventId": [
        59
      ],
      "calendarEvent": [
        214
      ],
      "personId": [
        59
      ],
      "person": [
        641
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        596
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesHandle": [
        59
      ],
      "countEmptyHandle": [
        59
      ],
      "countNotEmptyHandle": [
        59
      ],
      "percentageEmptyHandle": [
        59
      ],
      "percentageNotEmptyHandle": [
        59
      ],
      "countUniqueValuesDisplayName": [
        59
      ],
      "countEmptyDisplayName": [
        59
      ],
      "countNotEmptyDisplayName": [
        59
      ],
      "percentageEmptyDisplayName": [
        59
      ],
      "percentageNotEmptyDisplayName": [
        59
      ],
      "countUniqueValuesIsOrganizer": [
        59
      ],
      "countEmptyIsOrganizer": [
        59
      ],
      "countNotEmptyIsOrganizer": [
        59
      ],
      "percentageEmptyIsOrganizer": [
        59
      ],
      "percentageNotEmptyIsOrganizer": [
        59
      ],
      "countTrueIsOrganizer": [
        59
      ],
      "countFalseIsOrganizer": [
        59
      ],
      "countUniqueValuesResponseStatus": [
        59
      ],
      "countEmptyResponseStatus": [
        59
      ],
      "countNotEmptyResponseStatus": [
        59
      ],
      "percentageEmptyResponseStatus": [
        59
      ],
      "percentageNotEmptyResponseStatus": [
        59
      ],
      "calendarEventId": [
        59
      ],
      "calendarEvent": [
        213
      ],
      "personId": [
        59
      ],
      "person": [
        640
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventParticipantGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "handle": [
        6
      ],
      "displayName": [
        6
      ],
      "isOrganizer": [
        6
      ],
      "responseStatus": [
        6
      ],
      "calendarEvent": [
        216
      ],
      "person": [
        643
      ],
      "workspaceMember": [
        598
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEvent": {
      "title": [
        1
      ],
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "isCanceled": [
        6
      ],
      "isFullDay": [
        6
      ],
      "startsAt": [
        7
      ],
      "endsAt": [
        7
      ],
      "externalCreatedAt": [
        7
      ],
      "externalUpdatedAt": [
        7
      ],
      "description": [
        1
      ],
      "location": [
        1
      ],
      "iCalUid": [
        1
      ],
      "conferenceSolution": [
        1
      ],
      "conferenceLink": [
        52
      ],
      "calendarChannelEventAssociations": [
        148,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            155
          ],
          "orderBy": [
            156,
            "[CalendarChannelEventAssociationOrderByInput]"
          ]
        }
      ],
      "calendarEventParticipants": [
        188,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            195
          ],
          "orderBy": [
            197,
            "[CalendarEventParticipantOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventEdge": {
      "node": [
        201
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesIsCanceled": [
        10
      ],
      "countEmptyIsCanceled": [
        10
      ],
      "countNotEmptyIsCanceled": [
        10
      ],
      "percentageEmptyIsCanceled": [
        13
      ],
      "percentageNotEmptyIsCanceled": [
        13
      ],
      "countTrueIsCanceled": [
        10
      ],
      "countFalseIsCanceled": [
        10
      ],
      "countUniqueValuesIsFullDay": [
        10
      ],
      "countEmptyIsFullDay": [
        10
      ],
      "countNotEmptyIsFullDay": [
        10
      ],
      "percentageEmptyIsFullDay": [
        13
      ],
      "percentageNotEmptyIsFullDay": [
        13
      ],
      "countTrueIsFullDay": [
        10
      ],
      "countFalseIsFullDay": [
        10
      ],
      "countUniqueValuesStartsAt": [
        10
      ],
      "countEmptyStartsAt": [
        10
      ],
      "countNotEmptyStartsAt": [
        10
      ],
      "percentageEmptyStartsAt": [
        13
      ],
      "percentageNotEmptyStartsAt": [
        13
      ],
      "minStartsAt": [
        7
      ],
      "maxStartsAt": [
        7
      ],
      "countUniqueValuesEndsAt": [
        10
      ],
      "countEmptyEndsAt": [
        10
      ],
      "countNotEmptyEndsAt": [
        10
      ],
      "percentageEmptyEndsAt": [
        13
      ],
      "percentageNotEmptyEndsAt": [
        13
      ],
      "minEndsAt": [
        7
      ],
      "maxEndsAt": [
        7
      ],
      "countUniqueValuesExternalCreatedAt": [
        10
      ],
      "countEmptyExternalCreatedAt": [
        10
      ],
      "countNotEmptyExternalCreatedAt": [
        10
      ],
      "percentageEmptyExternalCreatedAt": [
        13
      ],
      "percentageNotEmptyExternalCreatedAt": [
        13
      ],
      "minExternalCreatedAt": [
        7
      ],
      "maxExternalCreatedAt": [
        7
      ],
      "countUniqueValuesExternalUpdatedAt": [
        10
      ],
      "countEmptyExternalUpdatedAt": [
        10
      ],
      "countNotEmptyExternalUpdatedAt": [
        10
      ],
      "percentageEmptyExternalUpdatedAt": [
        13
      ],
      "percentageNotEmptyExternalUpdatedAt": [
        13
      ],
      "minExternalUpdatedAt": [
        7
      ],
      "maxExternalUpdatedAt": [
        7
      ],
      "countUniqueValuesDescription": [
        10
      ],
      "countEmptyDescription": [
        10
      ],
      "countNotEmptyDescription": [
        10
      ],
      "percentageEmptyDescription": [
        13
      ],
      "percentageNotEmptyDescription": [
        13
      ],
      "countUniqueValuesLocation": [
        10
      ],
      "countEmptyLocation": [
        10
      ],
      "countNotEmptyLocation": [
        10
      ],
      "percentageEmptyLocation": [
        13
      ],
      "percentageNotEmptyLocation": [
        13
      ],
      "countUniqueValuesICalUid": [
        10
      ],
      "countEmptyICalUid": [
        10
      ],
      "countNotEmptyICalUid": [
        10
      ],
      "percentageEmptyICalUid": [
        13
      ],
      "percentageNotEmptyICalUid": [
        13
      ],
      "countUniqueValuesConferenceSolution": [
        10
      ],
      "countEmptyConferenceSolution": [
        10
      ],
      "countNotEmptyConferenceSolution": [
        10
      ],
      "percentageEmptyConferenceSolution": [
        13
      ],
      "percentageNotEmptyConferenceSolution": [
        13
      ],
      "countUniqueValuesConferenceLink": [
        10
      ],
      "countEmptyConferenceLink": [
        10
      ],
      "countNotEmptyConferenceLink": [
        10
      ],
      "percentageEmptyConferenceLink": [
        13
      ],
      "percentageNotEmptyConferenceLink": [
        13
      ],
      "edges": [
        202
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesIsCanceled": [
        10
      ],
      "countEmptyIsCanceled": [
        10
      ],
      "countNotEmptyIsCanceled": [
        10
      ],
      "percentageEmptyIsCanceled": [
        13
      ],
      "percentageNotEmptyIsCanceled": [
        13
      ],
      "countTrueIsCanceled": [
        10
      ],
      "countFalseIsCanceled": [
        10
      ],
      "countUniqueValuesIsFullDay": [
        10
      ],
      "countEmptyIsFullDay": [
        10
      ],
      "countNotEmptyIsFullDay": [
        10
      ],
      "percentageEmptyIsFullDay": [
        13
      ],
      "percentageNotEmptyIsFullDay": [
        13
      ],
      "countTrueIsFullDay": [
        10
      ],
      "countFalseIsFullDay": [
        10
      ],
      "countUniqueValuesStartsAt": [
        10
      ],
      "countEmptyStartsAt": [
        10
      ],
      "countNotEmptyStartsAt": [
        10
      ],
      "percentageEmptyStartsAt": [
        13
      ],
      "percentageNotEmptyStartsAt": [
        13
      ],
      "minStartsAt": [
        7
      ],
      "maxStartsAt": [
        7
      ],
      "countUniqueValuesEndsAt": [
        10
      ],
      "countEmptyEndsAt": [
        10
      ],
      "countNotEmptyEndsAt": [
        10
      ],
      "percentageEmptyEndsAt": [
        13
      ],
      "percentageNotEmptyEndsAt": [
        13
      ],
      "minEndsAt": [
        7
      ],
      "maxEndsAt": [
        7
      ],
      "countUniqueValuesExternalCreatedAt": [
        10
      ],
      "countEmptyExternalCreatedAt": [
        10
      ],
      "countNotEmptyExternalCreatedAt": [
        10
      ],
      "percentageEmptyExternalCreatedAt": [
        13
      ],
      "percentageNotEmptyExternalCreatedAt": [
        13
      ],
      "minExternalCreatedAt": [
        7
      ],
      "maxExternalCreatedAt": [
        7
      ],
      "countUniqueValuesExternalUpdatedAt": [
        10
      ],
      "countEmptyExternalUpdatedAt": [
        10
      ],
      "countNotEmptyExternalUpdatedAt": [
        10
      ],
      "percentageEmptyExternalUpdatedAt": [
        13
      ],
      "percentageNotEmptyExternalUpdatedAt": [
        13
      ],
      "minExternalUpdatedAt": [
        7
      ],
      "maxExternalUpdatedAt": [
        7
      ],
      "countUniqueValuesDescription": [
        10
      ],
      "countEmptyDescription": [
        10
      ],
      "countNotEmptyDescription": [
        10
      ],
      "percentageEmptyDescription": [
        13
      ],
      "percentageNotEmptyDescription": [
        13
      ],
      "countUniqueValuesLocation": [
        10
      ],
      "countEmptyLocation": [
        10
      ],
      "countNotEmptyLocation": [
        10
      ],
      "percentageEmptyLocation": [
        13
      ],
      "percentageNotEmptyLocation": [
        13
      ],
      "countUniqueValuesICalUid": [
        10
      ],
      "countEmptyICalUid": [
        10
      ],
      "countNotEmptyICalUid": [
        10
      ],
      "percentageEmptyICalUid": [
        13
      ],
      "percentageNotEmptyICalUid": [
        13
      ],
      "countUniqueValuesConferenceSolution": [
        10
      ],
      "countEmptyConferenceSolution": [
        10
      ],
      "countNotEmptyConferenceSolution": [
        10
      ],
      "percentageEmptyConferenceSolution": [
        13
      ],
      "percentageNotEmptyConferenceSolution": [
        13
      ],
      "countUniqueValuesConferenceLink": [
        10
      ],
      "countEmptyConferenceLink": [
        10
      ],
      "countNotEmptyConferenceLink": [
        10
      ],
      "percentageEmptyConferenceLink": [
        13
      ],
      "percentageNotEmptyConferenceLink": [
        13
      ],
      "edges": [
        202
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventRelationInput": {
      "connect": [
        206
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventConnectInput": {
      "where": [
        207
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventCreateInput": {
      "title": [
        1
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "isCanceled": [
        6
      ],
      "isFullDay": [
        6
      ],
      "startsAt": [
        7
      ],
      "endsAt": [
        7
      ],
      "externalCreatedAt": [
        7
      ],
      "externalUpdatedAt": [
        7
      ],
      "description": [
        1
      ],
      "location": [
        1
      ],
      "iCalUid": [
        1
      ],
      "conferenceSolution": [
        1
      ],
      "conferenceLink": [
        53
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventUpdateInput": {
      "title": [
        1
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "isCanceled": [
        6
      ],
      "isFullDay": [
        6
      ],
      "startsAt": [
        7
      ],
      "endsAt": [
        7
      ],
      "externalCreatedAt": [
        7
      ],
      "externalUpdatedAt": [
        7
      ],
      "description": [
        1
      ],
      "location": [
        1
      ],
      "iCalUid": [
        1
      ],
      "conferenceSolution": [
        1
      ],
      "conferenceLink": [
        54
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventFilterInput": {
      "title": [
        56
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "isCanceled": [
        175
      ],
      "isFullDay": [
        175
      ],
      "startsAt": [
        7
      ],
      "endsAt": [
        7
      ],
      "externalCreatedAt": [
        7
      ],
      "externalUpdatedAt": [
        7
      ],
      "description": [
        56
      ],
      "location": [
        56
      ],
      "iCalUid": [
        56
      ],
      "conferenceSolution": [
        56
      ],
      "conferenceLink": [
        55
      ],
      "calendarChannelEventAssociations": [
        211
      ],
      "calendarEventParticipants": [
        212
      ],
      "and": [
        210
      ],
      "or": [
        210
      ],
      "not": [
        210
      ],
      "__typename": [
        1
      ]
    },
    "calendarChannelEventAssociationsOneToManyFilter_202696e0": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "eventExternalId": [
        56
      ],
      "recurringEventExternalId": [
        56
      ],
      "calendarChannelId": [
        33
      ],
      "calendarEventId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "calendarEventParticipantsOneToManyFilter_5f0e5089": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "isOrganizer": [
        175
      ],
      "responseStatus": [
        196
      ],
      "calendarEventId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventOrderByInput": {
      "title": [
        59
      ],
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "isCanceled": [
        59
      ],
      "isFullDay": [
        59
      ],
      "startsAt": [
        59
      ],
      "endsAt": [
        59
      ],
      "externalCreatedAt": [
        59
      ],
      "externalUpdatedAt": [
        59
      ],
      "description": [
        59
      ],
      "location": [
        59
      ],
      "iCalUid": [
        59
      ],
      "conferenceSolution": [
        59
      ],
      "conferenceLink": [
        58
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventOrderByWithGroupByInput": {
      "aggregate": [
        215
      ],
      "title": [
        59
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "isCanceled": [
        59
      ],
      "isFullDay": [
        59
      ],
      "startsAt": [
        110
      ],
      "endsAt": [
        110
      ],
      "externalCreatedAt": [
        110
      ],
      "externalUpdatedAt": [
        110
      ],
      "description": [
        59
      ],
      "location": [
        59
      ],
      "iCalUid": [
        59
      ],
      "conferenceSolution": [
        59
      ],
      "conferenceLink": [
        58
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesTitle": [
        59
      ],
      "countEmptyTitle": [
        59
      ],
      "countNotEmptyTitle": [
        59
      ],
      "percentageEmptyTitle": [
        59
      ],
      "percentageNotEmptyTitle": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesIsCanceled": [
        59
      ],
      "countEmptyIsCanceled": [
        59
      ],
      "countNotEmptyIsCanceled": [
        59
      ],
      "percentageEmptyIsCanceled": [
        59
      ],
      "percentageNotEmptyIsCanceled": [
        59
      ],
      "countTrueIsCanceled": [
        59
      ],
      "countFalseIsCanceled": [
        59
      ],
      "countUniqueValuesIsFullDay": [
        59
      ],
      "countEmptyIsFullDay": [
        59
      ],
      "countNotEmptyIsFullDay": [
        59
      ],
      "percentageEmptyIsFullDay": [
        59
      ],
      "percentageNotEmptyIsFullDay": [
        59
      ],
      "countTrueIsFullDay": [
        59
      ],
      "countFalseIsFullDay": [
        59
      ],
      "countUniqueValuesStartsAt": [
        59
      ],
      "countEmptyStartsAt": [
        59
      ],
      "countNotEmptyStartsAt": [
        59
      ],
      "percentageEmptyStartsAt": [
        59
      ],
      "percentageNotEmptyStartsAt": [
        59
      ],
      "minStartsAt": [
        59
      ],
      "maxStartsAt": [
        59
      ],
      "countUniqueValuesEndsAt": [
        59
      ],
      "countEmptyEndsAt": [
        59
      ],
      "countNotEmptyEndsAt": [
        59
      ],
      "percentageEmptyEndsAt": [
        59
      ],
      "percentageNotEmptyEndsAt": [
        59
      ],
      "minEndsAt": [
        59
      ],
      "maxEndsAt": [
        59
      ],
      "countUniqueValuesExternalCreatedAt": [
        59
      ],
      "countEmptyExternalCreatedAt": [
        59
      ],
      "countNotEmptyExternalCreatedAt": [
        59
      ],
      "percentageEmptyExternalCreatedAt": [
        59
      ],
      "percentageNotEmptyExternalCreatedAt": [
        59
      ],
      "minExternalCreatedAt": [
        59
      ],
      "maxExternalCreatedAt": [
        59
      ],
      "countUniqueValuesExternalUpdatedAt": [
        59
      ],
      "countEmptyExternalUpdatedAt": [
        59
      ],
      "countNotEmptyExternalUpdatedAt": [
        59
      ],
      "percentageEmptyExternalUpdatedAt": [
        59
      ],
      "percentageNotEmptyExternalUpdatedAt": [
        59
      ],
      "minExternalUpdatedAt": [
        59
      ],
      "maxExternalUpdatedAt": [
        59
      ],
      "countUniqueValuesDescription": [
        59
      ],
      "countEmptyDescription": [
        59
      ],
      "countNotEmptyDescription": [
        59
      ],
      "percentageEmptyDescription": [
        59
      ],
      "percentageNotEmptyDescription": [
        59
      ],
      "countUniqueValuesLocation": [
        59
      ],
      "countEmptyLocation": [
        59
      ],
      "countNotEmptyLocation": [
        59
      ],
      "percentageEmptyLocation": [
        59
      ],
      "percentageNotEmptyLocation": [
        59
      ],
      "countUniqueValuesICalUid": [
        59
      ],
      "countEmptyICalUid": [
        59
      ],
      "countNotEmptyICalUid": [
        59
      ],
      "percentageEmptyICalUid": [
        59
      ],
      "percentageNotEmptyICalUid": [
        59
      ],
      "countUniqueValuesConferenceSolution": [
        59
      ],
      "countEmptyConferenceSolution": [
        59
      ],
      "countNotEmptyConferenceSolution": [
        59
      ],
      "percentageEmptyConferenceSolution": [
        59
      ],
      "percentageNotEmptyConferenceSolution": [
        59
      ],
      "countUniqueValuesConferenceLink": [
        59
      ],
      "countEmptyConferenceLink": [
        59
      ],
      "countNotEmptyConferenceLink": [
        59
      ],
      "percentageEmptyConferenceLink": [
        59
      ],
      "percentageNotEmptyConferenceLink": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "CalendarEventGroupByInput": {
      "title": [
        6
      ],
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "isCanceled": [
        6
      ],
      "isFullDay": [
        6
      ],
      "startsAt": [
        109
      ],
      "endsAt": [
        109
      ],
      "externalCreatedAt": [
        109
      ],
      "externalUpdatedAt": [
        109
      ],
      "description": [
        6
      ],
      "location": [
        6
      ],
      "iCalUid": [
        6
      ],
      "conferenceSolution": [
        6
      ],
      "conferenceLink": [
        60
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccount": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "provider": [
        1
      ],
      "accessToken": [
        1
      ],
      "refreshToken": [
        1
      ],
      "lastSyncHistoryId": [
        1
      ],
      "authFailedAt": [
        7
      ],
      "lastCredentialsRefreshedAt": [
        7
      ],
      "handleAliases": [
        1
      ],
      "scopes": [
        1
      ],
      "connectionParameters": [
        25
      ],
      "accountOwnerId": [
        22
      ],
      "calendarChannels": [
        166,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            173
          ],
          "orderBy": [
            181,
            "[CalendarChannelOrderByInput]"
          ]
        }
      ],
      "accountOwner": [
        551
      ],
      "messageChannels": [
        318,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            325
          ],
          "orderBy": [
            326,
            "[MessageChannelOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountEdge": {
      "node": [
        217
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesProvider": [
        10
      ],
      "countEmptyProvider": [
        10
      ],
      "countNotEmptyProvider": [
        10
      ],
      "percentageEmptyProvider": [
        13
      ],
      "percentageNotEmptyProvider": [
        13
      ],
      "countUniqueValuesAccessToken": [
        10
      ],
      "countEmptyAccessToken": [
        10
      ],
      "countNotEmptyAccessToken": [
        10
      ],
      "percentageEmptyAccessToken": [
        13
      ],
      "percentageNotEmptyAccessToken": [
        13
      ],
      "countUniqueValuesRefreshToken": [
        10
      ],
      "countEmptyRefreshToken": [
        10
      ],
      "countNotEmptyRefreshToken": [
        10
      ],
      "percentageEmptyRefreshToken": [
        13
      ],
      "percentageNotEmptyRefreshToken": [
        13
      ],
      "countUniqueValuesLastSyncHistoryId": [
        10
      ],
      "countEmptyLastSyncHistoryId": [
        10
      ],
      "countNotEmptyLastSyncHistoryId": [
        10
      ],
      "percentageEmptyLastSyncHistoryId": [
        13
      ],
      "percentageNotEmptyLastSyncHistoryId": [
        13
      ],
      "countUniqueValuesAuthFailedAt": [
        10
      ],
      "countEmptyAuthFailedAt": [
        10
      ],
      "countNotEmptyAuthFailedAt": [
        10
      ],
      "percentageEmptyAuthFailedAt": [
        13
      ],
      "percentageNotEmptyAuthFailedAt": [
        13
      ],
      "minAuthFailedAt": [
        7
      ],
      "maxAuthFailedAt": [
        7
      ],
      "countUniqueValuesLastCredentialsRefreshedAt": [
        10
      ],
      "countEmptyLastCredentialsRefreshedAt": [
        10
      ],
      "countNotEmptyLastCredentialsRefreshedAt": [
        10
      ],
      "percentageEmptyLastCredentialsRefreshedAt": [
        13
      ],
      "percentageNotEmptyLastCredentialsRefreshedAt": [
        13
      ],
      "minLastCredentialsRefreshedAt": [
        7
      ],
      "maxLastCredentialsRefreshedAt": [
        7
      ],
      "countUniqueValuesHandleAliases": [
        10
      ],
      "countEmptyHandleAliases": [
        10
      ],
      "countNotEmptyHandleAliases": [
        10
      ],
      "percentageEmptyHandleAliases": [
        13
      ],
      "percentageNotEmptyHandleAliases": [
        13
      ],
      "countUniqueValuesScopes": [
        10
      ],
      "countEmptyScopes": [
        10
      ],
      "countNotEmptyScopes": [
        10
      ],
      "percentageEmptyScopes": [
        13
      ],
      "percentageNotEmptyScopes": [
        13
      ],
      "countUniqueValuesConnectionParameters": [
        10
      ],
      "countEmptyConnectionParameters": [
        10
      ],
      "countNotEmptyConnectionParameters": [
        10
      ],
      "percentageEmptyConnectionParameters": [
        13
      ],
      "percentageNotEmptyConnectionParameters": [
        13
      ],
      "edges": [
        218
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesProvider": [
        10
      ],
      "countEmptyProvider": [
        10
      ],
      "countNotEmptyProvider": [
        10
      ],
      "percentageEmptyProvider": [
        13
      ],
      "percentageNotEmptyProvider": [
        13
      ],
      "countUniqueValuesAccessToken": [
        10
      ],
      "countEmptyAccessToken": [
        10
      ],
      "countNotEmptyAccessToken": [
        10
      ],
      "percentageEmptyAccessToken": [
        13
      ],
      "percentageNotEmptyAccessToken": [
        13
      ],
      "countUniqueValuesRefreshToken": [
        10
      ],
      "countEmptyRefreshToken": [
        10
      ],
      "countNotEmptyRefreshToken": [
        10
      ],
      "percentageEmptyRefreshToken": [
        13
      ],
      "percentageNotEmptyRefreshToken": [
        13
      ],
      "countUniqueValuesLastSyncHistoryId": [
        10
      ],
      "countEmptyLastSyncHistoryId": [
        10
      ],
      "countNotEmptyLastSyncHistoryId": [
        10
      ],
      "percentageEmptyLastSyncHistoryId": [
        13
      ],
      "percentageNotEmptyLastSyncHistoryId": [
        13
      ],
      "countUniqueValuesAuthFailedAt": [
        10
      ],
      "countEmptyAuthFailedAt": [
        10
      ],
      "countNotEmptyAuthFailedAt": [
        10
      ],
      "percentageEmptyAuthFailedAt": [
        13
      ],
      "percentageNotEmptyAuthFailedAt": [
        13
      ],
      "minAuthFailedAt": [
        7
      ],
      "maxAuthFailedAt": [
        7
      ],
      "countUniqueValuesLastCredentialsRefreshedAt": [
        10
      ],
      "countEmptyLastCredentialsRefreshedAt": [
        10
      ],
      "countNotEmptyLastCredentialsRefreshedAt": [
        10
      ],
      "percentageEmptyLastCredentialsRefreshedAt": [
        13
      ],
      "percentageNotEmptyLastCredentialsRefreshedAt": [
        13
      ],
      "minLastCredentialsRefreshedAt": [
        7
      ],
      "maxLastCredentialsRefreshedAt": [
        7
      ],
      "countUniqueValuesHandleAliases": [
        10
      ],
      "countEmptyHandleAliases": [
        10
      ],
      "countNotEmptyHandleAliases": [
        10
      ],
      "percentageEmptyHandleAliases": [
        13
      ],
      "percentageNotEmptyHandleAliases": [
        13
      ],
      "countUniqueValuesScopes": [
        10
      ],
      "countEmptyScopes": [
        10
      ],
      "countNotEmptyScopes": [
        10
      ],
      "percentageEmptyScopes": [
        13
      ],
      "percentageNotEmptyScopes": [
        13
      ],
      "countUniqueValuesConnectionParameters": [
        10
      ],
      "countEmptyConnectionParameters": [
        10
      ],
      "countNotEmptyConnectionParameters": [
        10
      ],
      "percentageEmptyConnectionParameters": [
        13
      ],
      "percentageNotEmptyConnectionParameters": [
        13
      ],
      "edges": [
        218
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountRelationInput": {
      "connect": [
        222
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountConnectInput": {
      "where": [
        223
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "provider": [
        1
      ],
      "accessToken": [
        1
      ],
      "refreshToken": [
        1
      ],
      "lastSyncHistoryId": [
        1
      ],
      "authFailedAt": [
        7
      ],
      "lastCredentialsRefreshedAt": [
        7
      ],
      "handleAliases": [
        1
      ],
      "scopes": [
        1
      ],
      "connectionParameters": [
        25
      ],
      "accountOwnerId": [
        22
      ],
      "accountOwner": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        1
      ],
      "provider": [
        1
      ],
      "accessToken": [
        1
      ],
      "refreshToken": [
        1
      ],
      "lastSyncHistoryId": [
        1
      ],
      "authFailedAt": [
        7
      ],
      "lastCredentialsRefreshedAt": [
        7
      ],
      "handleAliases": [
        1
      ],
      "scopes": [
        1
      ],
      "connectionParameters": [
        25
      ],
      "accountOwnerId": [
        22
      ],
      "accountOwner": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "provider": [
        56
      ],
      "accessToken": [
        56
      ],
      "refreshToken": [
        56
      ],
      "lastSyncHistoryId": [
        56
      ],
      "authFailedAt": [
        7
      ],
      "lastCredentialsRefreshedAt": [
        7
      ],
      "handleAliases": [
        56
      ],
      "scopes": [
        227
      ],
      "connectionParameters": [
        57
      ],
      "calendarChannels": [
        228
      ],
      "accountOwnerId": [
        33
      ],
      "messageChannels": [
        229
      ],
      "and": [
        226
      ],
      "or": [
        226
      ],
      "not": [
        226
      ],
      "__typename": [
        1
      ]
    },
    "ArrayFilter": {
      "containsIlike": [
        1
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "calendarChannelsOneToManyFilter_b5d3b537": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "visibility": [
        174
      ],
      "isContactAutoCreationEnabled": [
        175
      ],
      "contactAutoCreationPolicy": [
        176
      ],
      "isSyncEnabled": [
        175
      ],
      "syncCursor": [
        56
      ],
      "syncStatus": [
        177
      ],
      "syncStage": [
        178
      ],
      "syncStageStartedAt": [
        7
      ],
      "syncedAt": [
        7
      ],
      "throttleFailureCount": [
        179
      ],
      "calendarChannelEventAssociations": [
        180
      ],
      "connectedAccountId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "messageChannelsOneToManyFilter_f74abfab": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "visibility": [
        230
      ],
      "handle": [
        56
      ],
      "type": [
        231
      ],
      "isContactAutoCreationEnabled": [
        175
      ],
      "contactAutoCreationPolicy": [
        232
      ],
      "messageFolderImportPolicy": [
        233
      ],
      "excludeNonProfessionalEmails": [
        175
      ],
      "excludeGroupEmails": [
        175
      ],
      "pendingGroupEmailsAction": [
        234
      ],
      "isSyncEnabled": [
        175
      ],
      "syncCursor": [
        56
      ],
      "syncedAt": [
        7
      ],
      "syncStatus": [
        235
      ],
      "syncStage": [
        236
      ],
      "syncStageStartedAt": [
        7
      ],
      "throttleFailureCount": [
        179
      ],
      "connectedAccountId": [
        33
      ],
      "messageChannelMessageAssociations": [
        237
      ],
      "messageFolders": [
        239
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelVisibilityEnumFilter": {
      "eq": [
        309
      ],
      "neq": [
        309
      ],
      "in": [
        309
      ],
      "containsAny": [
        309
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelTypeEnumFilter": {
      "eq": [
        310
      ],
      "neq": [
        310
      ],
      "in": [
        310
      ],
      "containsAny": [
        310
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelContactAutoCreationPolicyEnumFilter": {
      "eq": [
        311
      ],
      "neq": [
        311
      ],
      "in": [
        311
      ],
      "containsAny": [
        311
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageFolderImportPolicyEnumFilter": {
      "eq": [
        312
      ],
      "neq": [
        312
      ],
      "in": [
        312
      ],
      "containsAny": [
        312
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelPendingGroupEmailsActionEnumFilter": {
      "eq": [
        313
      ],
      "neq": [
        313
      ],
      "in": [
        313
      ],
      "containsAny": [
        313
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelSyncStatusEnumFilter": {
      "eq": [
        314
      ],
      "neq": [
        314
      ],
      "in": [
        314
      ],
      "containsAny": [
        314
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelSyncStageEnumFilter": {
      "eq": [
        315
      ],
      "neq": [
        315
      ],
      "in": [
        315
      ],
      "containsAny": [
        315
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "messageChannelMessageAssociationsOneToManyFilter_ae684e34": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messageExternalId": [
        56
      ],
      "messageThreadExternalId": [
        56
      ],
      "direction": [
        238
      ],
      "messageId": [
        33
      ],
      "messageChannelId": [
        33
      ],
      "messageThreadId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationDirectionEnumFilter": {
      "eq": [
        294
      ],
      "neq": [
        294
      ],
      "in": [
        294
      ],
      "containsAny": [
        294
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "messageFoldersOneToManyFilter_f73a884c": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "syncCursor": [
        56
      ],
      "isSentFolder": [
        175
      ],
      "isSynced": [
        175
      ],
      "parentFolderId": [
        56
      ],
      "externalId": [
        56
      ],
      "pendingSyncAction": [
        240
      ],
      "messageChannelId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderPendingSyncActionEnumFilter": {
      "eq": [
        330
      ],
      "neq": [
        330
      ],
      "in": [
        330
      ],
      "containsAny": [
        330
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "handle": [
        59
      ],
      "provider": [
        59
      ],
      "accessToken": [
        59
      ],
      "refreshToken": [
        59
      ],
      "lastSyncHistoryId": [
        59
      ],
      "authFailedAt": [
        59
      ],
      "lastCredentialsRefreshedAt": [
        59
      ],
      "handleAliases": [
        59
      ],
      "scopes": [
        59
      ],
      "connectionParameters": [
        59
      ],
      "accountOwnerId": [
        59
      ],
      "accountOwner": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountOrderByWithGroupByInput": {
      "aggregate": [
        243
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "handle": [
        59
      ],
      "provider": [
        59
      ],
      "accessToken": [
        59
      ],
      "refreshToken": [
        59
      ],
      "lastSyncHistoryId": [
        59
      ],
      "authFailedAt": [
        110
      ],
      "lastCredentialsRefreshedAt": [
        110
      ],
      "handleAliases": [
        59
      ],
      "scopes": [
        59
      ],
      "connectionParameters": [
        59
      ],
      "accountOwnerId": [
        59
      ],
      "accountOwner": [
        596
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesHandle": [
        59
      ],
      "countEmptyHandle": [
        59
      ],
      "countNotEmptyHandle": [
        59
      ],
      "percentageEmptyHandle": [
        59
      ],
      "percentageNotEmptyHandle": [
        59
      ],
      "countUniqueValuesProvider": [
        59
      ],
      "countEmptyProvider": [
        59
      ],
      "countNotEmptyProvider": [
        59
      ],
      "percentageEmptyProvider": [
        59
      ],
      "percentageNotEmptyProvider": [
        59
      ],
      "countUniqueValuesAccessToken": [
        59
      ],
      "countEmptyAccessToken": [
        59
      ],
      "countNotEmptyAccessToken": [
        59
      ],
      "percentageEmptyAccessToken": [
        59
      ],
      "percentageNotEmptyAccessToken": [
        59
      ],
      "countUniqueValuesRefreshToken": [
        59
      ],
      "countEmptyRefreshToken": [
        59
      ],
      "countNotEmptyRefreshToken": [
        59
      ],
      "percentageEmptyRefreshToken": [
        59
      ],
      "percentageNotEmptyRefreshToken": [
        59
      ],
      "countUniqueValuesLastSyncHistoryId": [
        59
      ],
      "countEmptyLastSyncHistoryId": [
        59
      ],
      "countNotEmptyLastSyncHistoryId": [
        59
      ],
      "percentageEmptyLastSyncHistoryId": [
        59
      ],
      "percentageNotEmptyLastSyncHistoryId": [
        59
      ],
      "countUniqueValuesAuthFailedAt": [
        59
      ],
      "countEmptyAuthFailedAt": [
        59
      ],
      "countNotEmptyAuthFailedAt": [
        59
      ],
      "percentageEmptyAuthFailedAt": [
        59
      ],
      "percentageNotEmptyAuthFailedAt": [
        59
      ],
      "minAuthFailedAt": [
        59
      ],
      "maxAuthFailedAt": [
        59
      ],
      "countUniqueValuesLastCredentialsRefreshedAt": [
        59
      ],
      "countEmptyLastCredentialsRefreshedAt": [
        59
      ],
      "countNotEmptyLastCredentialsRefreshedAt": [
        59
      ],
      "percentageEmptyLastCredentialsRefreshedAt": [
        59
      ],
      "percentageNotEmptyLastCredentialsRefreshedAt": [
        59
      ],
      "minLastCredentialsRefreshedAt": [
        59
      ],
      "maxLastCredentialsRefreshedAt": [
        59
      ],
      "countUniqueValuesHandleAliases": [
        59
      ],
      "countEmptyHandleAliases": [
        59
      ],
      "countNotEmptyHandleAliases": [
        59
      ],
      "percentageEmptyHandleAliases": [
        59
      ],
      "percentageNotEmptyHandleAliases": [
        59
      ],
      "countUniqueValuesScopes": [
        59
      ],
      "countEmptyScopes": [
        59
      ],
      "countNotEmptyScopes": [
        59
      ],
      "percentageEmptyScopes": [
        59
      ],
      "percentageNotEmptyScopes": [
        59
      ],
      "countUniqueValuesConnectionParameters": [
        59
      ],
      "countEmptyConnectionParameters": [
        59
      ],
      "countNotEmptyConnectionParameters": [
        59
      ],
      "percentageEmptyConnectionParameters": [
        59
      ],
      "percentageNotEmptyConnectionParameters": [
        59
      ],
      "accountOwnerId": [
        59
      ],
      "accountOwner": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedAccountGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "handle": [
        6
      ],
      "provider": [
        6
      ],
      "accessToken": [
        6
      ],
      "refreshToken": [
        6
      ],
      "lastSyncHistoryId": [
        6
      ],
      "authFailedAt": [
        109
      ],
      "lastCredentialsRefreshedAt": [
        109
      ],
      "handleAliases": [
        6
      ],
      "scopes": [
        6
      ],
      "connectionParameters": [
        6
      ],
      "accountOwner": [
        598
      ],
      "__typename": [
        1
      ]
    },
    "Dashboard": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "title": [
        1
      ],
      "position": [
        246
      ],
      "pageLayoutId": [
        2
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "searchVector": [
        247
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "Position": {},
    "TSVector": {},
    "DashboardEdge": {
      "node": [
        245
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "DashboardConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesPageLayoutId": [
        10
      ],
      "countEmptyPageLayoutId": [
        10
      ],
      "countNotEmptyPageLayoutId": [
        10
      ],
      "percentageEmptyPageLayoutId": [
        13
      ],
      "percentageNotEmptyPageLayoutId": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        248
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "DashboardGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesPageLayoutId": [
        10
      ],
      "countEmptyPageLayoutId": [
        10
      ],
      "countNotEmptyPageLayoutId": [
        10
      ],
      "percentageEmptyPageLayoutId": [
        13
      ],
      "percentageNotEmptyPageLayoutId": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        248
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "DashboardRelationInput": {
      "connect": [
        252
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "DashboardConnectInput": {
      "where": [
        253
      ],
      "__typename": [
        1
      ]
    },
    "DashboardWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "DashboardCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "title": [
        1
      ],
      "position": [
        246
      ],
      "pageLayoutId": [
        2
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "searchVector": [
        247
      ],
      "__typename": [
        1
      ]
    },
    "DashboardUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "title": [
        1
      ],
      "position": [
        246
      ],
      "pageLayoutId": [
        2
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "searchVector": [
        247
      ],
      "__typename": [
        1
      ]
    },
    "DashboardFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "title": [
        56
      ],
      "position": [
        179
      ],
      "pageLayoutId": [
        33
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        258
      ],
      "favorites": [
        259
      ],
      "timelineActivities": [
        260
      ],
      "and": [
        256
      ],
      "or": [
        256
      ],
      "not": [
        256
      ],
      "__typename": [
        1
      ]
    },
    "TSVectorFilter": {
      "search": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_8f4bbcc3": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_9d76c24c": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_364da2b8": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "DashboardOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "title": [
        59
      ],
      "position": [
        59
      ],
      "pageLayoutId": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "DashboardOrderByWithGroupByInput": {
      "aggregate": [
        263
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "title": [
        59
      ],
      "position": [
        59
      ],
      "pageLayoutId": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "DashboardOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesTitle": [
        59
      ],
      "countEmptyTitle": [
        59
      ],
      "countNotEmptyTitle": [
        59
      ],
      "percentageEmptyTitle": [
        59
      ],
      "percentageNotEmptyTitle": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesPageLayoutId": [
        59
      ],
      "countEmptyPageLayoutId": [
        59
      ],
      "countNotEmptyPageLayoutId": [
        59
      ],
      "percentageEmptyPageLayoutId": [
        59
      ],
      "percentageNotEmptyPageLayoutId": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "DashboardGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "title": [
        6
      ],
      "position": [
        6
      ],
      "pageLayoutId": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "searchVector": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "Favorite": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        13
      ],
      "viewId": [
        2
      ],
      "companyId": [
        22
      ],
      "dashboardId": [
        22
      ],
      "forWorkspaceMemberId": [
        22
      ],
      "personId": [
        22
      ],
      "opportunityId": [
        22
      ],
      "workflowId": [
        22
      ],
      "workflowVersionId": [
        22
      ],
      "workflowRunId": [
        22
      ],
      "taskId": [
        22
      ],
      "noteId": [
        22
      ],
      "favoriteFolderId": [
        22
      ],
      "targetQaScorecardId": [
        22
      ],
      "company": [
        599
      ],
      "dashboard": [
        245
      ],
      "forWorkspaceMember": [
        551
      ],
      "person": [
        629
      ],
      "opportunity": [
        615
      ],
      "workflow": [
        476
      ],
      "workflowVersion": [
        534
      ],
      "workflowRun": [
        21
      ],
      "task": [
        428
      ],
      "note": [
        395
      ],
      "favoriteFolder": [
        279
      ],
      "targetQaScorecard": [
        647
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteEdge": {
      "node": [
        265
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "minPosition": [
        13
      ],
      "maxPosition": [
        13
      ],
      "avgPosition": [
        13
      ],
      "sumPosition": [
        13
      ],
      "countUniqueValuesViewId": [
        10
      ],
      "countEmptyViewId": [
        10
      ],
      "countNotEmptyViewId": [
        10
      ],
      "percentageEmptyViewId": [
        13
      ],
      "percentageNotEmptyViewId": [
        13
      ],
      "edges": [
        266
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "minPosition": [
        13
      ],
      "maxPosition": [
        13
      ],
      "avgPosition": [
        13
      ],
      "sumPosition": [
        13
      ],
      "countUniqueValuesViewId": [
        10
      ],
      "countEmptyViewId": [
        10
      ],
      "countNotEmptyViewId": [
        10
      ],
      "percentageEmptyViewId": [
        13
      ],
      "percentageNotEmptyViewId": [
        13
      ],
      "edges": [
        266
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteRelationInput": {
      "connect": [
        270
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteConnectInput": {
      "where": [
        271
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        13
      ],
      "viewId": [
        2
      ],
      "companyId": [
        22
      ],
      "company": [
        603
      ],
      "dashboardId": [
        22
      ],
      "dashboard": [
        251
      ],
      "forWorkspaceMemberId": [
        22
      ],
      "forWorkspaceMember": [
        555
      ],
      "personId": [
        22
      ],
      "person": [
        633
      ],
      "opportunityId": [
        22
      ],
      "opportunity": [
        619
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "workflowVersionId": [
        22
      ],
      "workflowVersion": [
        538
      ],
      "workflowRunId": [
        22
      ],
      "workflowRun": [
        523
      ],
      "taskId": [
        22
      ],
      "task": [
        432
      ],
      "noteId": [
        22
      ],
      "note": [
        399
      ],
      "favoriteFolderId": [
        22
      ],
      "favoriteFolder": [
        283
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        13
      ],
      "viewId": [
        2
      ],
      "companyId": [
        22
      ],
      "company": [
        603
      ],
      "dashboardId": [
        22
      ],
      "dashboard": [
        251
      ],
      "forWorkspaceMemberId": [
        22
      ],
      "forWorkspaceMember": [
        555
      ],
      "personId": [
        22
      ],
      "person": [
        633
      ],
      "opportunityId": [
        22
      ],
      "opportunity": [
        619
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "workflowVersionId": [
        22
      ],
      "workflowVersion": [
        538
      ],
      "workflowRunId": [
        22
      ],
      "workflowRun": [
        523
      ],
      "taskId": [
        22
      ],
      "task": [
        432
      ],
      "noteId": [
        22
      ],
      "note": [
        399
      ],
      "favoriteFolderId": [
        22
      ],
      "favoriteFolder": [
        283
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "and": [
        274
      ],
      "or": [
        274
      ],
      "not": [
        274
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "position": [
        59
      ],
      "viewId": [
        59
      ],
      "companyId": [
        59
      ],
      "company": [
        610
      ],
      "dashboardId": [
        59
      ],
      "dashboard": [
        261
      ],
      "forWorkspaceMemberId": [
        59
      ],
      "forWorkspaceMember": [
        595
      ],
      "personId": [
        59
      ],
      "person": [
        640
      ],
      "opportunityId": [
        59
      ],
      "opportunity": [
        625
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "workflowVersionId": [
        59
      ],
      "workflowVersion": [
        544
      ],
      "workflowRunId": [
        59
      ],
      "workflowRun": [
        529
      ],
      "taskId": [
        59
      ],
      "task": [
        443
      ],
      "noteId": [
        59
      ],
      "note": [
        409
      ],
      "favoriteFolderId": [
        59
      ],
      "favoriteFolder": [
        290
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteOrderByWithGroupByInput": {
      "aggregate": [
        277
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "position": [
        59
      ],
      "viewId": [
        59
      ],
      "companyId": [
        59
      ],
      "company": [
        611
      ],
      "dashboardId": [
        59
      ],
      "dashboard": [
        262
      ],
      "forWorkspaceMemberId": [
        59
      ],
      "forWorkspaceMember": [
        596
      ],
      "personId": [
        59
      ],
      "person": [
        641
      ],
      "opportunityId": [
        59
      ],
      "opportunity": [
        626
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        502
      ],
      "workflowVersionId": [
        59
      ],
      "workflowVersion": [
        545
      ],
      "workflowRunId": [
        59
      ],
      "workflowRun": [
        530
      ],
      "taskId": [
        59
      ],
      "task": [
        444
      ],
      "noteId": [
        59
      ],
      "note": [
        410
      ],
      "favoriteFolderId": [
        59
      ],
      "favoriteFolder": [
        291
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        666
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "minPosition": [
        59
      ],
      "maxPosition": [
        59
      ],
      "avgPosition": [
        59
      ],
      "sumPosition": [
        59
      ],
      "countUniqueValuesViewId": [
        59
      ],
      "countEmptyViewId": [
        59
      ],
      "countNotEmptyViewId": [
        59
      ],
      "percentageEmptyViewId": [
        59
      ],
      "percentageNotEmptyViewId": [
        59
      ],
      "companyId": [
        59
      ],
      "company": [
        610
      ],
      "dashboardId": [
        59
      ],
      "dashboard": [
        261
      ],
      "forWorkspaceMemberId": [
        59
      ],
      "forWorkspaceMember": [
        595
      ],
      "personId": [
        59
      ],
      "person": [
        640
      ],
      "opportunityId": [
        59
      ],
      "opportunity": [
        625
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "workflowVersionId": [
        59
      ],
      "workflowVersion": [
        544
      ],
      "workflowRunId": [
        59
      ],
      "workflowRun": [
        529
      ],
      "taskId": [
        59
      ],
      "task": [
        443
      ],
      "noteId": [
        59
      ],
      "note": [
        409
      ],
      "favoriteFolderId": [
        59
      ],
      "favoriteFolder": [
        290
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "position": [
        6
      ],
      "viewId": [
        6
      ],
      "company": [
        613
      ],
      "dashboard": [
        264
      ],
      "forWorkspaceMember": [
        598
      ],
      "person": [
        643
      ],
      "opportunity": [
        628
      ],
      "workflow": [
        504
      ],
      "workflowVersion": [
        547
      ],
      "workflowRun": [
        532
      ],
      "task": [
        446
      ],
      "note": [
        412
      ],
      "favoriteFolder": [
        293
      ],
      "targetQaScorecard": [
        668
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolder": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        13
      ],
      "name": [
        1
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderEdge": {
      "node": [
        279
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "minPosition": [
        13
      ],
      "maxPosition": [
        13
      ],
      "avgPosition": [
        13
      ],
      "sumPosition": [
        13
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "edges": [
        280
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "minPosition": [
        13
      ],
      "maxPosition": [
        13
      ],
      "avgPosition": [
        13
      ],
      "sumPosition": [
        13
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "edges": [
        280
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderRelationInput": {
      "connect": [
        284
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderConnectInput": {
      "where": [
        285
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        13
      ],
      "name": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        13
      ],
      "name": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "name": [
        56
      ],
      "favorites": [
        289
      ],
      "and": [
        288
      ],
      "or": [
        288
      ],
      "not": [
        288
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_dbfe7819": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "position": [
        59
      ],
      "name": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderOrderByWithGroupByInput": {
      "aggregate": [
        292
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "position": [
        59
      ],
      "name": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "minPosition": [
        59
      ],
      "maxPosition": [
        59
      ],
      "avgPosition": [
        59
      ],
      "sumPosition": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "FavoriteFolderGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "position": [
        6
      ],
      "name": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationDirectionEnum": {},
    "MessageChannelMessageAssociation": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messageExternalId": [
        1
      ],
      "messageThreadExternalId": [
        1
      ],
      "direction": [
        294
      ],
      "messageId": [
        22
      ],
      "messageChannelId": [
        22
      ],
      "messageThreadId": [
        22
      ],
      "message": [
        381
      ],
      "messageChannel": [
        316
      ],
      "messageThread": [
        361
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationEdge": {
      "node": [
        295
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesMessageExternalId": [
        10
      ],
      "countEmptyMessageExternalId": [
        10
      ],
      "countNotEmptyMessageExternalId": [
        10
      ],
      "percentageEmptyMessageExternalId": [
        13
      ],
      "percentageNotEmptyMessageExternalId": [
        13
      ],
      "countUniqueValuesMessageThreadExternalId": [
        10
      ],
      "countEmptyMessageThreadExternalId": [
        10
      ],
      "countNotEmptyMessageThreadExternalId": [
        10
      ],
      "percentageEmptyMessageThreadExternalId": [
        13
      ],
      "percentageNotEmptyMessageThreadExternalId": [
        13
      ],
      "countUniqueValuesDirection": [
        10
      ],
      "countEmptyDirection": [
        10
      ],
      "countNotEmptyDirection": [
        10
      ],
      "percentageEmptyDirection": [
        13
      ],
      "percentageNotEmptyDirection": [
        13
      ],
      "edges": [
        296
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesMessageExternalId": [
        10
      ],
      "countEmptyMessageExternalId": [
        10
      ],
      "countNotEmptyMessageExternalId": [
        10
      ],
      "percentageEmptyMessageExternalId": [
        13
      ],
      "percentageNotEmptyMessageExternalId": [
        13
      ],
      "countUniqueValuesMessageThreadExternalId": [
        10
      ],
      "countEmptyMessageThreadExternalId": [
        10
      ],
      "countNotEmptyMessageThreadExternalId": [
        10
      ],
      "percentageEmptyMessageThreadExternalId": [
        13
      ],
      "percentageNotEmptyMessageThreadExternalId": [
        13
      ],
      "countUniqueValuesDirection": [
        10
      ],
      "countEmptyDirection": [
        10
      ],
      "countNotEmptyDirection": [
        10
      ],
      "percentageEmptyDirection": [
        13
      ],
      "percentageNotEmptyDirection": [
        13
      ],
      "edges": [
        296
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationRelationInput": {
      "connect": [
        300
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationConnectInput": {
      "where": [
        301
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messageExternalId": [
        1
      ],
      "messageThreadExternalId": [
        1
      ],
      "direction": [
        294
      ],
      "messageId": [
        22
      ],
      "message": [
        385
      ],
      "messageChannelId": [
        22
      ],
      "messageChannel": [
        320
      ],
      "messageThreadId": [
        22
      ],
      "messageThread": [
        365
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messageExternalId": [
        1
      ],
      "messageThreadExternalId": [
        1
      ],
      "direction": [
        294
      ],
      "messageId": [
        22
      ],
      "message": [
        385
      ],
      "messageChannelId": [
        22
      ],
      "messageChannel": [
        320
      ],
      "messageThreadId": [
        22
      ],
      "messageThread": [
        365
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messageExternalId": [
        56
      ],
      "messageThreadExternalId": [
        56
      ],
      "direction": [
        238
      ],
      "messageId": [
        33
      ],
      "messageChannelId": [
        33
      ],
      "messageThreadId": [
        33
      ],
      "and": [
        304
      ],
      "or": [
        304
      ],
      "not": [
        304
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "messageExternalId": [
        59
      ],
      "messageThreadExternalId": [
        59
      ],
      "direction": [
        59
      ],
      "messageId": [
        59
      ],
      "message": [
        391
      ],
      "messageChannelId": [
        59
      ],
      "messageChannel": [
        326
      ],
      "messageThreadId": [
        59
      ],
      "messageThread": [
        376
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationOrderByWithGroupByInput": {
      "aggregate": [
        307
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "messageExternalId": [
        59
      ],
      "messageThreadExternalId": [
        59
      ],
      "direction": [
        59
      ],
      "messageId": [
        59
      ],
      "message": [
        392
      ],
      "messageChannelId": [
        59
      ],
      "messageChannel": [
        327
      ],
      "messageThreadId": [
        59
      ],
      "messageThread": [
        377
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesMessageExternalId": [
        59
      ],
      "countEmptyMessageExternalId": [
        59
      ],
      "countNotEmptyMessageExternalId": [
        59
      ],
      "percentageEmptyMessageExternalId": [
        59
      ],
      "percentageNotEmptyMessageExternalId": [
        59
      ],
      "countUniqueValuesMessageThreadExternalId": [
        59
      ],
      "countEmptyMessageThreadExternalId": [
        59
      ],
      "countNotEmptyMessageThreadExternalId": [
        59
      ],
      "percentageEmptyMessageThreadExternalId": [
        59
      ],
      "percentageNotEmptyMessageThreadExternalId": [
        59
      ],
      "countUniqueValuesDirection": [
        59
      ],
      "countEmptyDirection": [
        59
      ],
      "countNotEmptyDirection": [
        59
      ],
      "percentageEmptyDirection": [
        59
      ],
      "percentageNotEmptyDirection": [
        59
      ],
      "messageId": [
        59
      ],
      "message": [
        391
      ],
      "messageChannelId": [
        59
      ],
      "messageChannel": [
        326
      ],
      "messageThreadId": [
        59
      ],
      "messageThread": [
        376
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelMessageAssociationGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "messageExternalId": [
        6
      ],
      "messageThreadExternalId": [
        6
      ],
      "direction": [
        6
      ],
      "message": [
        394
      ],
      "messageChannel": [
        329
      ],
      "messageThread": [
        379
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelVisibilityEnum": {},
    "MessageChannelTypeEnum": {},
    "MessageChannelContactAutoCreationPolicyEnum": {},
    "MessageChannelMessageFolderImportPolicyEnum": {},
    "MessageChannelPendingGroupEmailsActionEnum": {},
    "MessageChannelSyncStatusEnum": {},
    "MessageChannelSyncStageEnum": {},
    "MessageChannel": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "visibility": [
        309
      ],
      "handle": [
        1
      ],
      "type": [
        310
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        311
      ],
      "messageFolderImportPolicy": [
        312
      ],
      "excludeNonProfessionalEmails": [
        6
      ],
      "excludeGroupEmails": [
        6
      ],
      "pendingGroupEmailsAction": [
        313
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        1
      ],
      "syncedAt": [
        7
      ],
      "syncStatus": [
        314
      ],
      "syncStage": [
        315
      ],
      "syncStageStartedAt": [
        7
      ],
      "throttleFailureCount": [
        13
      ],
      "connectedAccountId": [
        22
      ],
      "connectedAccount": [
        217
      ],
      "messageChannelMessageAssociations": [
        297,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            304
          ],
          "orderBy": [
            305,
            "[MessageChannelMessageAssociationOrderByInput]"
          ]
        }
      ],
      "messageFolders": [
        333,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            340
          ],
          "orderBy": [
            341,
            "[MessageFolderOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelEdge": {
      "node": [
        316
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesVisibility": [
        10
      ],
      "countEmptyVisibility": [
        10
      ],
      "countNotEmptyVisibility": [
        10
      ],
      "percentageEmptyVisibility": [
        13
      ],
      "percentageNotEmptyVisibility": [
        13
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesType": [
        10
      ],
      "countEmptyType": [
        10
      ],
      "countNotEmptyType": [
        10
      ],
      "percentageEmptyType": [
        13
      ],
      "percentageNotEmptyType": [
        13
      ],
      "countUniqueValuesIsContactAutoCreationEnabled": [
        10
      ],
      "countEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "countNotEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "percentageEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "percentageNotEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "countTrueIsContactAutoCreationEnabled": [
        10
      ],
      "countFalseIsContactAutoCreationEnabled": [
        10
      ],
      "countUniqueValuesContactAutoCreationPolicy": [
        10
      ],
      "countEmptyContactAutoCreationPolicy": [
        10
      ],
      "countNotEmptyContactAutoCreationPolicy": [
        10
      ],
      "percentageEmptyContactAutoCreationPolicy": [
        13
      ],
      "percentageNotEmptyContactAutoCreationPolicy": [
        13
      ],
      "countUniqueValuesMessageFolderImportPolicy": [
        10
      ],
      "countEmptyMessageFolderImportPolicy": [
        10
      ],
      "countNotEmptyMessageFolderImportPolicy": [
        10
      ],
      "percentageEmptyMessageFolderImportPolicy": [
        13
      ],
      "percentageNotEmptyMessageFolderImportPolicy": [
        13
      ],
      "countUniqueValuesExcludeNonProfessionalEmails": [
        10
      ],
      "countEmptyExcludeNonProfessionalEmails": [
        10
      ],
      "countNotEmptyExcludeNonProfessionalEmails": [
        10
      ],
      "percentageEmptyExcludeNonProfessionalEmails": [
        13
      ],
      "percentageNotEmptyExcludeNonProfessionalEmails": [
        13
      ],
      "countTrueExcludeNonProfessionalEmails": [
        10
      ],
      "countFalseExcludeNonProfessionalEmails": [
        10
      ],
      "countUniqueValuesExcludeGroupEmails": [
        10
      ],
      "countEmptyExcludeGroupEmails": [
        10
      ],
      "countNotEmptyExcludeGroupEmails": [
        10
      ],
      "percentageEmptyExcludeGroupEmails": [
        13
      ],
      "percentageNotEmptyExcludeGroupEmails": [
        13
      ],
      "countTrueExcludeGroupEmails": [
        10
      ],
      "countFalseExcludeGroupEmails": [
        10
      ],
      "countUniqueValuesPendingGroupEmailsAction": [
        10
      ],
      "countEmptyPendingGroupEmailsAction": [
        10
      ],
      "countNotEmptyPendingGroupEmailsAction": [
        10
      ],
      "percentageEmptyPendingGroupEmailsAction": [
        13
      ],
      "percentageNotEmptyPendingGroupEmailsAction": [
        13
      ],
      "countUniqueValuesIsSyncEnabled": [
        10
      ],
      "countEmptyIsSyncEnabled": [
        10
      ],
      "countNotEmptyIsSyncEnabled": [
        10
      ],
      "percentageEmptyIsSyncEnabled": [
        13
      ],
      "percentageNotEmptyIsSyncEnabled": [
        13
      ],
      "countTrueIsSyncEnabled": [
        10
      ],
      "countFalseIsSyncEnabled": [
        10
      ],
      "countUniqueValuesSyncCursor": [
        10
      ],
      "countEmptySyncCursor": [
        10
      ],
      "countNotEmptySyncCursor": [
        10
      ],
      "percentageEmptySyncCursor": [
        13
      ],
      "percentageNotEmptySyncCursor": [
        13
      ],
      "countUniqueValuesSyncedAt": [
        10
      ],
      "countEmptySyncedAt": [
        10
      ],
      "countNotEmptySyncedAt": [
        10
      ],
      "percentageEmptySyncedAt": [
        13
      ],
      "percentageNotEmptySyncedAt": [
        13
      ],
      "minSyncedAt": [
        7
      ],
      "maxSyncedAt": [
        7
      ],
      "countUniqueValuesSyncStatus": [
        10
      ],
      "countEmptySyncStatus": [
        10
      ],
      "countNotEmptySyncStatus": [
        10
      ],
      "percentageEmptySyncStatus": [
        13
      ],
      "percentageNotEmptySyncStatus": [
        13
      ],
      "countUniqueValuesSyncStage": [
        10
      ],
      "countEmptySyncStage": [
        10
      ],
      "countNotEmptySyncStage": [
        10
      ],
      "percentageEmptySyncStage": [
        13
      ],
      "percentageNotEmptySyncStage": [
        13
      ],
      "countUniqueValuesSyncStageStartedAt": [
        10
      ],
      "countEmptySyncStageStartedAt": [
        10
      ],
      "countNotEmptySyncStageStartedAt": [
        10
      ],
      "percentageEmptySyncStageStartedAt": [
        13
      ],
      "percentageNotEmptySyncStageStartedAt": [
        13
      ],
      "minSyncStageStartedAt": [
        7
      ],
      "maxSyncStageStartedAt": [
        7
      ],
      "countUniqueValuesThrottleFailureCount": [
        10
      ],
      "countEmptyThrottleFailureCount": [
        10
      ],
      "countNotEmptyThrottleFailureCount": [
        10
      ],
      "percentageEmptyThrottleFailureCount": [
        13
      ],
      "percentageNotEmptyThrottleFailureCount": [
        13
      ],
      "minThrottleFailureCount": [
        13
      ],
      "maxThrottleFailureCount": [
        13
      ],
      "avgThrottleFailureCount": [
        13
      ],
      "sumThrottleFailureCount": [
        13
      ],
      "edges": [
        317
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesVisibility": [
        10
      ],
      "countEmptyVisibility": [
        10
      ],
      "countNotEmptyVisibility": [
        10
      ],
      "percentageEmptyVisibility": [
        13
      ],
      "percentageNotEmptyVisibility": [
        13
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesType": [
        10
      ],
      "countEmptyType": [
        10
      ],
      "countNotEmptyType": [
        10
      ],
      "percentageEmptyType": [
        13
      ],
      "percentageNotEmptyType": [
        13
      ],
      "countUniqueValuesIsContactAutoCreationEnabled": [
        10
      ],
      "countEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "countNotEmptyIsContactAutoCreationEnabled": [
        10
      ],
      "percentageEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "percentageNotEmptyIsContactAutoCreationEnabled": [
        13
      ],
      "countTrueIsContactAutoCreationEnabled": [
        10
      ],
      "countFalseIsContactAutoCreationEnabled": [
        10
      ],
      "countUniqueValuesContactAutoCreationPolicy": [
        10
      ],
      "countEmptyContactAutoCreationPolicy": [
        10
      ],
      "countNotEmptyContactAutoCreationPolicy": [
        10
      ],
      "percentageEmptyContactAutoCreationPolicy": [
        13
      ],
      "percentageNotEmptyContactAutoCreationPolicy": [
        13
      ],
      "countUniqueValuesMessageFolderImportPolicy": [
        10
      ],
      "countEmptyMessageFolderImportPolicy": [
        10
      ],
      "countNotEmptyMessageFolderImportPolicy": [
        10
      ],
      "percentageEmptyMessageFolderImportPolicy": [
        13
      ],
      "percentageNotEmptyMessageFolderImportPolicy": [
        13
      ],
      "countUniqueValuesExcludeNonProfessionalEmails": [
        10
      ],
      "countEmptyExcludeNonProfessionalEmails": [
        10
      ],
      "countNotEmptyExcludeNonProfessionalEmails": [
        10
      ],
      "percentageEmptyExcludeNonProfessionalEmails": [
        13
      ],
      "percentageNotEmptyExcludeNonProfessionalEmails": [
        13
      ],
      "countTrueExcludeNonProfessionalEmails": [
        10
      ],
      "countFalseExcludeNonProfessionalEmails": [
        10
      ],
      "countUniqueValuesExcludeGroupEmails": [
        10
      ],
      "countEmptyExcludeGroupEmails": [
        10
      ],
      "countNotEmptyExcludeGroupEmails": [
        10
      ],
      "percentageEmptyExcludeGroupEmails": [
        13
      ],
      "percentageNotEmptyExcludeGroupEmails": [
        13
      ],
      "countTrueExcludeGroupEmails": [
        10
      ],
      "countFalseExcludeGroupEmails": [
        10
      ],
      "countUniqueValuesPendingGroupEmailsAction": [
        10
      ],
      "countEmptyPendingGroupEmailsAction": [
        10
      ],
      "countNotEmptyPendingGroupEmailsAction": [
        10
      ],
      "percentageEmptyPendingGroupEmailsAction": [
        13
      ],
      "percentageNotEmptyPendingGroupEmailsAction": [
        13
      ],
      "countUniqueValuesIsSyncEnabled": [
        10
      ],
      "countEmptyIsSyncEnabled": [
        10
      ],
      "countNotEmptyIsSyncEnabled": [
        10
      ],
      "percentageEmptyIsSyncEnabled": [
        13
      ],
      "percentageNotEmptyIsSyncEnabled": [
        13
      ],
      "countTrueIsSyncEnabled": [
        10
      ],
      "countFalseIsSyncEnabled": [
        10
      ],
      "countUniqueValuesSyncCursor": [
        10
      ],
      "countEmptySyncCursor": [
        10
      ],
      "countNotEmptySyncCursor": [
        10
      ],
      "percentageEmptySyncCursor": [
        13
      ],
      "percentageNotEmptySyncCursor": [
        13
      ],
      "countUniqueValuesSyncedAt": [
        10
      ],
      "countEmptySyncedAt": [
        10
      ],
      "countNotEmptySyncedAt": [
        10
      ],
      "percentageEmptySyncedAt": [
        13
      ],
      "percentageNotEmptySyncedAt": [
        13
      ],
      "minSyncedAt": [
        7
      ],
      "maxSyncedAt": [
        7
      ],
      "countUniqueValuesSyncStatus": [
        10
      ],
      "countEmptySyncStatus": [
        10
      ],
      "countNotEmptySyncStatus": [
        10
      ],
      "percentageEmptySyncStatus": [
        13
      ],
      "percentageNotEmptySyncStatus": [
        13
      ],
      "countUniqueValuesSyncStage": [
        10
      ],
      "countEmptySyncStage": [
        10
      ],
      "countNotEmptySyncStage": [
        10
      ],
      "percentageEmptySyncStage": [
        13
      ],
      "percentageNotEmptySyncStage": [
        13
      ],
      "countUniqueValuesSyncStageStartedAt": [
        10
      ],
      "countEmptySyncStageStartedAt": [
        10
      ],
      "countNotEmptySyncStageStartedAt": [
        10
      ],
      "percentageEmptySyncStageStartedAt": [
        13
      ],
      "percentageNotEmptySyncStageStartedAt": [
        13
      ],
      "minSyncStageStartedAt": [
        7
      ],
      "maxSyncStageStartedAt": [
        7
      ],
      "countUniqueValuesThrottleFailureCount": [
        10
      ],
      "countEmptyThrottleFailureCount": [
        10
      ],
      "countNotEmptyThrottleFailureCount": [
        10
      ],
      "percentageEmptyThrottleFailureCount": [
        13
      ],
      "percentageNotEmptyThrottleFailureCount": [
        13
      ],
      "minThrottleFailureCount": [
        13
      ],
      "maxThrottleFailureCount": [
        13
      ],
      "avgThrottleFailureCount": [
        13
      ],
      "sumThrottleFailureCount": [
        13
      ],
      "edges": [
        317
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelRelationInput": {
      "connect": [
        321
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelConnectInput": {
      "where": [
        322
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "visibility": [
        309
      ],
      "handle": [
        1
      ],
      "type": [
        310
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        311
      ],
      "messageFolderImportPolicy": [
        312
      ],
      "excludeNonProfessionalEmails": [
        6
      ],
      "excludeGroupEmails": [
        6
      ],
      "pendingGroupEmailsAction": [
        313
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        1
      ],
      "syncedAt": [
        7
      ],
      "syncStatus": [
        314
      ],
      "syncStage": [
        315
      ],
      "syncStageStartedAt": [
        7
      ],
      "throttleFailureCount": [
        13
      ],
      "connectedAccountId": [
        22
      ],
      "connectedAccount": [
        221
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "visibility": [
        309
      ],
      "handle": [
        1
      ],
      "type": [
        310
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        311
      ],
      "messageFolderImportPolicy": [
        312
      ],
      "excludeNonProfessionalEmails": [
        6
      ],
      "excludeGroupEmails": [
        6
      ],
      "pendingGroupEmailsAction": [
        313
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        1
      ],
      "syncedAt": [
        7
      ],
      "syncStatus": [
        314
      ],
      "syncStage": [
        315
      ],
      "syncStageStartedAt": [
        7
      ],
      "throttleFailureCount": [
        13
      ],
      "connectedAccountId": [
        22
      ],
      "connectedAccount": [
        221
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "visibility": [
        230
      ],
      "handle": [
        56
      ],
      "type": [
        231
      ],
      "isContactAutoCreationEnabled": [
        175
      ],
      "contactAutoCreationPolicy": [
        232
      ],
      "messageFolderImportPolicy": [
        233
      ],
      "excludeNonProfessionalEmails": [
        175
      ],
      "excludeGroupEmails": [
        175
      ],
      "pendingGroupEmailsAction": [
        234
      ],
      "isSyncEnabled": [
        175
      ],
      "syncCursor": [
        56
      ],
      "syncedAt": [
        7
      ],
      "syncStatus": [
        235
      ],
      "syncStage": [
        236
      ],
      "syncStageStartedAt": [
        7
      ],
      "throttleFailureCount": [
        179
      ],
      "connectedAccountId": [
        33
      ],
      "messageChannelMessageAssociations": [
        237
      ],
      "messageFolders": [
        239
      ],
      "and": [
        325
      ],
      "or": [
        325
      ],
      "not": [
        325
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "visibility": [
        59
      ],
      "handle": [
        59
      ],
      "type": [
        59
      ],
      "isContactAutoCreationEnabled": [
        59
      ],
      "contactAutoCreationPolicy": [
        59
      ],
      "messageFolderImportPolicy": [
        59
      ],
      "excludeNonProfessionalEmails": [
        59
      ],
      "excludeGroupEmails": [
        59
      ],
      "pendingGroupEmailsAction": [
        59
      ],
      "isSyncEnabled": [
        59
      ],
      "syncCursor": [
        59
      ],
      "syncedAt": [
        59
      ],
      "syncStatus": [
        59
      ],
      "syncStage": [
        59
      ],
      "syncStageStartedAt": [
        59
      ],
      "throttleFailureCount": [
        59
      ],
      "connectedAccountId": [
        59
      ],
      "connectedAccount": [
        241
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelOrderByWithGroupByInput": {
      "aggregate": [
        328
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "visibility": [
        59
      ],
      "handle": [
        59
      ],
      "type": [
        59
      ],
      "isContactAutoCreationEnabled": [
        59
      ],
      "contactAutoCreationPolicy": [
        59
      ],
      "messageFolderImportPolicy": [
        59
      ],
      "excludeNonProfessionalEmails": [
        59
      ],
      "excludeGroupEmails": [
        59
      ],
      "pendingGroupEmailsAction": [
        59
      ],
      "isSyncEnabled": [
        59
      ],
      "syncCursor": [
        59
      ],
      "syncedAt": [
        110
      ],
      "syncStatus": [
        59
      ],
      "syncStage": [
        59
      ],
      "syncStageStartedAt": [
        110
      ],
      "throttleFailureCount": [
        59
      ],
      "connectedAccountId": [
        59
      ],
      "connectedAccount": [
        242
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesVisibility": [
        59
      ],
      "countEmptyVisibility": [
        59
      ],
      "countNotEmptyVisibility": [
        59
      ],
      "percentageEmptyVisibility": [
        59
      ],
      "percentageNotEmptyVisibility": [
        59
      ],
      "countUniqueValuesHandle": [
        59
      ],
      "countEmptyHandle": [
        59
      ],
      "countNotEmptyHandle": [
        59
      ],
      "percentageEmptyHandle": [
        59
      ],
      "percentageNotEmptyHandle": [
        59
      ],
      "countUniqueValuesType": [
        59
      ],
      "countEmptyType": [
        59
      ],
      "countNotEmptyType": [
        59
      ],
      "percentageEmptyType": [
        59
      ],
      "percentageNotEmptyType": [
        59
      ],
      "countUniqueValuesIsContactAutoCreationEnabled": [
        59
      ],
      "countEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "countNotEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "percentageEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "percentageNotEmptyIsContactAutoCreationEnabled": [
        59
      ],
      "countTrueIsContactAutoCreationEnabled": [
        59
      ],
      "countFalseIsContactAutoCreationEnabled": [
        59
      ],
      "countUniqueValuesContactAutoCreationPolicy": [
        59
      ],
      "countEmptyContactAutoCreationPolicy": [
        59
      ],
      "countNotEmptyContactAutoCreationPolicy": [
        59
      ],
      "percentageEmptyContactAutoCreationPolicy": [
        59
      ],
      "percentageNotEmptyContactAutoCreationPolicy": [
        59
      ],
      "countUniqueValuesMessageFolderImportPolicy": [
        59
      ],
      "countEmptyMessageFolderImportPolicy": [
        59
      ],
      "countNotEmptyMessageFolderImportPolicy": [
        59
      ],
      "percentageEmptyMessageFolderImportPolicy": [
        59
      ],
      "percentageNotEmptyMessageFolderImportPolicy": [
        59
      ],
      "countUniqueValuesExcludeNonProfessionalEmails": [
        59
      ],
      "countEmptyExcludeNonProfessionalEmails": [
        59
      ],
      "countNotEmptyExcludeNonProfessionalEmails": [
        59
      ],
      "percentageEmptyExcludeNonProfessionalEmails": [
        59
      ],
      "percentageNotEmptyExcludeNonProfessionalEmails": [
        59
      ],
      "countTrueExcludeNonProfessionalEmails": [
        59
      ],
      "countFalseExcludeNonProfessionalEmails": [
        59
      ],
      "countUniqueValuesExcludeGroupEmails": [
        59
      ],
      "countEmptyExcludeGroupEmails": [
        59
      ],
      "countNotEmptyExcludeGroupEmails": [
        59
      ],
      "percentageEmptyExcludeGroupEmails": [
        59
      ],
      "percentageNotEmptyExcludeGroupEmails": [
        59
      ],
      "countTrueExcludeGroupEmails": [
        59
      ],
      "countFalseExcludeGroupEmails": [
        59
      ],
      "countUniqueValuesPendingGroupEmailsAction": [
        59
      ],
      "countEmptyPendingGroupEmailsAction": [
        59
      ],
      "countNotEmptyPendingGroupEmailsAction": [
        59
      ],
      "percentageEmptyPendingGroupEmailsAction": [
        59
      ],
      "percentageNotEmptyPendingGroupEmailsAction": [
        59
      ],
      "countUniqueValuesIsSyncEnabled": [
        59
      ],
      "countEmptyIsSyncEnabled": [
        59
      ],
      "countNotEmptyIsSyncEnabled": [
        59
      ],
      "percentageEmptyIsSyncEnabled": [
        59
      ],
      "percentageNotEmptyIsSyncEnabled": [
        59
      ],
      "countTrueIsSyncEnabled": [
        59
      ],
      "countFalseIsSyncEnabled": [
        59
      ],
      "countUniqueValuesSyncCursor": [
        59
      ],
      "countEmptySyncCursor": [
        59
      ],
      "countNotEmptySyncCursor": [
        59
      ],
      "percentageEmptySyncCursor": [
        59
      ],
      "percentageNotEmptySyncCursor": [
        59
      ],
      "countUniqueValuesSyncedAt": [
        59
      ],
      "countEmptySyncedAt": [
        59
      ],
      "countNotEmptySyncedAt": [
        59
      ],
      "percentageEmptySyncedAt": [
        59
      ],
      "percentageNotEmptySyncedAt": [
        59
      ],
      "minSyncedAt": [
        59
      ],
      "maxSyncedAt": [
        59
      ],
      "countUniqueValuesSyncStatus": [
        59
      ],
      "countEmptySyncStatus": [
        59
      ],
      "countNotEmptySyncStatus": [
        59
      ],
      "percentageEmptySyncStatus": [
        59
      ],
      "percentageNotEmptySyncStatus": [
        59
      ],
      "countUniqueValuesSyncStage": [
        59
      ],
      "countEmptySyncStage": [
        59
      ],
      "countNotEmptySyncStage": [
        59
      ],
      "percentageEmptySyncStage": [
        59
      ],
      "percentageNotEmptySyncStage": [
        59
      ],
      "countUniqueValuesSyncStageStartedAt": [
        59
      ],
      "countEmptySyncStageStartedAt": [
        59
      ],
      "countNotEmptySyncStageStartedAt": [
        59
      ],
      "percentageEmptySyncStageStartedAt": [
        59
      ],
      "percentageNotEmptySyncStageStartedAt": [
        59
      ],
      "minSyncStageStartedAt": [
        59
      ],
      "maxSyncStageStartedAt": [
        59
      ],
      "countUniqueValuesThrottleFailureCount": [
        59
      ],
      "countEmptyThrottleFailureCount": [
        59
      ],
      "countNotEmptyThrottleFailureCount": [
        59
      ],
      "percentageEmptyThrottleFailureCount": [
        59
      ],
      "percentageNotEmptyThrottleFailureCount": [
        59
      ],
      "minThrottleFailureCount": [
        59
      ],
      "maxThrottleFailureCount": [
        59
      ],
      "avgThrottleFailureCount": [
        59
      ],
      "sumThrottleFailureCount": [
        59
      ],
      "connectedAccountId": [
        59
      ],
      "connectedAccount": [
        241
      ],
      "__typename": [
        1
      ]
    },
    "MessageChannelGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "visibility": [
        6
      ],
      "handle": [
        6
      ],
      "type": [
        6
      ],
      "isContactAutoCreationEnabled": [
        6
      ],
      "contactAutoCreationPolicy": [
        6
      ],
      "messageFolderImportPolicy": [
        6
      ],
      "excludeNonProfessionalEmails": [
        6
      ],
      "excludeGroupEmails": [
        6
      ],
      "pendingGroupEmailsAction": [
        6
      ],
      "isSyncEnabled": [
        6
      ],
      "syncCursor": [
        6
      ],
      "syncedAt": [
        109
      ],
      "syncStatus": [
        6
      ],
      "syncStage": [
        6
      ],
      "syncStageStartedAt": [
        109
      ],
      "throttleFailureCount": [
        6
      ],
      "connectedAccount": [
        244
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderPendingSyncActionEnum": {},
    "MessageFolder": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "syncCursor": [
        1
      ],
      "isSentFolder": [
        6
      ],
      "isSynced": [
        6
      ],
      "parentFolderId": [
        1
      ],
      "externalId": [
        1
      ],
      "pendingSyncAction": [
        330
      ],
      "messageChannelId": [
        22
      ],
      "messageChannel": [
        316
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderEdge": {
      "node": [
        331
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesSyncCursor": [
        10
      ],
      "countEmptySyncCursor": [
        10
      ],
      "countNotEmptySyncCursor": [
        10
      ],
      "percentageEmptySyncCursor": [
        13
      ],
      "percentageNotEmptySyncCursor": [
        13
      ],
      "countUniqueValuesIsSentFolder": [
        10
      ],
      "countEmptyIsSentFolder": [
        10
      ],
      "countNotEmptyIsSentFolder": [
        10
      ],
      "percentageEmptyIsSentFolder": [
        13
      ],
      "percentageNotEmptyIsSentFolder": [
        13
      ],
      "countTrueIsSentFolder": [
        10
      ],
      "countFalseIsSentFolder": [
        10
      ],
      "countUniqueValuesIsSynced": [
        10
      ],
      "countEmptyIsSynced": [
        10
      ],
      "countNotEmptyIsSynced": [
        10
      ],
      "percentageEmptyIsSynced": [
        13
      ],
      "percentageNotEmptyIsSynced": [
        13
      ],
      "countTrueIsSynced": [
        10
      ],
      "countFalseIsSynced": [
        10
      ],
      "countUniqueValuesParentFolderId": [
        10
      ],
      "countEmptyParentFolderId": [
        10
      ],
      "countNotEmptyParentFolderId": [
        10
      ],
      "percentageEmptyParentFolderId": [
        13
      ],
      "percentageNotEmptyParentFolderId": [
        13
      ],
      "countUniqueValuesExternalId": [
        10
      ],
      "countEmptyExternalId": [
        10
      ],
      "countNotEmptyExternalId": [
        10
      ],
      "percentageEmptyExternalId": [
        13
      ],
      "percentageNotEmptyExternalId": [
        13
      ],
      "countUniqueValuesPendingSyncAction": [
        10
      ],
      "countEmptyPendingSyncAction": [
        10
      ],
      "countNotEmptyPendingSyncAction": [
        10
      ],
      "percentageEmptyPendingSyncAction": [
        13
      ],
      "percentageNotEmptyPendingSyncAction": [
        13
      ],
      "edges": [
        332
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesSyncCursor": [
        10
      ],
      "countEmptySyncCursor": [
        10
      ],
      "countNotEmptySyncCursor": [
        10
      ],
      "percentageEmptySyncCursor": [
        13
      ],
      "percentageNotEmptySyncCursor": [
        13
      ],
      "countUniqueValuesIsSentFolder": [
        10
      ],
      "countEmptyIsSentFolder": [
        10
      ],
      "countNotEmptyIsSentFolder": [
        10
      ],
      "percentageEmptyIsSentFolder": [
        13
      ],
      "percentageNotEmptyIsSentFolder": [
        13
      ],
      "countTrueIsSentFolder": [
        10
      ],
      "countFalseIsSentFolder": [
        10
      ],
      "countUniqueValuesIsSynced": [
        10
      ],
      "countEmptyIsSynced": [
        10
      ],
      "countNotEmptyIsSynced": [
        10
      ],
      "percentageEmptyIsSynced": [
        13
      ],
      "percentageNotEmptyIsSynced": [
        13
      ],
      "countTrueIsSynced": [
        10
      ],
      "countFalseIsSynced": [
        10
      ],
      "countUniqueValuesParentFolderId": [
        10
      ],
      "countEmptyParentFolderId": [
        10
      ],
      "countNotEmptyParentFolderId": [
        10
      ],
      "percentageEmptyParentFolderId": [
        13
      ],
      "percentageNotEmptyParentFolderId": [
        13
      ],
      "countUniqueValuesExternalId": [
        10
      ],
      "countEmptyExternalId": [
        10
      ],
      "countNotEmptyExternalId": [
        10
      ],
      "percentageEmptyExternalId": [
        13
      ],
      "percentageNotEmptyExternalId": [
        13
      ],
      "countUniqueValuesPendingSyncAction": [
        10
      ],
      "countEmptyPendingSyncAction": [
        10
      ],
      "countNotEmptyPendingSyncAction": [
        10
      ],
      "percentageEmptyPendingSyncAction": [
        13
      ],
      "percentageNotEmptyPendingSyncAction": [
        13
      ],
      "edges": [
        332
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderRelationInput": {
      "connect": [
        336
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderConnectInput": {
      "where": [
        337
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "syncCursor": [
        1
      ],
      "isSentFolder": [
        6
      ],
      "isSynced": [
        6
      ],
      "parentFolderId": [
        1
      ],
      "externalId": [
        1
      ],
      "pendingSyncAction": [
        330
      ],
      "messageChannelId": [
        22
      ],
      "messageChannel": [
        320
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "syncCursor": [
        1
      ],
      "isSentFolder": [
        6
      ],
      "isSynced": [
        6
      ],
      "parentFolderId": [
        1
      ],
      "externalId": [
        1
      ],
      "pendingSyncAction": [
        330
      ],
      "messageChannelId": [
        22
      ],
      "messageChannel": [
        320
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "syncCursor": [
        56
      ],
      "isSentFolder": [
        175
      ],
      "isSynced": [
        175
      ],
      "parentFolderId": [
        56
      ],
      "externalId": [
        56
      ],
      "pendingSyncAction": [
        240
      ],
      "messageChannelId": [
        33
      ],
      "and": [
        340
      ],
      "or": [
        340
      ],
      "not": [
        340
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        59
      ],
      "syncCursor": [
        59
      ],
      "isSentFolder": [
        59
      ],
      "isSynced": [
        59
      ],
      "parentFolderId": [
        59
      ],
      "externalId": [
        59
      ],
      "pendingSyncAction": [
        59
      ],
      "messageChannelId": [
        59
      ],
      "messageChannel": [
        326
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderOrderByWithGroupByInput": {
      "aggregate": [
        343
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        59
      ],
      "syncCursor": [
        59
      ],
      "isSentFolder": [
        59
      ],
      "isSynced": [
        59
      ],
      "parentFolderId": [
        59
      ],
      "externalId": [
        59
      ],
      "pendingSyncAction": [
        59
      ],
      "messageChannelId": [
        59
      ],
      "messageChannel": [
        327
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesSyncCursor": [
        59
      ],
      "countEmptySyncCursor": [
        59
      ],
      "countNotEmptySyncCursor": [
        59
      ],
      "percentageEmptySyncCursor": [
        59
      ],
      "percentageNotEmptySyncCursor": [
        59
      ],
      "countUniqueValuesIsSentFolder": [
        59
      ],
      "countEmptyIsSentFolder": [
        59
      ],
      "countNotEmptyIsSentFolder": [
        59
      ],
      "percentageEmptyIsSentFolder": [
        59
      ],
      "percentageNotEmptyIsSentFolder": [
        59
      ],
      "countTrueIsSentFolder": [
        59
      ],
      "countFalseIsSentFolder": [
        59
      ],
      "countUniqueValuesIsSynced": [
        59
      ],
      "countEmptyIsSynced": [
        59
      ],
      "countNotEmptyIsSynced": [
        59
      ],
      "percentageEmptyIsSynced": [
        59
      ],
      "percentageNotEmptyIsSynced": [
        59
      ],
      "countTrueIsSynced": [
        59
      ],
      "countFalseIsSynced": [
        59
      ],
      "countUniqueValuesParentFolderId": [
        59
      ],
      "countEmptyParentFolderId": [
        59
      ],
      "countNotEmptyParentFolderId": [
        59
      ],
      "percentageEmptyParentFolderId": [
        59
      ],
      "percentageNotEmptyParentFolderId": [
        59
      ],
      "countUniqueValuesExternalId": [
        59
      ],
      "countEmptyExternalId": [
        59
      ],
      "countNotEmptyExternalId": [
        59
      ],
      "percentageEmptyExternalId": [
        59
      ],
      "percentageNotEmptyExternalId": [
        59
      ],
      "countUniqueValuesPendingSyncAction": [
        59
      ],
      "countEmptyPendingSyncAction": [
        59
      ],
      "countNotEmptyPendingSyncAction": [
        59
      ],
      "percentageEmptyPendingSyncAction": [
        59
      ],
      "percentageNotEmptyPendingSyncAction": [
        59
      ],
      "messageChannelId": [
        59
      ],
      "messageChannel": [
        326
      ],
      "__typename": [
        1
      ]
    },
    "MessageFolderGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        6
      ],
      "syncCursor": [
        6
      ],
      "isSentFolder": [
        6
      ],
      "isSynced": [
        6
      ],
      "parentFolderId": [
        6
      ],
      "externalId": [
        6
      ],
      "pendingSyncAction": [
        6
      ],
      "messageChannel": [
        329
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantRoleEnum": {},
    "MessageParticipant": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "role": [
        345
      ],
      "handle": [
        1
      ],
      "displayName": [
        1
      ],
      "messageId": [
        22
      ],
      "personId": [
        22
      ],
      "workspaceMemberId": [
        22
      ],
      "message": [
        381
      ],
      "person": [
        629
      ],
      "workspaceMember": [
        551
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantEdge": {
      "node": [
        346
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesRole": [
        10
      ],
      "countEmptyRole": [
        10
      ],
      "countNotEmptyRole": [
        10
      ],
      "percentageEmptyRole": [
        13
      ],
      "percentageNotEmptyRole": [
        13
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesDisplayName": [
        10
      ],
      "countEmptyDisplayName": [
        10
      ],
      "countNotEmptyDisplayName": [
        10
      ],
      "percentageEmptyDisplayName": [
        13
      ],
      "percentageNotEmptyDisplayName": [
        13
      ],
      "edges": [
        347
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesRole": [
        10
      ],
      "countEmptyRole": [
        10
      ],
      "countNotEmptyRole": [
        10
      ],
      "percentageEmptyRole": [
        13
      ],
      "percentageNotEmptyRole": [
        13
      ],
      "countUniqueValuesHandle": [
        10
      ],
      "countEmptyHandle": [
        10
      ],
      "countNotEmptyHandle": [
        10
      ],
      "percentageEmptyHandle": [
        13
      ],
      "percentageNotEmptyHandle": [
        13
      ],
      "countUniqueValuesDisplayName": [
        10
      ],
      "countEmptyDisplayName": [
        10
      ],
      "countNotEmptyDisplayName": [
        10
      ],
      "percentageEmptyDisplayName": [
        13
      ],
      "percentageNotEmptyDisplayName": [
        13
      ],
      "edges": [
        347
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantRelationInput": {
      "connect": [
        351
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantConnectInput": {
      "where": [
        352
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "role": [
        345
      ],
      "handle": [
        1
      ],
      "displayName": [
        1
      ],
      "messageId": [
        22
      ],
      "message": [
        385
      ],
      "personId": [
        22
      ],
      "person": [
        633
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "role": [
        345
      ],
      "handle": [
        1
      ],
      "displayName": [
        1
      ],
      "messageId": [
        22
      ],
      "message": [
        385
      ],
      "personId": [
        22
      ],
      "person": [
        633
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "role": [
        356
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "messageId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "and": [
        355
      ],
      "or": [
        355
      ],
      "not": [
        355
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantRoleEnumFilter": {
      "eq": [
        345
      ],
      "neq": [
        345
      ],
      "in": [
        345
      ],
      "containsAny": [
        345
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "role": [
        59
      ],
      "handle": [
        59
      ],
      "displayName": [
        59
      ],
      "messageId": [
        59
      ],
      "message": [
        391
      ],
      "personId": [
        59
      ],
      "person": [
        640
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantOrderByWithGroupByInput": {
      "aggregate": [
        359
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "role": [
        59
      ],
      "handle": [
        59
      ],
      "displayName": [
        59
      ],
      "messageId": [
        59
      ],
      "message": [
        392
      ],
      "personId": [
        59
      ],
      "person": [
        641
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        596
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesRole": [
        59
      ],
      "countEmptyRole": [
        59
      ],
      "countNotEmptyRole": [
        59
      ],
      "percentageEmptyRole": [
        59
      ],
      "percentageNotEmptyRole": [
        59
      ],
      "countUniqueValuesHandle": [
        59
      ],
      "countEmptyHandle": [
        59
      ],
      "countNotEmptyHandle": [
        59
      ],
      "percentageEmptyHandle": [
        59
      ],
      "percentageNotEmptyHandle": [
        59
      ],
      "countUniqueValuesDisplayName": [
        59
      ],
      "countEmptyDisplayName": [
        59
      ],
      "countNotEmptyDisplayName": [
        59
      ],
      "percentageEmptyDisplayName": [
        59
      ],
      "percentageNotEmptyDisplayName": [
        59
      ],
      "messageId": [
        59
      ],
      "message": [
        391
      ],
      "personId": [
        59
      ],
      "person": [
        640
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "MessageParticipantGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "role": [
        6
      ],
      "handle": [
        6
      ],
      "displayName": [
        6
      ],
      "message": [
        394
      ],
      "person": [
        643
      ],
      "workspaceMember": [
        598
      ],
      "__typename": [
        1
      ]
    },
    "MessageThread": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messages": [
        383,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            390
          ],
          "orderBy": [
            391,
            "[MessageOrderByInput]"
          ]
        }
      ],
      "messageChannelMessageAssociations": [
        297,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            304
          ],
          "orderBy": [
            305,
            "[MessageChannelMessageAssociationOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadEdge": {
      "node": [
        361
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "edges": [
        362
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "edges": [
        362
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadRelationInput": {
      "connect": [
        366
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadConnectInput": {
      "where": [
        367
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messages": [
        371
      ],
      "messageChannelMessageAssociations": [
        375
      ],
      "and": [
        370
      ],
      "or": [
        370
      ],
      "not": [
        370
      ],
      "__typename": [
        1
      ]
    },
    "messagesOneToManyFilter_53ff43bc": {
      "is": [
        34
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "headerMessageId": [
        56
      ],
      "direction": [
        372
      ],
      "subject": [
        56
      ],
      "text": [
        56
      ],
      "receivedAt": [
        7
      ],
      "messageThreadId": [
        33
      ],
      "messageParticipants": [
        373
      ],
      "messageChannelMessageAssociations": [
        374
      ],
      "__typename": [
        1
      ]
    },
    "MessageDirectionEnumFilter": {
      "eq": [
        380
      ],
      "neq": [
        380
      ],
      "in": [
        380
      ],
      "containsAny": [
        380
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "messageParticipantsOneToManyFilter_eef1b3c0": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "role": [
        356
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "messageId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "messageChannelMessageAssociationsOneToManyFilter_587d9fd7": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messageExternalId": [
        56
      ],
      "messageThreadExternalId": [
        56
      ],
      "direction": [
        238
      ],
      "messageId": [
        33
      ],
      "messageChannelId": [
        33
      ],
      "messageThreadId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "messageChannelMessageAssociationsOneToManyFilter_865e134a": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "messageExternalId": [
        56
      ],
      "messageThreadExternalId": [
        56
      ],
      "direction": [
        238
      ],
      "messageId": [
        33
      ],
      "messageChannelId": [
        33
      ],
      "messageThreadId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadOrderByWithGroupByInput": {
      "aggregate": [
        378
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "MessageThreadGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "__typename": [
        1
      ]
    },
    "MessageDirectionEnum": {},
    "Message": {
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "headerMessageId": [
        1
      ],
      "direction": [
        380
      ],
      "subject": [
        1
      ],
      "text": [
        1
      ],
      "receivedAt": [
        7
      ],
      "messageThreadId": [
        22
      ],
      "messageThread": [
        361
      ],
      "messageParticipants": [
        348,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            355
          ],
          "orderBy": [
            357,
            "[MessageParticipantOrderByInput]"
          ]
        }
      ],
      "messageChannelMessageAssociations": [
        297,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            304
          ],
          "orderBy": [
            305,
            "[MessageChannelMessageAssociationOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "MessageEdge": {
      "node": [
        381
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "MessageConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesHeaderMessageId": [
        10
      ],
      "countEmptyHeaderMessageId": [
        10
      ],
      "countNotEmptyHeaderMessageId": [
        10
      ],
      "percentageEmptyHeaderMessageId": [
        13
      ],
      "percentageNotEmptyHeaderMessageId": [
        13
      ],
      "countUniqueValuesDirection": [
        10
      ],
      "countEmptyDirection": [
        10
      ],
      "countNotEmptyDirection": [
        10
      ],
      "percentageEmptyDirection": [
        13
      ],
      "percentageNotEmptyDirection": [
        13
      ],
      "countUniqueValuesSubject": [
        10
      ],
      "countEmptySubject": [
        10
      ],
      "countNotEmptySubject": [
        10
      ],
      "percentageEmptySubject": [
        13
      ],
      "percentageNotEmptySubject": [
        13
      ],
      "countUniqueValuesText": [
        10
      ],
      "countEmptyText": [
        10
      ],
      "countNotEmptyText": [
        10
      ],
      "percentageEmptyText": [
        13
      ],
      "percentageNotEmptyText": [
        13
      ],
      "countUniqueValuesReceivedAt": [
        10
      ],
      "countEmptyReceivedAt": [
        10
      ],
      "countNotEmptyReceivedAt": [
        10
      ],
      "percentageEmptyReceivedAt": [
        13
      ],
      "percentageNotEmptyReceivedAt": [
        13
      ],
      "minReceivedAt": [
        7
      ],
      "maxReceivedAt": [
        7
      ],
      "edges": [
        382
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "MessageGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesHeaderMessageId": [
        10
      ],
      "countEmptyHeaderMessageId": [
        10
      ],
      "countNotEmptyHeaderMessageId": [
        10
      ],
      "percentageEmptyHeaderMessageId": [
        13
      ],
      "percentageNotEmptyHeaderMessageId": [
        13
      ],
      "countUniqueValuesDirection": [
        10
      ],
      "countEmptyDirection": [
        10
      ],
      "countNotEmptyDirection": [
        10
      ],
      "percentageEmptyDirection": [
        13
      ],
      "percentageNotEmptyDirection": [
        13
      ],
      "countUniqueValuesSubject": [
        10
      ],
      "countEmptySubject": [
        10
      ],
      "countNotEmptySubject": [
        10
      ],
      "percentageEmptySubject": [
        13
      ],
      "percentageNotEmptySubject": [
        13
      ],
      "countUniqueValuesText": [
        10
      ],
      "countEmptyText": [
        10
      ],
      "countNotEmptyText": [
        10
      ],
      "percentageEmptyText": [
        13
      ],
      "percentageNotEmptyText": [
        13
      ],
      "countUniqueValuesReceivedAt": [
        10
      ],
      "countEmptyReceivedAt": [
        10
      ],
      "countNotEmptyReceivedAt": [
        10
      ],
      "percentageEmptyReceivedAt": [
        13
      ],
      "percentageNotEmptyReceivedAt": [
        13
      ],
      "minReceivedAt": [
        7
      ],
      "maxReceivedAt": [
        7
      ],
      "edges": [
        382
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "MessageRelationInput": {
      "connect": [
        386
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MessageConnectInput": {
      "where": [
        387
      ],
      "__typename": [
        1
      ]
    },
    "MessageWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "MessageCreateInput": {
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "headerMessageId": [
        1
      ],
      "direction": [
        380
      ],
      "subject": [
        1
      ],
      "text": [
        1
      ],
      "receivedAt": [
        7
      ],
      "messageThreadId": [
        22
      ],
      "messageThread": [
        365
      ],
      "__typename": [
        1
      ]
    },
    "MessageUpdateInput": {
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "headerMessageId": [
        1
      ],
      "direction": [
        380
      ],
      "subject": [
        1
      ],
      "text": [
        1
      ],
      "receivedAt": [
        7
      ],
      "messageThreadId": [
        22
      ],
      "messageThread": [
        365
      ],
      "__typename": [
        1
      ]
    },
    "MessageFilterInput": {
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "headerMessageId": [
        56
      ],
      "direction": [
        372
      ],
      "subject": [
        56
      ],
      "text": [
        56
      ],
      "receivedAt": [
        7
      ],
      "messageThreadId": [
        33
      ],
      "messageParticipants": [
        373
      ],
      "messageChannelMessageAssociations": [
        374
      ],
      "and": [
        390
      ],
      "or": [
        390
      ],
      "not": [
        390
      ],
      "__typename": [
        1
      ]
    },
    "MessageOrderByInput": {
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "headerMessageId": [
        59
      ],
      "direction": [
        59
      ],
      "subject": [
        59
      ],
      "text": [
        59
      ],
      "receivedAt": [
        59
      ],
      "messageThreadId": [
        59
      ],
      "messageThread": [
        376
      ],
      "__typename": [
        1
      ]
    },
    "MessageOrderByWithGroupByInput": {
      "aggregate": [
        393
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "headerMessageId": [
        59
      ],
      "direction": [
        59
      ],
      "subject": [
        59
      ],
      "text": [
        59
      ],
      "receivedAt": [
        110
      ],
      "messageThreadId": [
        59
      ],
      "messageThread": [
        377
      ],
      "__typename": [
        1
      ]
    },
    "MessageOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesHeaderMessageId": [
        59
      ],
      "countEmptyHeaderMessageId": [
        59
      ],
      "countNotEmptyHeaderMessageId": [
        59
      ],
      "percentageEmptyHeaderMessageId": [
        59
      ],
      "percentageNotEmptyHeaderMessageId": [
        59
      ],
      "countUniqueValuesDirection": [
        59
      ],
      "countEmptyDirection": [
        59
      ],
      "countNotEmptyDirection": [
        59
      ],
      "percentageEmptyDirection": [
        59
      ],
      "percentageNotEmptyDirection": [
        59
      ],
      "countUniqueValuesSubject": [
        59
      ],
      "countEmptySubject": [
        59
      ],
      "countNotEmptySubject": [
        59
      ],
      "percentageEmptySubject": [
        59
      ],
      "percentageNotEmptySubject": [
        59
      ],
      "countUniqueValuesText": [
        59
      ],
      "countEmptyText": [
        59
      ],
      "countNotEmptyText": [
        59
      ],
      "percentageEmptyText": [
        59
      ],
      "percentageNotEmptyText": [
        59
      ],
      "countUniqueValuesReceivedAt": [
        59
      ],
      "countEmptyReceivedAt": [
        59
      ],
      "countNotEmptyReceivedAt": [
        59
      ],
      "percentageEmptyReceivedAt": [
        59
      ],
      "percentageNotEmptyReceivedAt": [
        59
      ],
      "minReceivedAt": [
        59
      ],
      "maxReceivedAt": [
        59
      ],
      "messageThreadId": [
        59
      ],
      "messageThread": [
        376
      ],
      "__typename": [
        1
      ]
    },
    "MessageGroupByInput": {
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "headerMessageId": [
        6
      ],
      "direction": [
        6
      ],
      "subject": [
        6
      ],
      "text": [
        6
      ],
      "receivedAt": [
        109
      ],
      "messageThread": [
        379
      ],
      "__typename": [
        1
      ]
    },
    "Note": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "title": [
        1
      ],
      "bodyV2": [
        101
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "searchVector": [
        247
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "noteTargets": [
        415,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            422
          ],
          "orderBy": [
            423,
            "[NoteTargetOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "NoteEdge": {
      "node": [
        395
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "NoteConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesBodyV2": [
        10
      ],
      "countEmptyBodyV2": [
        10
      ],
      "countNotEmptyBodyV2": [
        10
      ],
      "percentageEmptyBodyV2": [
        13
      ],
      "percentageNotEmptyBodyV2": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        396
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "NoteGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesBodyV2": [
        10
      ],
      "countEmptyBodyV2": [
        10
      ],
      "countNotEmptyBodyV2": [
        10
      ],
      "percentageEmptyBodyV2": [
        13
      ],
      "percentageNotEmptyBodyV2": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        396
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "NoteRelationInput": {
      "connect": [
        400
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "NoteConnectInput": {
      "where": [
        401
      ],
      "__typename": [
        1
      ]
    },
    "NoteWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "NoteCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "title": [
        1
      ],
      "bodyV2": [
        102
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "searchVector": [
        247
      ],
      "__typename": [
        1
      ]
    },
    "NoteUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "title": [
        1
      ],
      "bodyV2": [
        103
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "searchVector": [
        247
      ],
      "__typename": [
        1
      ]
    },
    "NoteFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "title": [
        56
      ],
      "bodyV2": [
        104
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        405
      ],
      "favorites": [
        406
      ],
      "noteTargets": [
        407
      ],
      "timelineActivities": [
        408
      ],
      "and": [
        404
      ],
      "or": [
        404
      ],
      "not": [
        404
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_9d9af61e": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_dd9bf3d4": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "noteTargetsOneToManyFilter_05222de9": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "noteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_da2df1b0": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "NoteOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "position": [
        59
      ],
      "title": [
        59
      ],
      "bodyV2": [
        105
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "NoteOrderByWithGroupByInput": {
      "aggregate": [
        411
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "position": [
        59
      ],
      "title": [
        59
      ],
      "bodyV2": [
        105
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "NoteOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesTitle": [
        59
      ],
      "countEmptyTitle": [
        59
      ],
      "countNotEmptyTitle": [
        59
      ],
      "percentageEmptyTitle": [
        59
      ],
      "percentageNotEmptyTitle": [
        59
      ],
      "countUniqueValuesBodyV2": [
        59
      ],
      "countEmptyBodyV2": [
        59
      ],
      "countNotEmptyBodyV2": [
        59
      ],
      "percentageEmptyBodyV2": [
        59
      ],
      "percentageNotEmptyBodyV2": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "NoteGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "position": [
        6
      ],
      "title": [
        6
      ],
      "bodyV2": [
        106
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "searchVector": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "NoteTarget": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        22
      ],
      "noteId": [
        22
      ],
      "targetPersonId": [
        22
      ],
      "targetOpportunityId": [
        22
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetCompany": [
        599
      ],
      "note": [
        395
      ],
      "targetPerson": [
        629
      ],
      "targetOpportunity": [
        615
      ],
      "targetQaScorecard": [
        647
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetEdge": {
      "node": [
        413
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        414
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        414
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetRelationInput": {
      "connect": [
        418
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetConnectInput": {
      "where": [
        419
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "noteId": [
        22
      ],
      "note": [
        399
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "noteId": [
        22
      ],
      "note": [
        399
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "noteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "and": [
        422
      ],
      "or": [
        422
      ],
      "not": [
        422
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "noteId": [
        59
      ],
      "note": [
        409
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetOrderByWithGroupByInput": {
      "aggregate": [
        425
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        611
      ],
      "noteId": [
        59
      ],
      "note": [
        410
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        641
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        626
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        666
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "noteId": [
        59
      ],
      "note": [
        409
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "NoteTargetGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "targetCompany": [
        613
      ],
      "note": [
        412
      ],
      "targetPerson": [
        643
      ],
      "targetOpportunity": [
        628
      ],
      "targetQaScorecard": [
        668
      ],
      "__typename": [
        1
      ]
    },
    "TaskStatusEnum": {},
    "Task": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "title": [
        1
      ],
      "bodyV2": [
        101
      ],
      "dueAt": [
        7
      ],
      "status": [
        427
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "searchVector": [
        247
      ],
      "assigneeId": [
        22
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "taskTargets": [
        449,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            456
          ],
          "orderBy": [
            457,
            "[TaskTargetOrderByInput]"
          ]
        }
      ],
      "assignee": [
        551
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "TaskEdge": {
      "node": [
        428
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "TaskConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesBodyV2": [
        10
      ],
      "countEmptyBodyV2": [
        10
      ],
      "countNotEmptyBodyV2": [
        10
      ],
      "percentageEmptyBodyV2": [
        13
      ],
      "percentageNotEmptyBodyV2": [
        13
      ],
      "countUniqueValuesDueAt": [
        10
      ],
      "countEmptyDueAt": [
        10
      ],
      "countNotEmptyDueAt": [
        10
      ],
      "percentageEmptyDueAt": [
        13
      ],
      "percentageNotEmptyDueAt": [
        13
      ],
      "minDueAt": [
        7
      ],
      "maxDueAt": [
        7
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        429
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "TaskGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesTitle": [
        10
      ],
      "countEmptyTitle": [
        10
      ],
      "countNotEmptyTitle": [
        10
      ],
      "percentageEmptyTitle": [
        13
      ],
      "percentageNotEmptyTitle": [
        13
      ],
      "countUniqueValuesBodyV2": [
        10
      ],
      "countEmptyBodyV2": [
        10
      ],
      "countNotEmptyBodyV2": [
        10
      ],
      "percentageEmptyBodyV2": [
        13
      ],
      "percentageNotEmptyBodyV2": [
        13
      ],
      "countUniqueValuesDueAt": [
        10
      ],
      "countEmptyDueAt": [
        10
      ],
      "countNotEmptyDueAt": [
        10
      ],
      "percentageEmptyDueAt": [
        13
      ],
      "percentageNotEmptyDueAt": [
        13
      ],
      "minDueAt": [
        7
      ],
      "maxDueAt": [
        7
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        429
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "TaskRelationInput": {
      "connect": [
        433
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "TaskConnectInput": {
      "where": [
        434
      ],
      "__typename": [
        1
      ]
    },
    "TaskWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "TaskCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "title": [
        1
      ],
      "bodyV2": [
        102
      ],
      "dueAt": [
        7
      ],
      "status": [
        427
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "searchVector": [
        247
      ],
      "assigneeId": [
        22
      ],
      "assignee": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "TaskUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "title": [
        1
      ],
      "bodyV2": [
        103
      ],
      "dueAt": [
        7
      ],
      "status": [
        427
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "searchVector": [
        247
      ],
      "assigneeId": [
        22
      ],
      "assignee": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "TaskFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "title": [
        56
      ],
      "bodyV2": [
        104
      ],
      "dueAt": [
        7
      ],
      "status": [
        438
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        439
      ],
      "favorites": [
        440
      ],
      "taskTargets": [
        441
      ],
      "assigneeId": [
        33
      ],
      "timelineActivities": [
        442
      ],
      "and": [
        437
      ],
      "or": [
        437
      ],
      "not": [
        437
      ],
      "__typename": [
        1
      ]
    },
    "TaskStatusEnumFilter": {
      "eq": [
        427
      ],
      "neq": [
        427
      ],
      "in": [
        427
      ],
      "containsAny": [
        427
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_48ddbe67": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_e5711348": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "taskTargetsOneToManyFilter_4a14b92f": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "taskId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_4b7b19fc": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "TaskOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "position": [
        59
      ],
      "title": [
        59
      ],
      "bodyV2": [
        105
      ],
      "dueAt": [
        59
      ],
      "status": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "assigneeId": [
        59
      ],
      "assignee": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "TaskOrderByWithGroupByInput": {
      "aggregate": [
        445
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "position": [
        59
      ],
      "title": [
        59
      ],
      "bodyV2": [
        105
      ],
      "dueAt": [
        110
      ],
      "status": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "assigneeId": [
        59
      ],
      "assignee": [
        596
      ],
      "__typename": [
        1
      ]
    },
    "TaskOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesTitle": [
        59
      ],
      "countEmptyTitle": [
        59
      ],
      "countNotEmptyTitle": [
        59
      ],
      "percentageEmptyTitle": [
        59
      ],
      "percentageNotEmptyTitle": [
        59
      ],
      "countUniqueValuesBodyV2": [
        59
      ],
      "countEmptyBodyV2": [
        59
      ],
      "countNotEmptyBodyV2": [
        59
      ],
      "percentageEmptyBodyV2": [
        59
      ],
      "percentageNotEmptyBodyV2": [
        59
      ],
      "countUniqueValuesDueAt": [
        59
      ],
      "countEmptyDueAt": [
        59
      ],
      "countNotEmptyDueAt": [
        59
      ],
      "percentageEmptyDueAt": [
        59
      ],
      "percentageNotEmptyDueAt": [
        59
      ],
      "minDueAt": [
        59
      ],
      "maxDueAt": [
        59
      ],
      "countUniqueValuesStatus": [
        59
      ],
      "countEmptyStatus": [
        59
      ],
      "countNotEmptyStatus": [
        59
      ],
      "percentageEmptyStatus": [
        59
      ],
      "percentageNotEmptyStatus": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "assigneeId": [
        59
      ],
      "assignee": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "TaskGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "position": [
        6
      ],
      "title": [
        6
      ],
      "bodyV2": [
        106
      ],
      "dueAt": [
        109
      ],
      "status": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "searchVector": [
        6
      ],
      "assignee": [
        598
      ],
      "__typename": [
        1
      ]
    },
    "TaskTarget": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        22
      ],
      "targetOpportunityId": [
        22
      ],
      "targetPersonId": [
        22
      ],
      "taskId": [
        22
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetCompany": [
        599
      ],
      "targetOpportunity": [
        615
      ],
      "targetPerson": [
        629
      ],
      "task": [
        428
      ],
      "targetQaScorecard": [
        647
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetEdge": {
      "node": [
        447
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        448
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        448
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetRelationInput": {
      "connect": [
        452
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetConnectInput": {
      "where": [
        453
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "taskId": [
        22
      ],
      "task": [
        432
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "taskId": [
        22
      ],
      "task": [
        432
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "taskId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "and": [
        456
      ],
      "or": [
        456
      ],
      "not": [
        456
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "taskId": [
        59
      ],
      "task": [
        443
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetOrderByWithGroupByInput": {
      "aggregate": [
        459
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        611
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        626
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        641
      ],
      "taskId": [
        59
      ],
      "task": [
        444
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        666
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "taskId": [
        59
      ],
      "task": [
        443
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "TaskTargetGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "targetCompany": [
        613
      ],
      "targetOpportunity": [
        628
      ],
      "targetPerson": [
        643
      ],
      "task": [
        446
      ],
      "targetQaScorecard": [
        668
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivity": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        1
      ],
      "properties": [
        25
      ],
      "linkedRecordCachedName": [
        1
      ],
      "linkedRecordId": [
        2
      ],
      "linkedObjectMetadataId": [
        2
      ],
      "targetCompanyId": [
        22
      ],
      "targetDashboardId": [
        22
      ],
      "targetNoteId": [
        22
      ],
      "targetOpportunityId": [
        22
      ],
      "targetPersonId": [
        22
      ],
      "targetTaskId": [
        22
      ],
      "workspaceMemberId": [
        22
      ],
      "targetWorkflowId": [
        22
      ],
      "targetWorkflowVersionId": [
        22
      ],
      "targetWorkflowRunId": [
        22
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetCompany": [
        599
      ],
      "targetDashboard": [
        245
      ],
      "targetNote": [
        395
      ],
      "targetOpportunity": [
        615
      ],
      "targetPerson": [
        629
      ],
      "targetTask": [
        428
      ],
      "workspaceMember": [
        551
      ],
      "targetWorkflow": [
        476
      ],
      "targetWorkflowVersion": [
        534
      ],
      "targetWorkflowRun": [
        21
      ],
      "targetQaScorecard": [
        647
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityEdge": {
      "node": [
        461
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHappensAt": [
        10
      ],
      "countEmptyHappensAt": [
        10
      ],
      "countNotEmptyHappensAt": [
        10
      ],
      "percentageEmptyHappensAt": [
        13
      ],
      "percentageNotEmptyHappensAt": [
        13
      ],
      "minHappensAt": [
        7
      ],
      "maxHappensAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesProperties": [
        10
      ],
      "countEmptyProperties": [
        10
      ],
      "countNotEmptyProperties": [
        10
      ],
      "percentageEmptyProperties": [
        13
      ],
      "percentageNotEmptyProperties": [
        13
      ],
      "countUniqueValuesLinkedRecordCachedName": [
        10
      ],
      "countEmptyLinkedRecordCachedName": [
        10
      ],
      "countNotEmptyLinkedRecordCachedName": [
        10
      ],
      "percentageEmptyLinkedRecordCachedName": [
        13
      ],
      "percentageNotEmptyLinkedRecordCachedName": [
        13
      ],
      "countUniqueValuesLinkedRecordId": [
        10
      ],
      "countEmptyLinkedRecordId": [
        10
      ],
      "countNotEmptyLinkedRecordId": [
        10
      ],
      "percentageEmptyLinkedRecordId": [
        13
      ],
      "percentageNotEmptyLinkedRecordId": [
        13
      ],
      "countUniqueValuesLinkedObjectMetadataId": [
        10
      ],
      "countEmptyLinkedObjectMetadataId": [
        10
      ],
      "countNotEmptyLinkedObjectMetadataId": [
        10
      ],
      "percentageEmptyLinkedObjectMetadataId": [
        13
      ],
      "percentageNotEmptyLinkedObjectMetadataId": [
        13
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetDashboard": [
        10
      ],
      "countEmptyTargetDashboard": [
        10
      ],
      "countNotEmptyTargetDashboard": [
        10
      ],
      "percentageEmptyTargetDashboard": [
        13
      ],
      "percentageNotEmptyTargetDashboard": [
        13
      ],
      "countUniqueValuesTargetNote": [
        10
      ],
      "countEmptyTargetNote": [
        10
      ],
      "countNotEmptyTargetNote": [
        10
      ],
      "percentageEmptyTargetNote": [
        13
      ],
      "percentageNotEmptyTargetNote": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetTask": [
        10
      ],
      "countEmptyTargetTask": [
        10
      ],
      "countNotEmptyTargetTask": [
        10
      ],
      "percentageEmptyTargetTask": [
        13
      ],
      "percentageNotEmptyTargetTask": [
        13
      ],
      "countUniqueValuesTargetWorkflow": [
        10
      ],
      "countEmptyTargetWorkflow": [
        10
      ],
      "countNotEmptyTargetWorkflow": [
        10
      ],
      "percentageEmptyTargetWorkflow": [
        13
      ],
      "percentageNotEmptyTargetWorkflow": [
        13
      ],
      "countUniqueValuesTargetWorkflowVersion": [
        10
      ],
      "countEmptyTargetWorkflowVersion": [
        10
      ],
      "countNotEmptyTargetWorkflowVersion": [
        10
      ],
      "percentageEmptyTargetWorkflowVersion": [
        13
      ],
      "percentageNotEmptyTargetWorkflowVersion": [
        13
      ],
      "countUniqueValuesTargetWorkflowRun": [
        10
      ],
      "countEmptyTargetWorkflowRun": [
        10
      ],
      "countNotEmptyTargetWorkflowRun": [
        10
      ],
      "percentageEmptyTargetWorkflowRun": [
        13
      ],
      "percentageNotEmptyTargetWorkflowRun": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        462
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesHappensAt": [
        10
      ],
      "countEmptyHappensAt": [
        10
      ],
      "countNotEmptyHappensAt": [
        10
      ],
      "percentageEmptyHappensAt": [
        13
      ],
      "percentageNotEmptyHappensAt": [
        13
      ],
      "minHappensAt": [
        7
      ],
      "maxHappensAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesProperties": [
        10
      ],
      "countEmptyProperties": [
        10
      ],
      "countNotEmptyProperties": [
        10
      ],
      "percentageEmptyProperties": [
        13
      ],
      "percentageNotEmptyProperties": [
        13
      ],
      "countUniqueValuesLinkedRecordCachedName": [
        10
      ],
      "countEmptyLinkedRecordCachedName": [
        10
      ],
      "countNotEmptyLinkedRecordCachedName": [
        10
      ],
      "percentageEmptyLinkedRecordCachedName": [
        13
      ],
      "percentageNotEmptyLinkedRecordCachedName": [
        13
      ],
      "countUniqueValuesLinkedRecordId": [
        10
      ],
      "countEmptyLinkedRecordId": [
        10
      ],
      "countNotEmptyLinkedRecordId": [
        10
      ],
      "percentageEmptyLinkedRecordId": [
        13
      ],
      "percentageNotEmptyLinkedRecordId": [
        13
      ],
      "countUniqueValuesLinkedObjectMetadataId": [
        10
      ],
      "countEmptyLinkedObjectMetadataId": [
        10
      ],
      "countNotEmptyLinkedObjectMetadataId": [
        10
      ],
      "percentageEmptyLinkedObjectMetadataId": [
        13
      ],
      "percentageNotEmptyLinkedObjectMetadataId": [
        13
      ],
      "countUniqueValuesTargetCompany": [
        10
      ],
      "countEmptyTargetCompany": [
        10
      ],
      "countNotEmptyTargetCompany": [
        10
      ],
      "percentageEmptyTargetCompany": [
        13
      ],
      "percentageNotEmptyTargetCompany": [
        13
      ],
      "countUniqueValuesTargetDashboard": [
        10
      ],
      "countEmptyTargetDashboard": [
        10
      ],
      "countNotEmptyTargetDashboard": [
        10
      ],
      "percentageEmptyTargetDashboard": [
        13
      ],
      "percentageNotEmptyTargetDashboard": [
        13
      ],
      "countUniqueValuesTargetNote": [
        10
      ],
      "countEmptyTargetNote": [
        10
      ],
      "countNotEmptyTargetNote": [
        10
      ],
      "percentageEmptyTargetNote": [
        13
      ],
      "percentageNotEmptyTargetNote": [
        13
      ],
      "countUniqueValuesTargetOpportunity": [
        10
      ],
      "countEmptyTargetOpportunity": [
        10
      ],
      "countNotEmptyTargetOpportunity": [
        10
      ],
      "percentageEmptyTargetOpportunity": [
        13
      ],
      "percentageNotEmptyTargetOpportunity": [
        13
      ],
      "countUniqueValuesTargetPerson": [
        10
      ],
      "countEmptyTargetPerson": [
        10
      ],
      "countNotEmptyTargetPerson": [
        10
      ],
      "percentageEmptyTargetPerson": [
        13
      ],
      "percentageNotEmptyTargetPerson": [
        13
      ],
      "countUniqueValuesTargetTask": [
        10
      ],
      "countEmptyTargetTask": [
        10
      ],
      "countNotEmptyTargetTask": [
        10
      ],
      "percentageEmptyTargetTask": [
        13
      ],
      "percentageNotEmptyTargetTask": [
        13
      ],
      "countUniqueValuesTargetWorkflow": [
        10
      ],
      "countEmptyTargetWorkflow": [
        10
      ],
      "countNotEmptyTargetWorkflow": [
        10
      ],
      "percentageEmptyTargetWorkflow": [
        13
      ],
      "percentageNotEmptyTargetWorkflow": [
        13
      ],
      "countUniqueValuesTargetWorkflowVersion": [
        10
      ],
      "countEmptyTargetWorkflowVersion": [
        10
      ],
      "countNotEmptyTargetWorkflowVersion": [
        10
      ],
      "percentageEmptyTargetWorkflowVersion": [
        13
      ],
      "percentageNotEmptyTargetWorkflowVersion": [
        13
      ],
      "countUniqueValuesTargetWorkflowRun": [
        10
      ],
      "countEmptyTargetWorkflowRun": [
        10
      ],
      "countNotEmptyTargetWorkflowRun": [
        10
      ],
      "percentageEmptyTargetWorkflowRun": [
        13
      ],
      "percentageNotEmptyTargetWorkflowRun": [
        13
      ],
      "countUniqueValuesTargetQaScorecard": [
        10
      ],
      "countEmptyTargetQaScorecard": [
        10
      ],
      "countNotEmptyTargetQaScorecard": [
        10
      ],
      "percentageEmptyTargetQaScorecard": [
        13
      ],
      "percentageNotEmptyTargetQaScorecard": [
        13
      ],
      "edges": [
        462
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityRelationInput": {
      "connect": [
        466
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityConnectInput": {
      "where": [
        467
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        1
      ],
      "properties": [
        25
      ],
      "linkedRecordCachedName": [
        1
      ],
      "linkedRecordId": [
        2
      ],
      "linkedObjectMetadataId": [
        2
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "targetDashboardId": [
        22
      ],
      "targetDashboard": [
        251
      ],
      "targetNoteId": [
        22
      ],
      "targetNote": [
        399
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "targetTaskId": [
        22
      ],
      "targetTask": [
        432
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "targetWorkflowId": [
        22
      ],
      "targetWorkflow": [
        480
      ],
      "targetWorkflowVersionId": [
        22
      ],
      "targetWorkflowVersion": [
        538
      ],
      "targetWorkflowRunId": [
        22
      ],
      "targetWorkflowRun": [
        523
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        1
      ],
      "properties": [
        25
      ],
      "linkedRecordCachedName": [
        1
      ],
      "linkedRecordId": [
        2
      ],
      "linkedObjectMetadataId": [
        2
      ],
      "targetCompanyId": [
        22
      ],
      "targetCompany": [
        603
      ],
      "targetDashboardId": [
        22
      ],
      "targetDashboard": [
        251
      ],
      "targetNoteId": [
        22
      ],
      "targetNote": [
        399
      ],
      "targetOpportunityId": [
        22
      ],
      "targetOpportunity": [
        619
      ],
      "targetPersonId": [
        22
      ],
      "targetPerson": [
        633
      ],
      "targetTaskId": [
        22
      ],
      "targetTask": [
        432
      ],
      "workspaceMemberId": [
        22
      ],
      "workspaceMember": [
        555
      ],
      "targetWorkflowId": [
        22
      ],
      "targetWorkflow": [
        480
      ],
      "targetWorkflowVersionId": [
        22
      ],
      "targetWorkflowVersion": [
        538
      ],
      "targetWorkflowRunId": [
        22
      ],
      "targetWorkflowRun": [
        523
      ],
      "targetQaScorecardId": [
        22
      ],
      "targetQaScorecard": [
        651
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "and": [
        470
      ],
      "or": [
        470
      ],
      "not": [
        470
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "happensAt": [
        59
      ],
      "name": [
        59
      ],
      "properties": [
        59
      ],
      "linkedRecordCachedName": [
        59
      ],
      "linkedRecordId": [
        59
      ],
      "linkedObjectMetadataId": [
        59
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "targetDashboardId": [
        59
      ],
      "targetDashboard": [
        261
      ],
      "targetNoteId": [
        59
      ],
      "targetNote": [
        409
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "targetTaskId": [
        59
      ],
      "targetTask": [
        443
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "targetWorkflowId": [
        59
      ],
      "targetWorkflow": [
        501
      ],
      "targetWorkflowVersionId": [
        59
      ],
      "targetWorkflowVersion": [
        544
      ],
      "targetWorkflowRunId": [
        59
      ],
      "targetWorkflowRun": [
        529
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityOrderByWithGroupByInput": {
      "aggregate": [
        473
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "happensAt": [
        110
      ],
      "name": [
        59
      ],
      "properties": [
        59
      ],
      "linkedRecordCachedName": [
        59
      ],
      "linkedRecordId": [
        59
      ],
      "linkedObjectMetadataId": [
        59
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        611
      ],
      "targetDashboardId": [
        59
      ],
      "targetDashboard": [
        262
      ],
      "targetNoteId": [
        59
      ],
      "targetNote": [
        410
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        626
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        641
      ],
      "targetTaskId": [
        59
      ],
      "targetTask": [
        444
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        596
      ],
      "targetWorkflowId": [
        59
      ],
      "targetWorkflow": [
        502
      ],
      "targetWorkflowVersionId": [
        59
      ],
      "targetWorkflowVersion": [
        545
      ],
      "targetWorkflowRunId": [
        59
      ],
      "targetWorkflowRun": [
        530
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        666
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesHappensAt": [
        59
      ],
      "countEmptyHappensAt": [
        59
      ],
      "countNotEmptyHappensAt": [
        59
      ],
      "percentageEmptyHappensAt": [
        59
      ],
      "percentageNotEmptyHappensAt": [
        59
      ],
      "minHappensAt": [
        59
      ],
      "maxHappensAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesProperties": [
        59
      ],
      "countEmptyProperties": [
        59
      ],
      "countNotEmptyProperties": [
        59
      ],
      "percentageEmptyProperties": [
        59
      ],
      "percentageNotEmptyProperties": [
        59
      ],
      "countUniqueValuesLinkedRecordCachedName": [
        59
      ],
      "countEmptyLinkedRecordCachedName": [
        59
      ],
      "countNotEmptyLinkedRecordCachedName": [
        59
      ],
      "percentageEmptyLinkedRecordCachedName": [
        59
      ],
      "percentageNotEmptyLinkedRecordCachedName": [
        59
      ],
      "countUniqueValuesLinkedRecordId": [
        59
      ],
      "countEmptyLinkedRecordId": [
        59
      ],
      "countNotEmptyLinkedRecordId": [
        59
      ],
      "percentageEmptyLinkedRecordId": [
        59
      ],
      "percentageNotEmptyLinkedRecordId": [
        59
      ],
      "countUniqueValuesLinkedObjectMetadataId": [
        59
      ],
      "countEmptyLinkedObjectMetadataId": [
        59
      ],
      "countNotEmptyLinkedObjectMetadataId": [
        59
      ],
      "percentageEmptyLinkedObjectMetadataId": [
        59
      ],
      "percentageNotEmptyLinkedObjectMetadataId": [
        59
      ],
      "targetCompanyId": [
        59
      ],
      "targetCompany": [
        610
      ],
      "targetDashboardId": [
        59
      ],
      "targetDashboard": [
        261
      ],
      "targetNoteId": [
        59
      ],
      "targetNote": [
        409
      ],
      "targetOpportunityId": [
        59
      ],
      "targetOpportunity": [
        625
      ],
      "targetPersonId": [
        59
      ],
      "targetPerson": [
        640
      ],
      "targetTaskId": [
        59
      ],
      "targetTask": [
        443
      ],
      "workspaceMemberId": [
        59
      ],
      "workspaceMember": [
        595
      ],
      "targetWorkflowId": [
        59
      ],
      "targetWorkflow": [
        501
      ],
      "targetWorkflowVersionId": [
        59
      ],
      "targetWorkflowVersion": [
        544
      ],
      "targetWorkflowRunId": [
        59
      ],
      "targetWorkflowRun": [
        529
      ],
      "targetQaScorecardId": [
        59
      ],
      "targetQaScorecard": [
        665
      ],
      "__typename": [
        1
      ]
    },
    "TimelineActivityGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "happensAt": [
        109
      ],
      "name": [
        6
      ],
      "properties": [
        6
      ],
      "linkedRecordCachedName": [
        6
      ],
      "linkedRecordId": [
        6
      ],
      "linkedObjectMetadataId": [
        6
      ],
      "targetCompany": [
        613
      ],
      "targetDashboard": [
        264
      ],
      "targetNote": [
        412
      ],
      "targetOpportunity": [
        628
      ],
      "targetPerson": [
        643
      ],
      "targetTask": [
        446
      ],
      "workspaceMember": [
        598
      ],
      "targetWorkflow": [
        504
      ],
      "targetWorkflowVersion": [
        547
      ],
      "targetWorkflowRun": [
        532
      ],
      "targetQaScorecard": [
        668
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowStatusesEnum": {},
    "Workflow": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "lastPublishedVersionId": [
        1
      ],
      "statuses": [
        475
      ],
      "position": [
        246
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "searchVector": [
        247
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "versions": [
        536,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            543
          ],
          "orderBy": [
            544,
            "[WorkflowVersionOrderByInput]"
          ]
        }
      ],
      "runs": [
        521,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            528
          ],
          "orderBy": [
            529,
            "[WorkflowRunOrderByInput]"
          ]
        }
      ],
      "automatedTriggers": [
        508,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            515
          ],
          "orderBy": [
            516,
            "[WorkflowAutomatedTriggerOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowEdge": {
      "node": [
        476
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesLastPublishedVersionId": [
        10
      ],
      "countEmptyLastPublishedVersionId": [
        10
      ],
      "countNotEmptyLastPublishedVersionId": [
        10
      ],
      "percentageEmptyLastPublishedVersionId": [
        13
      ],
      "percentageNotEmptyLastPublishedVersionId": [
        13
      ],
      "countUniqueValuesStatuses": [
        10
      ],
      "countEmptyStatuses": [
        10
      ],
      "countNotEmptyStatuses": [
        10
      ],
      "percentageEmptyStatuses": [
        13
      ],
      "percentageNotEmptyStatuses": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        477
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesLastPublishedVersionId": [
        10
      ],
      "countEmptyLastPublishedVersionId": [
        10
      ],
      "countNotEmptyLastPublishedVersionId": [
        10
      ],
      "percentageEmptyLastPublishedVersionId": [
        13
      ],
      "percentageNotEmptyLastPublishedVersionId": [
        13
      ],
      "countUniqueValuesStatuses": [
        10
      ],
      "countEmptyStatuses": [
        10
      ],
      "countNotEmptyStatuses": [
        10
      ],
      "percentageEmptyStatuses": [
        13
      ],
      "percentageNotEmptyStatuses": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        477
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRelationInput": {
      "connect": [
        481
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowConnectInput": {
      "where": [
        482
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "lastPublishedVersionId": [
        1
      ],
      "statuses": [
        475
      ],
      "position": [
        246
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "searchVector": [
        247
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "lastPublishedVersionId": [
        1
      ],
      "statuses": [
        475
      ],
      "position": [
        246
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "searchVector": [
        247
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "lastPublishedVersionId": [
        56
      ],
      "statuses": [
        486
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        487
      ],
      "favorites": [
        488
      ],
      "timelineActivities": [
        489
      ],
      "versions": [
        490
      ],
      "runs": [
        498
      ],
      "automatedTriggers": [
        499
      ],
      "and": [
        485
      ],
      "or": [
        485
      ],
      "not": [
        485
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowStatusesEnumFilter": {
      "eq": [
        475
      ],
      "neq": [
        475
      ],
      "in": [
        475
      ],
      "containsAny": [
        475
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_62104da9": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_b8c90c15": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_7a4cec80": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "versionsOneToManyFilter_f0313ce8": {
      "is": [
        34
      ],
      "position": [
        179
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "trigger": [
        57
      ],
      "steps": [
        57
      ],
      "status": [
        491
      ],
      "searchVector": [
        257
      ],
      "favorites": [
        492
      ],
      "timelineActivities": [
        493
      ],
      "workflowId": [
        33
      ],
      "runs": [
        494
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionStatusEnumFilter": {
      "eq": [
        533
      ],
      "neq": [
        533
      ],
      "in": [
        533
      ],
      "containsAny": [
        533
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_6560d29b": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_6bf8d98c": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "runsOneToManyFilter_ea4a6def": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "enqueuedAt": [
        7
      ],
      "startedAt": [
        7
      ],
      "endedAt": [
        7
      ],
      "status": [
        495
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "state": [
        57
      ],
      "context": [
        57
      ],
      "output": [
        57
      ],
      "position": [
        179
      ],
      "searchVector": [
        257
      ],
      "favorites": [
        496
      ],
      "timelineActivities": [
        497
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunStatusEnumFilter": {
      "eq": [
        23
      ],
      "neq": [
        23
      ],
      "in": [
        23
      ],
      "containsAny": [
        23
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_e6718080": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_3941e3bc": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "runsOneToManyFilter_f9ee9241": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "enqueuedAt": [
        7
      ],
      "startedAt": [
        7
      ],
      "endedAt": [
        7
      ],
      "status": [
        495
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "state": [
        57
      ],
      "context": [
        57
      ],
      "output": [
        57
      ],
      "position": [
        179
      ],
      "searchVector": [
        257
      ],
      "favorites": [
        496
      ],
      "timelineActivities": [
        497
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "automatedTriggersOneToManyFilter_45efadc7": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "type": [
        500
      ],
      "settings": [
        57
      ],
      "workflowId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerTypeEnumFilter": {
      "eq": [
        505
      ],
      "neq": [
        505
      ],
      "in": [
        505
      ],
      "containsAny": [
        505
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        59
      ],
      "lastPublishedVersionId": [
        59
      ],
      "statuses": [
        59
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowOrderByWithGroupByInput": {
      "aggregate": [
        503
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        59
      ],
      "lastPublishedVersionId": [
        59
      ],
      "statuses": [
        59
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesLastPublishedVersionId": [
        59
      ],
      "countEmptyLastPublishedVersionId": [
        59
      ],
      "countNotEmptyLastPublishedVersionId": [
        59
      ],
      "percentageEmptyLastPublishedVersionId": [
        59
      ],
      "percentageNotEmptyLastPublishedVersionId": [
        59
      ],
      "countUniqueValuesStatuses": [
        59
      ],
      "countEmptyStatuses": [
        59
      ],
      "countNotEmptyStatuses": [
        59
      ],
      "percentageEmptyStatuses": [
        59
      ],
      "percentageNotEmptyStatuses": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        6
      ],
      "lastPublishedVersionId": [
        6
      ],
      "statuses": [
        6
      ],
      "position": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "searchVector": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerTypeEnum": {},
    "WorkflowAutomatedTrigger": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "type": [
        505
      ],
      "settings": [
        25
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        476
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerEdge": {
      "node": [
        506
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesType": [
        10
      ],
      "countEmptyType": [
        10
      ],
      "countNotEmptyType": [
        10
      ],
      "percentageEmptyType": [
        13
      ],
      "percentageNotEmptyType": [
        13
      ],
      "countUniqueValuesSettings": [
        10
      ],
      "countEmptySettings": [
        10
      ],
      "countNotEmptySettings": [
        10
      ],
      "percentageEmptySettings": [
        13
      ],
      "percentageNotEmptySettings": [
        13
      ],
      "edges": [
        507
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesType": [
        10
      ],
      "countEmptyType": [
        10
      ],
      "countNotEmptyType": [
        10
      ],
      "percentageEmptyType": [
        13
      ],
      "percentageNotEmptyType": [
        13
      ],
      "countUniqueValuesSettings": [
        10
      ],
      "countEmptySettings": [
        10
      ],
      "countNotEmptySettings": [
        10
      ],
      "percentageEmptySettings": [
        13
      ],
      "percentageNotEmptySettings": [
        13
      ],
      "edges": [
        507
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerRelationInput": {
      "connect": [
        511
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerConnectInput": {
      "where": [
        512
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "type": [
        505
      ],
      "settings": [
        25
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "type": [
        505
      ],
      "settings": [
        25
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "type": [
        500
      ],
      "settings": [
        57
      ],
      "workflowId": [
        33
      ],
      "and": [
        515
      ],
      "or": [
        515
      ],
      "not": [
        515
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "type": [
        59
      ],
      "settings": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerOrderByWithGroupByInput": {
      "aggregate": [
        518
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "type": [
        59
      ],
      "settings": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        502
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesType": [
        59
      ],
      "countEmptyType": [
        59
      ],
      "countNotEmptyType": [
        59
      ],
      "percentageEmptyType": [
        59
      ],
      "percentageNotEmptyType": [
        59
      ],
      "countUniqueValuesSettings": [
        59
      ],
      "countEmptySettings": [
        59
      ],
      "countNotEmptySettings": [
        59
      ],
      "percentageEmptySettings": [
        59
      ],
      "percentageNotEmptySettings": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowAutomatedTriggerGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "type": [
        6
      ],
      "settings": [
        6
      ],
      "workflow": [
        504
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunEdge": {
      "node": [
        21
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesEnqueuedAt": [
        10
      ],
      "countEmptyEnqueuedAt": [
        10
      ],
      "countNotEmptyEnqueuedAt": [
        10
      ],
      "percentageEmptyEnqueuedAt": [
        13
      ],
      "percentageNotEmptyEnqueuedAt": [
        13
      ],
      "minEnqueuedAt": [
        7
      ],
      "maxEnqueuedAt": [
        7
      ],
      "countUniqueValuesStartedAt": [
        10
      ],
      "countEmptyStartedAt": [
        10
      ],
      "countNotEmptyStartedAt": [
        10
      ],
      "percentageEmptyStartedAt": [
        13
      ],
      "percentageNotEmptyStartedAt": [
        13
      ],
      "minStartedAt": [
        7
      ],
      "maxStartedAt": [
        7
      ],
      "countUniqueValuesEndedAt": [
        10
      ],
      "countEmptyEndedAt": [
        10
      ],
      "countNotEmptyEndedAt": [
        10
      ],
      "percentageEmptyEndedAt": [
        13
      ],
      "percentageNotEmptyEndedAt": [
        13
      ],
      "minEndedAt": [
        7
      ],
      "maxEndedAt": [
        7
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesState": [
        10
      ],
      "countEmptyState": [
        10
      ],
      "countNotEmptyState": [
        10
      ],
      "percentageEmptyState": [
        13
      ],
      "percentageNotEmptyState": [
        13
      ],
      "countUniqueValuesContext": [
        10
      ],
      "countEmptyContext": [
        10
      ],
      "countNotEmptyContext": [
        10
      ],
      "percentageEmptyContext": [
        13
      ],
      "percentageNotEmptyContext": [
        13
      ],
      "countUniqueValuesOutput": [
        10
      ],
      "countEmptyOutput": [
        10
      ],
      "countNotEmptyOutput": [
        10
      ],
      "percentageEmptyOutput": [
        13
      ],
      "percentageNotEmptyOutput": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        520
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesEnqueuedAt": [
        10
      ],
      "countEmptyEnqueuedAt": [
        10
      ],
      "countNotEmptyEnqueuedAt": [
        10
      ],
      "percentageEmptyEnqueuedAt": [
        13
      ],
      "percentageNotEmptyEnqueuedAt": [
        13
      ],
      "minEnqueuedAt": [
        7
      ],
      "maxEnqueuedAt": [
        7
      ],
      "countUniqueValuesStartedAt": [
        10
      ],
      "countEmptyStartedAt": [
        10
      ],
      "countNotEmptyStartedAt": [
        10
      ],
      "percentageEmptyStartedAt": [
        13
      ],
      "percentageNotEmptyStartedAt": [
        13
      ],
      "minStartedAt": [
        7
      ],
      "maxStartedAt": [
        7
      ],
      "countUniqueValuesEndedAt": [
        10
      ],
      "countEmptyEndedAt": [
        10
      ],
      "countNotEmptyEndedAt": [
        10
      ],
      "percentageEmptyEndedAt": [
        13
      ],
      "percentageNotEmptyEndedAt": [
        13
      ],
      "minEndedAt": [
        7
      ],
      "maxEndedAt": [
        7
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesState": [
        10
      ],
      "countEmptyState": [
        10
      ],
      "countNotEmptyState": [
        10
      ],
      "percentageEmptyState": [
        13
      ],
      "percentageNotEmptyState": [
        13
      ],
      "countUniqueValuesContext": [
        10
      ],
      "countEmptyContext": [
        10
      ],
      "countNotEmptyContext": [
        10
      ],
      "percentageEmptyContext": [
        13
      ],
      "percentageNotEmptyContext": [
        13
      ],
      "countUniqueValuesOutput": [
        10
      ],
      "countEmptyOutput": [
        10
      ],
      "countNotEmptyOutput": [
        10
      ],
      "percentageEmptyOutput": [
        13
      ],
      "percentageNotEmptyOutput": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        520
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunRelationInput": {
      "connect": [
        524
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunConnectInput": {
      "where": [
        525
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "enqueuedAt": [
        7
      ],
      "startedAt": [
        7
      ],
      "endedAt": [
        7
      ],
      "status": [
        23
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "state": [
        25
      ],
      "context": [
        25
      ],
      "output": [
        25
      ],
      "position": [
        246
      ],
      "searchVector": [
        247
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "workflowVersionId": [
        22
      ],
      "workflowVersion": [
        538
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "enqueuedAt": [
        7
      ],
      "startedAt": [
        7
      ],
      "endedAt": [
        7
      ],
      "status": [
        23
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "state": [
        25
      ],
      "context": [
        25
      ],
      "output": [
        25
      ],
      "position": [
        246
      ],
      "searchVector": [
        247
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "workflowVersionId": [
        22
      ],
      "workflowVersion": [
        538
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "enqueuedAt": [
        7
      ],
      "startedAt": [
        7
      ],
      "endedAt": [
        7
      ],
      "status": [
        495
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "state": [
        57
      ],
      "context": [
        57
      ],
      "output": [
        57
      ],
      "position": [
        179
      ],
      "searchVector": [
        257
      ],
      "favorites": [
        496
      ],
      "timelineActivities": [
        497
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "and": [
        528
      ],
      "or": [
        528
      ],
      "not": [
        528
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        59
      ],
      "enqueuedAt": [
        59
      ],
      "startedAt": [
        59
      ],
      "endedAt": [
        59
      ],
      "status": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "state": [
        59
      ],
      "context": [
        59
      ],
      "output": [
        59
      ],
      "position": [
        59
      ],
      "searchVector": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "workflowVersionId": [
        59
      ],
      "workflowVersion": [
        544
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunOrderByWithGroupByInput": {
      "aggregate": [
        531
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        59
      ],
      "enqueuedAt": [
        110
      ],
      "startedAt": [
        110
      ],
      "endedAt": [
        110
      ],
      "status": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "state": [
        59
      ],
      "context": [
        59
      ],
      "output": [
        59
      ],
      "position": [
        59
      ],
      "searchVector": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        502
      ],
      "workflowVersionId": [
        59
      ],
      "workflowVersion": [
        545
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesEnqueuedAt": [
        59
      ],
      "countEmptyEnqueuedAt": [
        59
      ],
      "countNotEmptyEnqueuedAt": [
        59
      ],
      "percentageEmptyEnqueuedAt": [
        59
      ],
      "percentageNotEmptyEnqueuedAt": [
        59
      ],
      "minEnqueuedAt": [
        59
      ],
      "maxEnqueuedAt": [
        59
      ],
      "countUniqueValuesStartedAt": [
        59
      ],
      "countEmptyStartedAt": [
        59
      ],
      "countNotEmptyStartedAt": [
        59
      ],
      "percentageEmptyStartedAt": [
        59
      ],
      "percentageNotEmptyStartedAt": [
        59
      ],
      "minStartedAt": [
        59
      ],
      "maxStartedAt": [
        59
      ],
      "countUniqueValuesEndedAt": [
        59
      ],
      "countEmptyEndedAt": [
        59
      ],
      "countNotEmptyEndedAt": [
        59
      ],
      "percentageEmptyEndedAt": [
        59
      ],
      "percentageNotEmptyEndedAt": [
        59
      ],
      "minEndedAt": [
        59
      ],
      "maxEndedAt": [
        59
      ],
      "countUniqueValuesStatus": [
        59
      ],
      "countEmptyStatus": [
        59
      ],
      "countNotEmptyStatus": [
        59
      ],
      "percentageEmptyStatus": [
        59
      ],
      "percentageNotEmptyStatus": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesState": [
        59
      ],
      "countEmptyState": [
        59
      ],
      "countNotEmptyState": [
        59
      ],
      "percentageEmptyState": [
        59
      ],
      "percentageNotEmptyState": [
        59
      ],
      "countUniqueValuesContext": [
        59
      ],
      "countEmptyContext": [
        59
      ],
      "countNotEmptyContext": [
        59
      ],
      "percentageEmptyContext": [
        59
      ],
      "percentageNotEmptyContext": [
        59
      ],
      "countUniqueValuesOutput": [
        59
      ],
      "countEmptyOutput": [
        59
      ],
      "countNotEmptyOutput": [
        59
      ],
      "percentageEmptyOutput": [
        59
      ],
      "percentageNotEmptyOutput": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "workflowVersionId": [
        59
      ],
      "workflowVersion": [
        544
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        6
      ],
      "enqueuedAt": [
        109
      ],
      "startedAt": [
        109
      ],
      "endedAt": [
        109
      ],
      "status": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "state": [
        6
      ],
      "context": [
        6
      ],
      "output": [
        6
      ],
      "position": [
        6
      ],
      "searchVector": [
        6
      ],
      "workflow": [
        504
      ],
      "workflowVersion": [
        547
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionStatusEnum": {},
    "WorkflowVersion": {
      "position": [
        246
      ],
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "trigger": [
        25
      ],
      "steps": [
        25
      ],
      "status": [
        533
      ],
      "searchVector": [
        247
      ],
      "workflowId": [
        22
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "workflow": [
        476
      ],
      "runs": [
        521,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            528
          ],
          "orderBy": [
            529,
            "[WorkflowRunOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionEdge": {
      "node": [
        534
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesTrigger": [
        10
      ],
      "countEmptyTrigger": [
        10
      ],
      "countNotEmptyTrigger": [
        10
      ],
      "percentageEmptyTrigger": [
        13
      ],
      "percentageNotEmptyTrigger": [
        13
      ],
      "countUniqueValuesSteps": [
        10
      ],
      "countEmptySteps": [
        10
      ],
      "countNotEmptySteps": [
        10
      ],
      "percentageEmptySteps": [
        13
      ],
      "percentageNotEmptySteps": [
        13
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        535
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesTrigger": [
        10
      ],
      "countEmptyTrigger": [
        10
      ],
      "countNotEmptyTrigger": [
        10
      ],
      "percentageEmptyTrigger": [
        13
      ],
      "percentageNotEmptyTrigger": [
        13
      ],
      "countUniqueValuesSteps": [
        10
      ],
      "countEmptySteps": [
        10
      ],
      "countNotEmptySteps": [
        10
      ],
      "percentageEmptySteps": [
        13
      ],
      "percentageNotEmptySteps": [
        13
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        535
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionRelationInput": {
      "connect": [
        539
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionConnectInput": {
      "where": [
        540
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionCreateInput": {
      "position": [
        246
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "trigger": [
        25
      ],
      "steps": [
        25
      ],
      "status": [
        533
      ],
      "searchVector": [
        247
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionUpdateInput": {
      "position": [
        246
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "trigger": [
        25
      ],
      "steps": [
        25
      ],
      "status": [
        533
      ],
      "searchVector": [
        247
      ],
      "workflowId": [
        22
      ],
      "workflow": [
        480
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionFilterInput": {
      "position": [
        179
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "trigger": [
        57
      ],
      "steps": [
        57
      ],
      "status": [
        491
      ],
      "searchVector": [
        257
      ],
      "favorites": [
        492
      ],
      "timelineActivities": [
        493
      ],
      "workflowId": [
        33
      ],
      "runs": [
        494
      ],
      "and": [
        543
      ],
      "or": [
        543
      ],
      "not": [
        543
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionOrderByInput": {
      "position": [
        59
      ],
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        59
      ],
      "trigger": [
        59
      ],
      "steps": [
        59
      ],
      "status": [
        59
      ],
      "searchVector": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionOrderByWithGroupByInput": {
      "aggregate": [
        546
      ],
      "position": [
        59
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        59
      ],
      "trigger": [
        59
      ],
      "steps": [
        59
      ],
      "status": [
        59
      ],
      "searchVector": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        502
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesTrigger": [
        59
      ],
      "countEmptyTrigger": [
        59
      ],
      "countNotEmptyTrigger": [
        59
      ],
      "percentageEmptyTrigger": [
        59
      ],
      "percentageNotEmptyTrigger": [
        59
      ],
      "countUniqueValuesSteps": [
        59
      ],
      "countEmptySteps": [
        59
      ],
      "countNotEmptySteps": [
        59
      ],
      "percentageEmptySteps": [
        59
      ],
      "percentageNotEmptySteps": [
        59
      ],
      "countUniqueValuesStatus": [
        59
      ],
      "countEmptyStatus": [
        59
      ],
      "countNotEmptyStatus": [
        59
      ],
      "percentageEmptyStatus": [
        59
      ],
      "percentageNotEmptyStatus": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "workflowId": [
        59
      ],
      "workflow": [
        501
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionGroupByInput": {
      "position": [
        6
      ],
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        6
      ],
      "trigger": [
        6
      ],
      "steps": [
        6
      ],
      "status": [
        6
      ],
      "searchVector": [
        6
      ],
      "workflow": [
        504
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberDateFormatEnum": {},
    "WorkspaceMemberTimeFormatEnum": {},
    "WorkspaceMemberNumberFormatEnum": {},
    "WorkspaceMember": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "name": [
        69
      ],
      "colorScheme": [
        1
      ],
      "locale": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "userEmail": [
        1
      ],
      "userId": [
        2
      ],
      "timeZone": [
        1
      ],
      "dateFormat": [
        548
      ],
      "timeFormat": [
        549
      ],
      "numberFormat": [
        550
      ],
      "searchVector": [
        247
      ],
      "calendarStartDay": [
        10
      ],
      "blocklist": [
        134,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            141
          ],
          "orderBy": [
            142,
            "[BlocklistOrderByInput]"
          ]
        }
      ],
      "calendarEventParticipants": [
        188,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            195
          ],
          "orderBy": [
            197,
            "[CalendarEventParticipantOrderByInput]"
          ]
        }
      ],
      "accountOwnerForCompanies": [
        601,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            609
          ],
          "orderBy": [
            610,
            "[CompanyOrderByInput]"
          ]
        }
      ],
      "connectedAccounts": [
        219,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            226
          ],
          "orderBy": [
            241,
            "[ConnectedAccountOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "messageParticipants": [
        348,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            355
          ],
          "orderBy": [
            357,
            "[MessageParticipantOrderByInput]"
          ]
        }
      ],
      "ownedOpportunities": [
        617,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            624
          ],
          "orderBy": [
            625,
            "[OpportunityOrderByInput]"
          ]
        }
      ],
      "assignedTasks": [
        430,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            437
          ],
          "orderBy": [
            443,
            "[TaskOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberEdge": {
      "node": [
        551
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesColorScheme": [
        10
      ],
      "countEmptyColorScheme": [
        10
      ],
      "countNotEmptyColorScheme": [
        10
      ],
      "percentageEmptyColorScheme": [
        13
      ],
      "percentageNotEmptyColorScheme": [
        13
      ],
      "countUniqueValuesLocale": [
        10
      ],
      "countEmptyLocale": [
        10
      ],
      "countNotEmptyLocale": [
        10
      ],
      "percentageEmptyLocale": [
        13
      ],
      "percentageNotEmptyLocale": [
        13
      ],
      "countUniqueValuesAvatarUrl": [
        10
      ],
      "countEmptyAvatarUrl": [
        10
      ],
      "countNotEmptyAvatarUrl": [
        10
      ],
      "percentageEmptyAvatarUrl": [
        13
      ],
      "percentageNotEmptyAvatarUrl": [
        13
      ],
      "countUniqueValuesUserEmail": [
        10
      ],
      "countEmptyUserEmail": [
        10
      ],
      "countNotEmptyUserEmail": [
        10
      ],
      "percentageEmptyUserEmail": [
        13
      ],
      "percentageNotEmptyUserEmail": [
        13
      ],
      "countUniqueValuesUserId": [
        10
      ],
      "countEmptyUserId": [
        10
      ],
      "countNotEmptyUserId": [
        10
      ],
      "percentageEmptyUserId": [
        13
      ],
      "percentageNotEmptyUserId": [
        13
      ],
      "countUniqueValuesTimeZone": [
        10
      ],
      "countEmptyTimeZone": [
        10
      ],
      "countNotEmptyTimeZone": [
        10
      ],
      "percentageEmptyTimeZone": [
        13
      ],
      "percentageNotEmptyTimeZone": [
        13
      ],
      "countUniqueValuesDateFormat": [
        10
      ],
      "countEmptyDateFormat": [
        10
      ],
      "countNotEmptyDateFormat": [
        10
      ],
      "percentageEmptyDateFormat": [
        13
      ],
      "percentageNotEmptyDateFormat": [
        13
      ],
      "countUniqueValuesTimeFormat": [
        10
      ],
      "countEmptyTimeFormat": [
        10
      ],
      "countNotEmptyTimeFormat": [
        10
      ],
      "percentageEmptyTimeFormat": [
        13
      ],
      "percentageNotEmptyTimeFormat": [
        13
      ],
      "countUniqueValuesNumberFormat": [
        10
      ],
      "countEmptyNumberFormat": [
        10
      ],
      "countNotEmptyNumberFormat": [
        10
      ],
      "percentageEmptyNumberFormat": [
        13
      ],
      "percentageNotEmptyNumberFormat": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "countUniqueValuesCalendarStartDay": [
        10
      ],
      "countEmptyCalendarStartDay": [
        10
      ],
      "countNotEmptyCalendarStartDay": [
        10
      ],
      "percentageEmptyCalendarStartDay": [
        13
      ],
      "percentageNotEmptyCalendarStartDay": [
        13
      ],
      "minCalendarStartDay": [
        13
      ],
      "maxCalendarStartDay": [
        13
      ],
      "avgCalendarStartDay": [
        13
      ],
      "sumCalendarStartDay": [
        13
      ],
      "edges": [
        552
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesColorScheme": [
        10
      ],
      "countEmptyColorScheme": [
        10
      ],
      "countNotEmptyColorScheme": [
        10
      ],
      "percentageEmptyColorScheme": [
        13
      ],
      "percentageNotEmptyColorScheme": [
        13
      ],
      "countUniqueValuesLocale": [
        10
      ],
      "countEmptyLocale": [
        10
      ],
      "countNotEmptyLocale": [
        10
      ],
      "percentageEmptyLocale": [
        13
      ],
      "percentageNotEmptyLocale": [
        13
      ],
      "countUniqueValuesAvatarUrl": [
        10
      ],
      "countEmptyAvatarUrl": [
        10
      ],
      "countNotEmptyAvatarUrl": [
        10
      ],
      "percentageEmptyAvatarUrl": [
        13
      ],
      "percentageNotEmptyAvatarUrl": [
        13
      ],
      "countUniqueValuesUserEmail": [
        10
      ],
      "countEmptyUserEmail": [
        10
      ],
      "countNotEmptyUserEmail": [
        10
      ],
      "percentageEmptyUserEmail": [
        13
      ],
      "percentageNotEmptyUserEmail": [
        13
      ],
      "countUniqueValuesUserId": [
        10
      ],
      "countEmptyUserId": [
        10
      ],
      "countNotEmptyUserId": [
        10
      ],
      "percentageEmptyUserId": [
        13
      ],
      "percentageNotEmptyUserId": [
        13
      ],
      "countUniqueValuesTimeZone": [
        10
      ],
      "countEmptyTimeZone": [
        10
      ],
      "countNotEmptyTimeZone": [
        10
      ],
      "percentageEmptyTimeZone": [
        13
      ],
      "percentageNotEmptyTimeZone": [
        13
      ],
      "countUniqueValuesDateFormat": [
        10
      ],
      "countEmptyDateFormat": [
        10
      ],
      "countNotEmptyDateFormat": [
        10
      ],
      "percentageEmptyDateFormat": [
        13
      ],
      "percentageNotEmptyDateFormat": [
        13
      ],
      "countUniqueValuesTimeFormat": [
        10
      ],
      "countEmptyTimeFormat": [
        10
      ],
      "countNotEmptyTimeFormat": [
        10
      ],
      "percentageEmptyTimeFormat": [
        13
      ],
      "percentageNotEmptyTimeFormat": [
        13
      ],
      "countUniqueValuesNumberFormat": [
        10
      ],
      "countEmptyNumberFormat": [
        10
      ],
      "countNotEmptyNumberFormat": [
        10
      ],
      "percentageEmptyNumberFormat": [
        13
      ],
      "percentageNotEmptyNumberFormat": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "countUniqueValuesCalendarStartDay": [
        10
      ],
      "countEmptyCalendarStartDay": [
        10
      ],
      "countNotEmptyCalendarStartDay": [
        10
      ],
      "percentageEmptyCalendarStartDay": [
        13
      ],
      "percentageNotEmptyCalendarStartDay": [
        13
      ],
      "minCalendarStartDay": [
        13
      ],
      "maxCalendarStartDay": [
        13
      ],
      "avgCalendarStartDay": [
        13
      ],
      "sumCalendarStartDay": [
        13
      ],
      "edges": [
        552
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberRelationInput": {
      "connect": [
        556
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberConnectInput": {
      "where": [
        557
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberWhereUniqueInput": {
      "id": [
        22
      ],
      "userEmail": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "name": [
        70
      ],
      "colorScheme": [
        1
      ],
      "locale": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "userEmail": [
        1
      ],
      "userId": [
        2
      ],
      "timeZone": [
        1
      ],
      "dateFormat": [
        548
      ],
      "timeFormat": [
        549
      ],
      "numberFormat": [
        550
      ],
      "searchVector": [
        247
      ],
      "calendarStartDay": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        246
      ],
      "name": [
        71
      ],
      "colorScheme": [
        1
      ],
      "locale": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "userEmail": [
        1
      ],
      "userId": [
        2
      ],
      "timeZone": [
        1
      ],
      "dateFormat": [
        548
      ],
      "timeFormat": [
        549
      ],
      "numberFormat": [
        550
      ],
      "searchVector": [
        247
      ],
      "calendarStartDay": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "name": [
        72
      ],
      "colorScheme": [
        56
      ],
      "locale": [
        56
      ],
      "avatarUrl": [
        56
      ],
      "userEmail": [
        56
      ],
      "userId": [
        33
      ],
      "timeZone": [
        56
      ],
      "dateFormat": [
        561
      ],
      "timeFormat": [
        562
      ],
      "numberFormat": [
        563
      ],
      "searchVector": [
        257
      ],
      "blocklist": [
        564
      ],
      "calendarEventParticipants": [
        565
      ],
      "accountOwnerForCompanies": [
        566
      ],
      "connectedAccounts": [
        588
      ],
      "favorites": [
        589
      ],
      "messageParticipants": [
        590
      ],
      "ownedOpportunities": [
        591
      ],
      "assignedTasks": [
        592
      ],
      "timelineActivities": [
        593
      ],
      "calendarStartDay": [
        594
      ],
      "and": [
        560
      ],
      "or": [
        560
      ],
      "not": [
        560
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberDateFormatEnumFilter": {
      "eq": [
        548
      ],
      "neq": [
        548
      ],
      "in": [
        548
      ],
      "containsAny": [
        548
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberTimeFormatEnumFilter": {
      "eq": [
        549
      ],
      "neq": [
        549
      ],
      "in": [
        549
      ],
      "containsAny": [
        549
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberNumberFormatEnumFilter": {
      "eq": [
        550
      ],
      "neq": [
        550
      ],
      "in": [
        550
      ],
      "containsAny": [
        550
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "blocklistOneToManyFilter_311bf440": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "workspaceMemberId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "calendarEventParticipantsOneToManyFilter_86c5b935": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "isOrganizer": [
        175
      ],
      "responseStatus": [
        196
      ],
      "calendarEventId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "accountOwnerForCompaniesOneToManyFilter_617d747d": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "domainName": [
        55
      ],
      "address": [
        78
      ],
      "employees": [
        179
      ],
      "linkedinLink": [
        55
      ],
      "xLink": [
        55
      ],
      "annualRecurringRevenue": [
        65
      ],
      "idealCustomerProfile": [
        175
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        567
      ],
      "accountOwnerId": [
        33
      ],
      "taskTargets": [
        568
      ],
      "noteTargets": [
        569
      ],
      "opportunities": [
        570
      ],
      "favorites": [
        577
      ],
      "timelineActivities": [
        578
      ],
      "people": [
        579
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_3accb92f": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "taskTargetsOneToManyFilter_6414286e": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "taskId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "noteTargetsOneToManyFilter_439c8813": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "noteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "opportunitiesOneToManyFilter_f2e5954a": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "amount": [
        65
      ],
      "closeDate": [
        7
      ],
      "stage": [
        571
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        572
      ],
      "companyId": [
        33
      ],
      "favorites": [
        573
      ],
      "noteTargets": [
        574
      ],
      "taskTargets": [
        575
      ],
      "timelineActivities": [
        576
      ],
      "ownerId": [
        33
      ],
      "pointOfContactId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityStageEnumFilter": {
      "eq": [
        614
      ],
      "neq": [
        614
      ],
      "in": [
        614
      ],
      "containsAny": [
        614
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_db98f954": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_3cf11096": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "noteTargetsOneToManyFilter_bfbd77dd": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "noteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "taskTargetsOneToManyFilter_cd656701": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "taskId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_fa96ed0f": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_4dca0881": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_3abc1a6e": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "peopleOneToManyFilter_502cdbe0": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        72
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "jobTitle": [
        56
      ],
      "linkedinLink": [
        55
      ],
      "city": [
        56
      ],
      "avatarUrl": [
        56
      ],
      "attachments": [
        580
      ],
      "calendarEventParticipants": [
        581
      ],
      "favorites": [
        582
      ],
      "messageParticipants": [
        583
      ],
      "noteTargets": [
        584
      ],
      "taskTargets": [
        585
      ],
      "timelineActivities": [
        586
      ],
      "xLink": [
        55
      ],
      "companyId": [
        33
      ],
      "pointOfContactForOpportunities": [
        587
      ],
      "emails": [
        92
      ],
      "phones": [
        98
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_bdb86be9": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "calendarEventParticipantsOneToManyFilter_6838d121": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "isOrganizer": [
        175
      ],
      "responseStatus": [
        196
      ],
      "calendarEventId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_4387031a": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "messageParticipantsOneToManyFilter_c4768acc": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "role": [
        356
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "messageId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "noteTargetsOneToManyFilter_e01361bb": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "noteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "taskTargetsOneToManyFilter_26b2d7ee": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "taskId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_fd55e323": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "pointOfContactForOpportunitiesOneToManyFilter_c68cf71b": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "amount": [
        65
      ],
      "closeDate": [
        7
      ],
      "stage": [
        571
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        572
      ],
      "companyId": [
        33
      ],
      "favorites": [
        573
      ],
      "noteTargets": [
        574
      ],
      "taskTargets": [
        575
      ],
      "timelineActivities": [
        576
      ],
      "ownerId": [
        33
      ],
      "pointOfContactId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "connectedAccountsOneToManyFilter_86c3eb02": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "handle": [
        56
      ],
      "provider": [
        56
      ],
      "accessToken": [
        56
      ],
      "refreshToken": [
        56
      ],
      "lastSyncHistoryId": [
        56
      ],
      "authFailedAt": [
        7
      ],
      "lastCredentialsRefreshedAt": [
        7
      ],
      "handleAliases": [
        56
      ],
      "scopes": [
        227
      ],
      "connectionParameters": [
        57
      ],
      "calendarChannels": [
        228
      ],
      "accountOwnerId": [
        33
      ],
      "messageChannels": [
        229
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_4cd1659f": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "messageParticipantsOneToManyFilter_933067e3": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "role": [
        356
      ],
      "handle": [
        56
      ],
      "displayName": [
        56
      ],
      "messageId": [
        33
      ],
      "personId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "ownedOpportunitiesOneToManyFilter_49684e1c": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "amount": [
        65
      ],
      "closeDate": [
        7
      ],
      "stage": [
        571
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        572
      ],
      "companyId": [
        33
      ],
      "favorites": [
        573
      ],
      "noteTargets": [
        574
      ],
      "taskTargets": [
        575
      ],
      "timelineActivities": [
        576
      ],
      "ownerId": [
        33
      ],
      "pointOfContactId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "assignedTasksOneToManyFilter_8e757d09": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "title": [
        56
      ],
      "bodyV2": [
        104
      ],
      "dueAt": [
        7
      ],
      "status": [
        438
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        439
      ],
      "favorites": [
        440
      ],
      "taskTargets": [
        441
      ],
      "assigneeId": [
        33
      ],
      "timelineActivities": [
        442
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_c46c0a85": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "IntFilter": {
      "eq": [
        10
      ],
      "gt": [
        10
      ],
      "gte": [
        10
      ],
      "in": [
        10
      ],
      "lt": [
        10
      ],
      "lte": [
        10
      ],
      "neq": [
        10
      ],
      "is": [
        34
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "position": [
        59
      ],
      "name": [
        73
      ],
      "colorScheme": [
        59
      ],
      "locale": [
        59
      ],
      "avatarUrl": [
        59
      ],
      "userEmail": [
        59
      ],
      "userId": [
        59
      ],
      "timeZone": [
        59
      ],
      "dateFormat": [
        59
      ],
      "timeFormat": [
        59
      ],
      "numberFormat": [
        59
      ],
      "searchVector": [
        59
      ],
      "calendarStartDay": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberOrderByWithGroupByInput": {
      "aggregate": [
        597
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "position": [
        59
      ],
      "name": [
        73
      ],
      "colorScheme": [
        59
      ],
      "locale": [
        59
      ],
      "avatarUrl": [
        59
      ],
      "userEmail": [
        59
      ],
      "userId": [
        59
      ],
      "timeZone": [
        59
      ],
      "dateFormat": [
        59
      ],
      "timeFormat": [
        59
      ],
      "numberFormat": [
        59
      ],
      "searchVector": [
        59
      ],
      "calendarStartDay": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesColorScheme": [
        59
      ],
      "countEmptyColorScheme": [
        59
      ],
      "countNotEmptyColorScheme": [
        59
      ],
      "percentageEmptyColorScheme": [
        59
      ],
      "percentageNotEmptyColorScheme": [
        59
      ],
      "countUniqueValuesLocale": [
        59
      ],
      "countEmptyLocale": [
        59
      ],
      "countNotEmptyLocale": [
        59
      ],
      "percentageEmptyLocale": [
        59
      ],
      "percentageNotEmptyLocale": [
        59
      ],
      "countUniqueValuesAvatarUrl": [
        59
      ],
      "countEmptyAvatarUrl": [
        59
      ],
      "countNotEmptyAvatarUrl": [
        59
      ],
      "percentageEmptyAvatarUrl": [
        59
      ],
      "percentageNotEmptyAvatarUrl": [
        59
      ],
      "countUniqueValuesUserEmail": [
        59
      ],
      "countEmptyUserEmail": [
        59
      ],
      "countNotEmptyUserEmail": [
        59
      ],
      "percentageEmptyUserEmail": [
        59
      ],
      "percentageNotEmptyUserEmail": [
        59
      ],
      "countUniqueValuesUserId": [
        59
      ],
      "countEmptyUserId": [
        59
      ],
      "countNotEmptyUserId": [
        59
      ],
      "percentageEmptyUserId": [
        59
      ],
      "percentageNotEmptyUserId": [
        59
      ],
      "countUniqueValuesTimeZone": [
        59
      ],
      "countEmptyTimeZone": [
        59
      ],
      "countNotEmptyTimeZone": [
        59
      ],
      "percentageEmptyTimeZone": [
        59
      ],
      "percentageNotEmptyTimeZone": [
        59
      ],
      "countUniqueValuesDateFormat": [
        59
      ],
      "countEmptyDateFormat": [
        59
      ],
      "countNotEmptyDateFormat": [
        59
      ],
      "percentageEmptyDateFormat": [
        59
      ],
      "percentageNotEmptyDateFormat": [
        59
      ],
      "countUniqueValuesTimeFormat": [
        59
      ],
      "countEmptyTimeFormat": [
        59
      ],
      "countNotEmptyTimeFormat": [
        59
      ],
      "percentageEmptyTimeFormat": [
        59
      ],
      "percentageNotEmptyTimeFormat": [
        59
      ],
      "countUniqueValuesNumberFormat": [
        59
      ],
      "countEmptyNumberFormat": [
        59
      ],
      "countNotEmptyNumberFormat": [
        59
      ],
      "percentageEmptyNumberFormat": [
        59
      ],
      "percentageNotEmptyNumberFormat": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "countUniqueValuesCalendarStartDay": [
        59
      ],
      "countEmptyCalendarStartDay": [
        59
      ],
      "countNotEmptyCalendarStartDay": [
        59
      ],
      "percentageEmptyCalendarStartDay": [
        59
      ],
      "percentageNotEmptyCalendarStartDay": [
        59
      ],
      "minCalendarStartDay": [
        59
      ],
      "maxCalendarStartDay": [
        59
      ],
      "avgCalendarStartDay": [
        59
      ],
      "sumCalendarStartDay": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "position": [
        6
      ],
      "name": [
        74
      ],
      "colorScheme": [
        6
      ],
      "locale": [
        6
      ],
      "avatarUrl": [
        6
      ],
      "userEmail": [
        6
      ],
      "userId": [
        6
      ],
      "timeZone": [
        6
      ],
      "dateFormat": [
        6
      ],
      "timeFormat": [
        6
      ],
      "numberFormat": [
        6
      ],
      "searchVector": [
        6
      ],
      "calendarStartDay": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "Company": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "domainName": [
        52
      ],
      "address": [
        75
      ],
      "employees": [
        13
      ],
      "linkedinLink": [
        52
      ],
      "xLink": [
        52
      ],
      "annualRecurringRevenue": [
        61
      ],
      "idealCustomerProfile": [
        6
      ],
      "position": [
        246
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "searchVector": [
        247
      ],
      "accountOwnerId": [
        22
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "accountOwner": [
        551
      ],
      "taskTargets": [
        449,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            456
          ],
          "orderBy": [
            457,
            "[TaskTargetOrderByInput]"
          ]
        }
      ],
      "noteTargets": [
        415,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            422
          ],
          "orderBy": [
            423,
            "[NoteTargetOrderByInput]"
          ]
        }
      ],
      "opportunities": [
        617,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            624
          ],
          "orderBy": [
            625,
            "[OpportunityOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "people": [
        631,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            639
          ],
          "orderBy": [
            640,
            "[PersonOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "CompanyEdge": {
      "node": [
        599
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "CompanyConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesDomainName": [
        10
      ],
      "countEmptyDomainName": [
        10
      ],
      "countNotEmptyDomainName": [
        10
      ],
      "percentageEmptyDomainName": [
        13
      ],
      "percentageNotEmptyDomainName": [
        13
      ],
      "countUniqueValuesAddress": [
        10
      ],
      "countEmptyAddress": [
        10
      ],
      "countNotEmptyAddress": [
        10
      ],
      "percentageEmptyAddress": [
        13
      ],
      "percentageNotEmptyAddress": [
        13
      ],
      "countUniqueValuesEmployees": [
        10
      ],
      "countEmptyEmployees": [
        10
      ],
      "countNotEmptyEmployees": [
        10
      ],
      "percentageEmptyEmployees": [
        13
      ],
      "percentageNotEmptyEmployees": [
        13
      ],
      "minEmployees": [
        13
      ],
      "maxEmployees": [
        13
      ],
      "avgEmployees": [
        13
      ],
      "sumEmployees": [
        13
      ],
      "countUniqueValuesLinkedinLink": [
        10
      ],
      "countEmptyLinkedinLink": [
        10
      ],
      "countNotEmptyLinkedinLink": [
        10
      ],
      "percentageEmptyLinkedinLink": [
        13
      ],
      "percentageNotEmptyLinkedinLink": [
        13
      ],
      "countUniqueValuesXLink": [
        10
      ],
      "countEmptyXLink": [
        10
      ],
      "countNotEmptyXLink": [
        10
      ],
      "percentageEmptyXLink": [
        13
      ],
      "percentageNotEmptyXLink": [
        13
      ],
      "countUniqueValuesAnnualRecurringRevenue": [
        10
      ],
      "countEmptyAnnualRecurringRevenue": [
        10
      ],
      "countNotEmptyAnnualRecurringRevenue": [
        10
      ],
      "percentageEmptyAnnualRecurringRevenue": [
        13
      ],
      "percentageNotEmptyAnnualRecurringRevenue": [
        13
      ],
      "minAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "maxAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "sumAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "avgAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "countUniqueValuesIdealCustomerProfile": [
        10
      ],
      "countEmptyIdealCustomerProfile": [
        10
      ],
      "countNotEmptyIdealCustomerProfile": [
        10
      ],
      "percentageEmptyIdealCustomerProfile": [
        13
      ],
      "percentageNotEmptyIdealCustomerProfile": [
        13
      ],
      "countTrueIdealCustomerProfile": [
        10
      ],
      "countFalseIdealCustomerProfile": [
        10
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        600
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "CompanyGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesDomainName": [
        10
      ],
      "countEmptyDomainName": [
        10
      ],
      "countNotEmptyDomainName": [
        10
      ],
      "percentageEmptyDomainName": [
        13
      ],
      "percentageNotEmptyDomainName": [
        13
      ],
      "countUniqueValuesAddress": [
        10
      ],
      "countEmptyAddress": [
        10
      ],
      "countNotEmptyAddress": [
        10
      ],
      "percentageEmptyAddress": [
        13
      ],
      "percentageNotEmptyAddress": [
        13
      ],
      "countUniqueValuesEmployees": [
        10
      ],
      "countEmptyEmployees": [
        10
      ],
      "countNotEmptyEmployees": [
        10
      ],
      "percentageEmptyEmployees": [
        13
      ],
      "percentageNotEmptyEmployees": [
        13
      ],
      "minEmployees": [
        13
      ],
      "maxEmployees": [
        13
      ],
      "avgEmployees": [
        13
      ],
      "sumEmployees": [
        13
      ],
      "countUniqueValuesLinkedinLink": [
        10
      ],
      "countEmptyLinkedinLink": [
        10
      ],
      "countNotEmptyLinkedinLink": [
        10
      ],
      "percentageEmptyLinkedinLink": [
        13
      ],
      "percentageNotEmptyLinkedinLink": [
        13
      ],
      "countUniqueValuesXLink": [
        10
      ],
      "countEmptyXLink": [
        10
      ],
      "countNotEmptyXLink": [
        10
      ],
      "percentageEmptyXLink": [
        13
      ],
      "percentageNotEmptyXLink": [
        13
      ],
      "countUniqueValuesAnnualRecurringRevenue": [
        10
      ],
      "countEmptyAnnualRecurringRevenue": [
        10
      ],
      "countNotEmptyAnnualRecurringRevenue": [
        10
      ],
      "percentageEmptyAnnualRecurringRevenue": [
        13
      ],
      "percentageNotEmptyAnnualRecurringRevenue": [
        13
      ],
      "minAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "maxAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "sumAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "avgAnnualRecurringRevenueAmountMicros": [
        13
      ],
      "countUniqueValuesIdealCustomerProfile": [
        10
      ],
      "countEmptyIdealCustomerProfile": [
        10
      ],
      "countNotEmptyIdealCustomerProfile": [
        10
      ],
      "percentageEmptyIdealCustomerProfile": [
        13
      ],
      "percentageNotEmptyIdealCustomerProfile": [
        13
      ],
      "countTrueIdealCustomerProfile": [
        10
      ],
      "countFalseIdealCustomerProfile": [
        10
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        600
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "CompanyRelationInput": {
      "connect": [
        604
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CompanyConnectInput": {
      "where": [
        605
      ],
      "__typename": [
        1
      ]
    },
    "CompanyWhereUniqueInput": {
      "id": [
        22
      ],
      "domainName": [
        606
      ],
      "__typename": [
        1
      ]
    },
    "CompanyDomainNameWhereInput": {
      "primaryLinkUrl": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CompanyCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "domainName": [
        53
      ],
      "address": [
        76
      ],
      "employees": [
        13
      ],
      "linkedinLink": [
        53
      ],
      "xLink": [
        53
      ],
      "annualRecurringRevenue": [
        63
      ],
      "idealCustomerProfile": [
        6
      ],
      "position": [
        246
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "searchVector": [
        247
      ],
      "accountOwnerId": [
        22
      ],
      "accountOwner": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "CompanyUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "domainName": [
        54
      ],
      "address": [
        77
      ],
      "employees": [
        13
      ],
      "linkedinLink": [
        54
      ],
      "xLink": [
        54
      ],
      "annualRecurringRevenue": [
        64
      ],
      "idealCustomerProfile": [
        6
      ],
      "position": [
        246
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "searchVector": [
        247
      ],
      "accountOwnerId": [
        22
      ],
      "accountOwner": [
        555
      ],
      "__typename": [
        1
      ]
    },
    "CompanyFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "domainName": [
        55
      ],
      "address": [
        78
      ],
      "employees": [
        179
      ],
      "linkedinLink": [
        55
      ],
      "xLink": [
        55
      ],
      "annualRecurringRevenue": [
        65
      ],
      "idealCustomerProfile": [
        175
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        567
      ],
      "accountOwnerId": [
        33
      ],
      "taskTargets": [
        568
      ],
      "noteTargets": [
        569
      ],
      "opportunities": [
        570
      ],
      "favorites": [
        577
      ],
      "timelineActivities": [
        578
      ],
      "people": [
        579
      ],
      "and": [
        609
      ],
      "or": [
        609
      ],
      "not": [
        609
      ],
      "__typename": [
        1
      ]
    },
    "CompanyOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        59
      ],
      "domainName": [
        58
      ],
      "address": [
        79
      ],
      "employees": [
        59
      ],
      "linkedinLink": [
        58
      ],
      "xLink": [
        58
      ],
      "annualRecurringRevenue": [
        67
      ],
      "idealCustomerProfile": [
        59
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "accountOwnerId": [
        59
      ],
      "accountOwner": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "CompanyOrderByWithGroupByInput": {
      "aggregate": [
        612
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        59
      ],
      "domainName": [
        58
      ],
      "address": [
        79
      ],
      "employees": [
        59
      ],
      "linkedinLink": [
        58
      ],
      "xLink": [
        58
      ],
      "annualRecurringRevenue": [
        67
      ],
      "idealCustomerProfile": [
        59
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "accountOwnerId": [
        59
      ],
      "accountOwner": [
        596
      ],
      "__typename": [
        1
      ]
    },
    "CompanyOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesDomainName": [
        59
      ],
      "countEmptyDomainName": [
        59
      ],
      "countNotEmptyDomainName": [
        59
      ],
      "percentageEmptyDomainName": [
        59
      ],
      "percentageNotEmptyDomainName": [
        59
      ],
      "countUniqueValuesAddress": [
        59
      ],
      "countEmptyAddress": [
        59
      ],
      "countNotEmptyAddress": [
        59
      ],
      "percentageEmptyAddress": [
        59
      ],
      "percentageNotEmptyAddress": [
        59
      ],
      "countUniqueValuesEmployees": [
        59
      ],
      "countEmptyEmployees": [
        59
      ],
      "countNotEmptyEmployees": [
        59
      ],
      "percentageEmptyEmployees": [
        59
      ],
      "percentageNotEmptyEmployees": [
        59
      ],
      "minEmployees": [
        59
      ],
      "maxEmployees": [
        59
      ],
      "avgEmployees": [
        59
      ],
      "sumEmployees": [
        59
      ],
      "countUniqueValuesLinkedinLink": [
        59
      ],
      "countEmptyLinkedinLink": [
        59
      ],
      "countNotEmptyLinkedinLink": [
        59
      ],
      "percentageEmptyLinkedinLink": [
        59
      ],
      "percentageNotEmptyLinkedinLink": [
        59
      ],
      "countUniqueValuesXLink": [
        59
      ],
      "countEmptyXLink": [
        59
      ],
      "countNotEmptyXLink": [
        59
      ],
      "percentageEmptyXLink": [
        59
      ],
      "percentageNotEmptyXLink": [
        59
      ],
      "countUniqueValuesAnnualRecurringRevenue": [
        59
      ],
      "countEmptyAnnualRecurringRevenue": [
        59
      ],
      "countNotEmptyAnnualRecurringRevenue": [
        59
      ],
      "percentageEmptyAnnualRecurringRevenue": [
        59
      ],
      "percentageNotEmptyAnnualRecurringRevenue": [
        59
      ],
      "minAnnualRecurringRevenueAmountMicros": [
        59
      ],
      "maxAnnualRecurringRevenueAmountMicros": [
        59
      ],
      "sumAnnualRecurringRevenueAmountMicros": [
        59
      ],
      "avgAnnualRecurringRevenueAmountMicros": [
        59
      ],
      "countUniqueValuesIdealCustomerProfile": [
        59
      ],
      "countEmptyIdealCustomerProfile": [
        59
      ],
      "countNotEmptyIdealCustomerProfile": [
        59
      ],
      "percentageEmptyIdealCustomerProfile": [
        59
      ],
      "percentageNotEmptyIdealCustomerProfile": [
        59
      ],
      "countTrueIdealCustomerProfile": [
        59
      ],
      "countFalseIdealCustomerProfile": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "accountOwnerId": [
        59
      ],
      "accountOwner": [
        595
      ],
      "__typename": [
        1
      ]
    },
    "CompanyGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        6
      ],
      "domainName": [
        60
      ],
      "address": [
        80
      ],
      "employees": [
        6
      ],
      "linkedinLink": [
        60
      ],
      "xLink": [
        60
      ],
      "annualRecurringRevenue": [
        68
      ],
      "idealCustomerProfile": [
        6
      ],
      "position": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "searchVector": [
        6
      ],
      "accountOwner": [
        598
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityStageEnum": {},
    "Opportunity": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "amount": [
        61
      ],
      "closeDate": [
        7
      ],
      "stage": [
        614
      ],
      "position": [
        246
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "searchVector": [
        247
      ],
      "companyId": [
        22
      ],
      "ownerId": [
        22
      ],
      "pointOfContactId": [
        22
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "company": [
        599
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "noteTargets": [
        415,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            422
          ],
          "orderBy": [
            423,
            "[NoteTargetOrderByInput]"
          ]
        }
      ],
      "taskTargets": [
        449,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            456
          ],
          "orderBy": [
            457,
            "[TaskTargetOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "owner": [
        551
      ],
      "pointOfContact": [
        629
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityEdge": {
      "node": [
        615
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesAmount": [
        10
      ],
      "countEmptyAmount": [
        10
      ],
      "countNotEmptyAmount": [
        10
      ],
      "percentageEmptyAmount": [
        13
      ],
      "percentageNotEmptyAmount": [
        13
      ],
      "minAmountAmountMicros": [
        13
      ],
      "maxAmountAmountMicros": [
        13
      ],
      "sumAmountAmountMicros": [
        13
      ],
      "avgAmountAmountMicros": [
        13
      ],
      "countUniqueValuesCloseDate": [
        10
      ],
      "countEmptyCloseDate": [
        10
      ],
      "countNotEmptyCloseDate": [
        10
      ],
      "percentageEmptyCloseDate": [
        13
      ],
      "percentageNotEmptyCloseDate": [
        13
      ],
      "minCloseDate": [
        7
      ],
      "maxCloseDate": [
        7
      ],
      "countUniqueValuesStage": [
        10
      ],
      "countEmptyStage": [
        10
      ],
      "countNotEmptyStage": [
        10
      ],
      "percentageEmptyStage": [
        13
      ],
      "percentageNotEmptyStage": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        616
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesAmount": [
        10
      ],
      "countEmptyAmount": [
        10
      ],
      "countNotEmptyAmount": [
        10
      ],
      "percentageEmptyAmount": [
        13
      ],
      "percentageNotEmptyAmount": [
        13
      ],
      "minAmountAmountMicros": [
        13
      ],
      "maxAmountAmountMicros": [
        13
      ],
      "sumAmountAmountMicros": [
        13
      ],
      "avgAmountAmountMicros": [
        13
      ],
      "countUniqueValuesCloseDate": [
        10
      ],
      "countEmptyCloseDate": [
        10
      ],
      "countNotEmptyCloseDate": [
        10
      ],
      "percentageEmptyCloseDate": [
        13
      ],
      "percentageNotEmptyCloseDate": [
        13
      ],
      "minCloseDate": [
        7
      ],
      "maxCloseDate": [
        7
      ],
      "countUniqueValuesStage": [
        10
      ],
      "countEmptyStage": [
        10
      ],
      "countNotEmptyStage": [
        10
      ],
      "percentageEmptyStage": [
        13
      ],
      "percentageNotEmptyStage": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "edges": [
        616
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityRelationInput": {
      "connect": [
        620
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityConnectInput": {
      "where": [
        621
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "amount": [
        63
      ],
      "closeDate": [
        7
      ],
      "stage": [
        614
      ],
      "position": [
        246
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "searchVector": [
        247
      ],
      "companyId": [
        22
      ],
      "company": [
        603
      ],
      "ownerId": [
        22
      ],
      "owner": [
        555
      ],
      "pointOfContactId": [
        22
      ],
      "pointOfContact": [
        633
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        1
      ],
      "amount": [
        64
      ],
      "closeDate": [
        7
      ],
      "stage": [
        614
      ],
      "position": [
        246
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "searchVector": [
        247
      ],
      "companyId": [
        22
      ],
      "company": [
        603
      ],
      "ownerId": [
        22
      ],
      "owner": [
        555
      ],
      "pointOfContactId": [
        22
      ],
      "pointOfContact": [
        633
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "amount": [
        65
      ],
      "closeDate": [
        7
      ],
      "stage": [
        571
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "attachments": [
        572
      ],
      "companyId": [
        33
      ],
      "favorites": [
        573
      ],
      "noteTargets": [
        574
      ],
      "taskTargets": [
        575
      ],
      "timelineActivities": [
        576
      ],
      "ownerId": [
        33
      ],
      "pointOfContactId": [
        33
      ],
      "and": [
        624
      ],
      "or": [
        624
      ],
      "not": [
        624
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        59
      ],
      "amount": [
        67
      ],
      "closeDate": [
        59
      ],
      "stage": [
        59
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "companyId": [
        59
      ],
      "company": [
        610
      ],
      "ownerId": [
        59
      ],
      "owner": [
        595
      ],
      "pointOfContactId": [
        59
      ],
      "pointOfContact": [
        640
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityOrderByWithGroupByInput": {
      "aggregate": [
        627
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        59
      ],
      "amount": [
        67
      ],
      "closeDate": [
        110
      ],
      "stage": [
        59
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "companyId": [
        59
      ],
      "company": [
        611
      ],
      "ownerId": [
        59
      ],
      "owner": [
        596
      ],
      "pointOfContactId": [
        59
      ],
      "pointOfContact": [
        641
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesAmount": [
        59
      ],
      "countEmptyAmount": [
        59
      ],
      "countNotEmptyAmount": [
        59
      ],
      "percentageEmptyAmount": [
        59
      ],
      "percentageNotEmptyAmount": [
        59
      ],
      "minAmountAmountMicros": [
        59
      ],
      "maxAmountAmountMicros": [
        59
      ],
      "sumAmountAmountMicros": [
        59
      ],
      "avgAmountAmountMicros": [
        59
      ],
      "countUniqueValuesCloseDate": [
        59
      ],
      "countEmptyCloseDate": [
        59
      ],
      "countNotEmptyCloseDate": [
        59
      ],
      "percentageEmptyCloseDate": [
        59
      ],
      "percentageNotEmptyCloseDate": [
        59
      ],
      "minCloseDate": [
        59
      ],
      "maxCloseDate": [
        59
      ],
      "countUniqueValuesStage": [
        59
      ],
      "countEmptyStage": [
        59
      ],
      "countNotEmptyStage": [
        59
      ],
      "percentageEmptyStage": [
        59
      ],
      "percentageNotEmptyStage": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "companyId": [
        59
      ],
      "company": [
        610
      ],
      "ownerId": [
        59
      ],
      "owner": [
        595
      ],
      "pointOfContactId": [
        59
      ],
      "pointOfContact": [
        640
      ],
      "__typename": [
        1
      ]
    },
    "OpportunityGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        6
      ],
      "amount": [
        68
      ],
      "closeDate": [
        109
      ],
      "stage": [
        6
      ],
      "position": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "searchVector": [
        6
      ],
      "company": [
        613
      ],
      "owner": [
        598
      ],
      "pointOfContact": [
        643
      ],
      "__typename": [
        1
      ]
    },
    "Person": {
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        69
      ],
      "position": [
        246
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "searchVector": [
        247
      ],
      "jobTitle": [
        1
      ],
      "linkedinLink": [
        52
      ],
      "city": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "xLink": [
        52
      ],
      "companyId": [
        22
      ],
      "emails": [
        89
      ],
      "phones": [
        95
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "calendarEventParticipants": [
        188,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            195
          ],
          "orderBy": [
            197,
            "[CalendarEventParticipantOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "messageParticipants": [
        348,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            355
          ],
          "orderBy": [
            357,
            "[MessageParticipantOrderByInput]"
          ]
        }
      ],
      "noteTargets": [
        415,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            422
          ],
          "orderBy": [
            423,
            "[NoteTargetOrderByInput]"
          ]
        }
      ],
      "taskTargets": [
        449,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            456
          ],
          "orderBy": [
            457,
            "[TaskTargetOrderByInput]"
          ]
        }
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "company": [
        599
      ],
      "pointOfContactForOpportunities": [
        617,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            624
          ],
          "orderBy": [
            625,
            "[OpportunityOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "PersonEdge": {
      "node": [
        629
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "PersonConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "countUniqueValuesJobTitle": [
        10
      ],
      "countEmptyJobTitle": [
        10
      ],
      "countNotEmptyJobTitle": [
        10
      ],
      "percentageEmptyJobTitle": [
        13
      ],
      "percentageNotEmptyJobTitle": [
        13
      ],
      "countUniqueValuesLinkedinLink": [
        10
      ],
      "countEmptyLinkedinLink": [
        10
      ],
      "countNotEmptyLinkedinLink": [
        10
      ],
      "percentageEmptyLinkedinLink": [
        13
      ],
      "percentageNotEmptyLinkedinLink": [
        13
      ],
      "countUniqueValuesCity": [
        10
      ],
      "countEmptyCity": [
        10
      ],
      "countNotEmptyCity": [
        10
      ],
      "percentageEmptyCity": [
        13
      ],
      "percentageNotEmptyCity": [
        13
      ],
      "countUniqueValuesAvatarUrl": [
        10
      ],
      "countEmptyAvatarUrl": [
        10
      ],
      "countNotEmptyAvatarUrl": [
        10
      ],
      "percentageEmptyAvatarUrl": [
        13
      ],
      "percentageNotEmptyAvatarUrl": [
        13
      ],
      "countUniqueValuesXLink": [
        10
      ],
      "countEmptyXLink": [
        10
      ],
      "countNotEmptyXLink": [
        10
      ],
      "percentageEmptyXLink": [
        13
      ],
      "percentageNotEmptyXLink": [
        13
      ],
      "countUniqueValuesEmails": [
        10
      ],
      "countEmptyEmails": [
        10
      ],
      "countNotEmptyEmails": [
        10
      ],
      "percentageEmptyEmails": [
        13
      ],
      "percentageNotEmptyEmails": [
        13
      ],
      "countUniqueValuesPhones": [
        10
      ],
      "countEmptyPhones": [
        10
      ],
      "countNotEmptyPhones": [
        10
      ],
      "percentageEmptyPhones": [
        13
      ],
      "percentageNotEmptyPhones": [
        13
      ],
      "edges": [
        630
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "PersonGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "countUniqueValuesJobTitle": [
        10
      ],
      "countEmptyJobTitle": [
        10
      ],
      "countNotEmptyJobTitle": [
        10
      ],
      "percentageEmptyJobTitle": [
        13
      ],
      "percentageNotEmptyJobTitle": [
        13
      ],
      "countUniqueValuesLinkedinLink": [
        10
      ],
      "countEmptyLinkedinLink": [
        10
      ],
      "countNotEmptyLinkedinLink": [
        10
      ],
      "percentageEmptyLinkedinLink": [
        13
      ],
      "percentageNotEmptyLinkedinLink": [
        13
      ],
      "countUniqueValuesCity": [
        10
      ],
      "countEmptyCity": [
        10
      ],
      "countNotEmptyCity": [
        10
      ],
      "percentageEmptyCity": [
        13
      ],
      "percentageNotEmptyCity": [
        13
      ],
      "countUniqueValuesAvatarUrl": [
        10
      ],
      "countEmptyAvatarUrl": [
        10
      ],
      "countNotEmptyAvatarUrl": [
        10
      ],
      "percentageEmptyAvatarUrl": [
        13
      ],
      "percentageNotEmptyAvatarUrl": [
        13
      ],
      "countUniqueValuesXLink": [
        10
      ],
      "countEmptyXLink": [
        10
      ],
      "countNotEmptyXLink": [
        10
      ],
      "percentageEmptyXLink": [
        13
      ],
      "percentageNotEmptyXLink": [
        13
      ],
      "countUniqueValuesEmails": [
        10
      ],
      "countEmptyEmails": [
        10
      ],
      "countNotEmptyEmails": [
        10
      ],
      "percentageEmptyEmails": [
        13
      ],
      "percentageNotEmptyEmails": [
        13
      ],
      "countUniqueValuesPhones": [
        10
      ],
      "countEmptyPhones": [
        10
      ],
      "countNotEmptyPhones": [
        10
      ],
      "percentageEmptyPhones": [
        13
      ],
      "percentageNotEmptyPhones": [
        13
      ],
      "edges": [
        630
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "PersonRelationInput": {
      "connect": [
        634
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "PersonConnectInput": {
      "where": [
        635
      ],
      "__typename": [
        1
      ]
    },
    "PersonWhereUniqueInput": {
      "id": [
        22
      ],
      "emails": [
        636
      ],
      "__typename": [
        1
      ]
    },
    "PersonEmailsWhereInput": {
      "primaryEmail": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "PersonCreateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        70
      ],
      "position": [
        246
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "searchVector": [
        247
      ],
      "jobTitle": [
        1
      ],
      "linkedinLink": [
        53
      ],
      "city": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "xLink": [
        53
      ],
      "companyId": [
        22
      ],
      "company": [
        603
      ],
      "emails": [
        90
      ],
      "phones": [
        96
      ],
      "__typename": [
        1
      ]
    },
    "PersonUpdateInput": {
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        71
      ],
      "position": [
        246
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "searchVector": [
        247
      ],
      "jobTitle": [
        1
      ],
      "linkedinLink": [
        54
      ],
      "city": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "xLink": [
        54
      ],
      "companyId": [
        22
      ],
      "company": [
        603
      ],
      "emails": [
        91
      ],
      "phones": [
        97
      ],
      "__typename": [
        1
      ]
    },
    "PersonFilterInput": {
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        72
      ],
      "position": [
        179
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "searchVector": [
        257
      ],
      "jobTitle": [
        56
      ],
      "linkedinLink": [
        55
      ],
      "city": [
        56
      ],
      "avatarUrl": [
        56
      ],
      "attachments": [
        580
      ],
      "calendarEventParticipants": [
        581
      ],
      "favorites": [
        582
      ],
      "messageParticipants": [
        583
      ],
      "noteTargets": [
        584
      ],
      "taskTargets": [
        585
      ],
      "timelineActivities": [
        586
      ],
      "xLink": [
        55
      ],
      "companyId": [
        33
      ],
      "pointOfContactForOpportunities": [
        587
      ],
      "emails": [
        92
      ],
      "phones": [
        98
      ],
      "and": [
        639
      ],
      "or": [
        639
      ],
      "not": [
        639
      ],
      "__typename": [
        1
      ]
    },
    "PersonOrderByInput": {
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "name": [
        73
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "jobTitle": [
        59
      ],
      "linkedinLink": [
        58
      ],
      "city": [
        59
      ],
      "avatarUrl": [
        59
      ],
      "xLink": [
        58
      ],
      "companyId": [
        59
      ],
      "company": [
        610
      ],
      "emails": [
        93
      ],
      "phones": [
        99
      ],
      "__typename": [
        1
      ]
    },
    "PersonOrderByWithGroupByInput": {
      "aggregate": [
        642
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "name": [
        73
      ],
      "position": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "searchVector": [
        59
      ],
      "jobTitle": [
        59
      ],
      "linkedinLink": [
        58
      ],
      "city": [
        59
      ],
      "avatarUrl": [
        59
      ],
      "xLink": [
        58
      ],
      "companyId": [
        59
      ],
      "company": [
        611
      ],
      "emails": [
        93
      ],
      "phones": [
        99
      ],
      "__typename": [
        1
      ]
    },
    "PersonOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "countUniqueValuesJobTitle": [
        59
      ],
      "countEmptyJobTitle": [
        59
      ],
      "countNotEmptyJobTitle": [
        59
      ],
      "percentageEmptyJobTitle": [
        59
      ],
      "percentageNotEmptyJobTitle": [
        59
      ],
      "countUniqueValuesLinkedinLink": [
        59
      ],
      "countEmptyLinkedinLink": [
        59
      ],
      "countNotEmptyLinkedinLink": [
        59
      ],
      "percentageEmptyLinkedinLink": [
        59
      ],
      "percentageNotEmptyLinkedinLink": [
        59
      ],
      "countUniqueValuesCity": [
        59
      ],
      "countEmptyCity": [
        59
      ],
      "countNotEmptyCity": [
        59
      ],
      "percentageEmptyCity": [
        59
      ],
      "percentageNotEmptyCity": [
        59
      ],
      "countUniqueValuesAvatarUrl": [
        59
      ],
      "countEmptyAvatarUrl": [
        59
      ],
      "countNotEmptyAvatarUrl": [
        59
      ],
      "percentageEmptyAvatarUrl": [
        59
      ],
      "percentageNotEmptyAvatarUrl": [
        59
      ],
      "countUniqueValuesXLink": [
        59
      ],
      "countEmptyXLink": [
        59
      ],
      "countNotEmptyXLink": [
        59
      ],
      "percentageEmptyXLink": [
        59
      ],
      "percentageNotEmptyXLink": [
        59
      ],
      "companyId": [
        59
      ],
      "company": [
        610
      ],
      "countUniqueValuesEmails": [
        59
      ],
      "countEmptyEmails": [
        59
      ],
      "countNotEmptyEmails": [
        59
      ],
      "percentageEmptyEmails": [
        59
      ],
      "percentageNotEmptyEmails": [
        59
      ],
      "countUniqueValuesPhones": [
        59
      ],
      "countEmptyPhones": [
        59
      ],
      "countNotEmptyPhones": [
        59
      ],
      "percentageEmptyPhones": [
        59
      ],
      "percentageNotEmptyPhones": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "PersonGroupByInput": {
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "name": [
        74
      ],
      "position": [
        6
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "searchVector": [
        6
      ],
      "jobTitle": [
        6
      ],
      "linkedinLink": [
        60
      ],
      "city": [
        6
      ],
      "avatarUrl": [
        6
      ],
      "xLink": [
        60
      ],
      "company": [
        613
      ],
      "emails": [
        94
      ],
      "phones": [
        100
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardCallTypeEnum": {},
    "QaScorecardOverallResultEnum": {},
    "QaScorecardStatusEnum": {},
    "QaScorecard": {
      "name": [
        1
      ],
      "overallScore": [
        13
      ],
      "callType": [
        644
      ],
      "redFlagRecordedLine": [
        6
      ],
      "redFlagMarketplace": [
        6
      ],
      "redFlagAor": [
        6
      ],
      "redFlagCommission": [
        6
      ],
      "redFlagHealthSherpa": [
        6
      ],
      "redFlagAgentCoaching": [
        6
      ],
      "redFlagDncViolation": [
        6
      ],
      "hasRedFlag": [
        6
      ],
      "openingScore": [
        13
      ],
      "factFindingScore": [
        13
      ],
      "eligibilityScore": [
        13
      ],
      "presentationScore": [
        13
      ],
      "applicationScore": [
        13
      ],
      "closingScore": [
        13
      ],
      "scoreDetails": [
        101
      ],
      "redFlagDetails": [
        101
      ],
      "transcript": [
        101
      ],
      "recommendations": [
        101
      ],
      "analyzedAt": [
        7
      ],
      "id": [
        2
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "createdBy": [
        82
      ],
      "updatedBy": [
        82
      ],
      "position": [
        246
      ],
      "searchVector": [
        247
      ],
      "overallResult": [
        645
      ],
      "status": [
        646
      ],
      "timelineActivities": [
        463,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            470
          ],
          "orderBy": [
            471,
            "[TimelineActivityOrderByInput]"
          ]
        }
      ],
      "favorites": [
        267,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            274
          ],
          "orderBy": [
            275,
            "[FavoriteOrderByInput]"
          ]
        }
      ],
      "attachments": [
        116,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            126
          ],
          "orderBy": [
            128,
            "[AttachmentOrderByInput]"
          ]
        }
      ],
      "noteTargets": [
        415,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            422
          ],
          "orderBy": [
            423,
            "[NoteTargetOrderByInput]"
          ]
        }
      ],
      "taskTargets": [
        449,
        {
          "first": [
            10
          ],
          "last": [
            10
          ],
          "offset": [
            10
          ],
          "before": [
            1
          ],
          "after": [
            1
          ],
          "filter": [
            456
          ],
          "orderBy": [
            457,
            "[TaskTargetOrderByInput]"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardEdge": {
      "node": [
        647
      ],
      "cursor": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesOverallScore": [
        10
      ],
      "countEmptyOverallScore": [
        10
      ],
      "countNotEmptyOverallScore": [
        10
      ],
      "percentageEmptyOverallScore": [
        13
      ],
      "percentageNotEmptyOverallScore": [
        13
      ],
      "minOverallScore": [
        13
      ],
      "maxOverallScore": [
        13
      ],
      "avgOverallScore": [
        13
      ],
      "sumOverallScore": [
        13
      ],
      "countUniqueValuesCallType": [
        10
      ],
      "countEmptyCallType": [
        10
      ],
      "countNotEmptyCallType": [
        10
      ],
      "percentageEmptyCallType": [
        13
      ],
      "percentageNotEmptyCallType": [
        13
      ],
      "countUniqueValuesRedFlagRecordedLine": [
        10
      ],
      "countEmptyRedFlagRecordedLine": [
        10
      ],
      "countNotEmptyRedFlagRecordedLine": [
        10
      ],
      "percentageEmptyRedFlagRecordedLine": [
        13
      ],
      "percentageNotEmptyRedFlagRecordedLine": [
        13
      ],
      "countTrueRedFlagRecordedLine": [
        10
      ],
      "countFalseRedFlagRecordedLine": [
        10
      ],
      "countUniqueValuesRedFlagMarketplace": [
        10
      ],
      "countEmptyRedFlagMarketplace": [
        10
      ],
      "countNotEmptyRedFlagMarketplace": [
        10
      ],
      "percentageEmptyRedFlagMarketplace": [
        13
      ],
      "percentageNotEmptyRedFlagMarketplace": [
        13
      ],
      "countTrueRedFlagMarketplace": [
        10
      ],
      "countFalseRedFlagMarketplace": [
        10
      ],
      "countUniqueValuesRedFlagAor": [
        10
      ],
      "countEmptyRedFlagAor": [
        10
      ],
      "countNotEmptyRedFlagAor": [
        10
      ],
      "percentageEmptyRedFlagAor": [
        13
      ],
      "percentageNotEmptyRedFlagAor": [
        13
      ],
      "countTrueRedFlagAor": [
        10
      ],
      "countFalseRedFlagAor": [
        10
      ],
      "countUniqueValuesRedFlagCommission": [
        10
      ],
      "countEmptyRedFlagCommission": [
        10
      ],
      "countNotEmptyRedFlagCommission": [
        10
      ],
      "percentageEmptyRedFlagCommission": [
        13
      ],
      "percentageNotEmptyRedFlagCommission": [
        13
      ],
      "countTrueRedFlagCommission": [
        10
      ],
      "countFalseRedFlagCommission": [
        10
      ],
      "countUniqueValuesRedFlagHealthSherpa": [
        10
      ],
      "countEmptyRedFlagHealthSherpa": [
        10
      ],
      "countNotEmptyRedFlagHealthSherpa": [
        10
      ],
      "percentageEmptyRedFlagHealthSherpa": [
        13
      ],
      "percentageNotEmptyRedFlagHealthSherpa": [
        13
      ],
      "countTrueRedFlagHealthSherpa": [
        10
      ],
      "countFalseRedFlagHealthSherpa": [
        10
      ],
      "countUniqueValuesRedFlagAgentCoaching": [
        10
      ],
      "countEmptyRedFlagAgentCoaching": [
        10
      ],
      "countNotEmptyRedFlagAgentCoaching": [
        10
      ],
      "percentageEmptyRedFlagAgentCoaching": [
        13
      ],
      "percentageNotEmptyRedFlagAgentCoaching": [
        13
      ],
      "countTrueRedFlagAgentCoaching": [
        10
      ],
      "countFalseRedFlagAgentCoaching": [
        10
      ],
      "countUniqueValuesRedFlagDncViolation": [
        10
      ],
      "countEmptyRedFlagDncViolation": [
        10
      ],
      "countNotEmptyRedFlagDncViolation": [
        10
      ],
      "percentageEmptyRedFlagDncViolation": [
        13
      ],
      "percentageNotEmptyRedFlagDncViolation": [
        13
      ],
      "countTrueRedFlagDncViolation": [
        10
      ],
      "countFalseRedFlagDncViolation": [
        10
      ],
      "countUniqueValuesHasRedFlag": [
        10
      ],
      "countEmptyHasRedFlag": [
        10
      ],
      "countNotEmptyHasRedFlag": [
        10
      ],
      "percentageEmptyHasRedFlag": [
        13
      ],
      "percentageNotEmptyHasRedFlag": [
        13
      ],
      "countTrueHasRedFlag": [
        10
      ],
      "countFalseHasRedFlag": [
        10
      ],
      "countUniqueValuesOpeningScore": [
        10
      ],
      "countEmptyOpeningScore": [
        10
      ],
      "countNotEmptyOpeningScore": [
        10
      ],
      "percentageEmptyOpeningScore": [
        13
      ],
      "percentageNotEmptyOpeningScore": [
        13
      ],
      "minOpeningScore": [
        13
      ],
      "maxOpeningScore": [
        13
      ],
      "avgOpeningScore": [
        13
      ],
      "sumOpeningScore": [
        13
      ],
      "countUniqueValuesFactFindingScore": [
        10
      ],
      "countEmptyFactFindingScore": [
        10
      ],
      "countNotEmptyFactFindingScore": [
        10
      ],
      "percentageEmptyFactFindingScore": [
        13
      ],
      "percentageNotEmptyFactFindingScore": [
        13
      ],
      "minFactFindingScore": [
        13
      ],
      "maxFactFindingScore": [
        13
      ],
      "avgFactFindingScore": [
        13
      ],
      "sumFactFindingScore": [
        13
      ],
      "countUniqueValuesEligibilityScore": [
        10
      ],
      "countEmptyEligibilityScore": [
        10
      ],
      "countNotEmptyEligibilityScore": [
        10
      ],
      "percentageEmptyEligibilityScore": [
        13
      ],
      "percentageNotEmptyEligibilityScore": [
        13
      ],
      "minEligibilityScore": [
        13
      ],
      "maxEligibilityScore": [
        13
      ],
      "avgEligibilityScore": [
        13
      ],
      "sumEligibilityScore": [
        13
      ],
      "countUniqueValuesPresentationScore": [
        10
      ],
      "countEmptyPresentationScore": [
        10
      ],
      "countNotEmptyPresentationScore": [
        10
      ],
      "percentageEmptyPresentationScore": [
        13
      ],
      "percentageNotEmptyPresentationScore": [
        13
      ],
      "minPresentationScore": [
        13
      ],
      "maxPresentationScore": [
        13
      ],
      "avgPresentationScore": [
        13
      ],
      "sumPresentationScore": [
        13
      ],
      "countUniqueValuesApplicationScore": [
        10
      ],
      "countEmptyApplicationScore": [
        10
      ],
      "countNotEmptyApplicationScore": [
        10
      ],
      "percentageEmptyApplicationScore": [
        13
      ],
      "percentageNotEmptyApplicationScore": [
        13
      ],
      "minApplicationScore": [
        13
      ],
      "maxApplicationScore": [
        13
      ],
      "avgApplicationScore": [
        13
      ],
      "sumApplicationScore": [
        13
      ],
      "countUniqueValuesClosingScore": [
        10
      ],
      "countEmptyClosingScore": [
        10
      ],
      "countNotEmptyClosingScore": [
        10
      ],
      "percentageEmptyClosingScore": [
        13
      ],
      "percentageNotEmptyClosingScore": [
        13
      ],
      "minClosingScore": [
        13
      ],
      "maxClosingScore": [
        13
      ],
      "avgClosingScore": [
        13
      ],
      "sumClosingScore": [
        13
      ],
      "countUniqueValuesScoreDetails": [
        10
      ],
      "countEmptyScoreDetails": [
        10
      ],
      "countNotEmptyScoreDetails": [
        10
      ],
      "percentageEmptyScoreDetails": [
        13
      ],
      "percentageNotEmptyScoreDetails": [
        13
      ],
      "countUniqueValuesRedFlagDetails": [
        10
      ],
      "countEmptyRedFlagDetails": [
        10
      ],
      "countNotEmptyRedFlagDetails": [
        10
      ],
      "percentageEmptyRedFlagDetails": [
        13
      ],
      "percentageNotEmptyRedFlagDetails": [
        13
      ],
      "countUniqueValuesTranscript": [
        10
      ],
      "countEmptyTranscript": [
        10
      ],
      "countNotEmptyTranscript": [
        10
      ],
      "percentageEmptyTranscript": [
        13
      ],
      "percentageNotEmptyTranscript": [
        13
      ],
      "countUniqueValuesRecommendations": [
        10
      ],
      "countEmptyRecommendations": [
        10
      ],
      "countNotEmptyRecommendations": [
        10
      ],
      "percentageEmptyRecommendations": [
        13
      ],
      "percentageNotEmptyRecommendations": [
        13
      ],
      "countUniqueValuesAnalyzedAt": [
        10
      ],
      "countEmptyAnalyzedAt": [
        10
      ],
      "countNotEmptyAnalyzedAt": [
        10
      ],
      "percentageEmptyAnalyzedAt": [
        13
      ],
      "percentageNotEmptyAnalyzedAt": [
        13
      ],
      "minAnalyzedAt": [
        7
      ],
      "maxAnalyzedAt": [
        7
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "countUniqueValuesOverallResult": [
        10
      ],
      "countEmptyOverallResult": [
        10
      ],
      "countNotEmptyOverallResult": [
        10
      ],
      "percentageEmptyOverallResult": [
        13
      ],
      "percentageNotEmptyOverallResult": [
        13
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "edges": [
        648
      ],
      "pageInfo": [
        117
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardGroupByConnection": {
      "totalCount": [
        10
      ],
      "countUniqueValuesName": [
        10
      ],
      "countEmptyName": [
        10
      ],
      "countNotEmptyName": [
        10
      ],
      "percentageEmptyName": [
        13
      ],
      "percentageNotEmptyName": [
        13
      ],
      "countUniqueValuesOverallScore": [
        10
      ],
      "countEmptyOverallScore": [
        10
      ],
      "countNotEmptyOverallScore": [
        10
      ],
      "percentageEmptyOverallScore": [
        13
      ],
      "percentageNotEmptyOverallScore": [
        13
      ],
      "minOverallScore": [
        13
      ],
      "maxOverallScore": [
        13
      ],
      "avgOverallScore": [
        13
      ],
      "sumOverallScore": [
        13
      ],
      "countUniqueValuesCallType": [
        10
      ],
      "countEmptyCallType": [
        10
      ],
      "countNotEmptyCallType": [
        10
      ],
      "percentageEmptyCallType": [
        13
      ],
      "percentageNotEmptyCallType": [
        13
      ],
      "countUniqueValuesRedFlagRecordedLine": [
        10
      ],
      "countEmptyRedFlagRecordedLine": [
        10
      ],
      "countNotEmptyRedFlagRecordedLine": [
        10
      ],
      "percentageEmptyRedFlagRecordedLine": [
        13
      ],
      "percentageNotEmptyRedFlagRecordedLine": [
        13
      ],
      "countTrueRedFlagRecordedLine": [
        10
      ],
      "countFalseRedFlagRecordedLine": [
        10
      ],
      "countUniqueValuesRedFlagMarketplace": [
        10
      ],
      "countEmptyRedFlagMarketplace": [
        10
      ],
      "countNotEmptyRedFlagMarketplace": [
        10
      ],
      "percentageEmptyRedFlagMarketplace": [
        13
      ],
      "percentageNotEmptyRedFlagMarketplace": [
        13
      ],
      "countTrueRedFlagMarketplace": [
        10
      ],
      "countFalseRedFlagMarketplace": [
        10
      ],
      "countUniqueValuesRedFlagAor": [
        10
      ],
      "countEmptyRedFlagAor": [
        10
      ],
      "countNotEmptyRedFlagAor": [
        10
      ],
      "percentageEmptyRedFlagAor": [
        13
      ],
      "percentageNotEmptyRedFlagAor": [
        13
      ],
      "countTrueRedFlagAor": [
        10
      ],
      "countFalseRedFlagAor": [
        10
      ],
      "countUniqueValuesRedFlagCommission": [
        10
      ],
      "countEmptyRedFlagCommission": [
        10
      ],
      "countNotEmptyRedFlagCommission": [
        10
      ],
      "percentageEmptyRedFlagCommission": [
        13
      ],
      "percentageNotEmptyRedFlagCommission": [
        13
      ],
      "countTrueRedFlagCommission": [
        10
      ],
      "countFalseRedFlagCommission": [
        10
      ],
      "countUniqueValuesRedFlagHealthSherpa": [
        10
      ],
      "countEmptyRedFlagHealthSherpa": [
        10
      ],
      "countNotEmptyRedFlagHealthSherpa": [
        10
      ],
      "percentageEmptyRedFlagHealthSherpa": [
        13
      ],
      "percentageNotEmptyRedFlagHealthSherpa": [
        13
      ],
      "countTrueRedFlagHealthSherpa": [
        10
      ],
      "countFalseRedFlagHealthSherpa": [
        10
      ],
      "countUniqueValuesRedFlagAgentCoaching": [
        10
      ],
      "countEmptyRedFlagAgentCoaching": [
        10
      ],
      "countNotEmptyRedFlagAgentCoaching": [
        10
      ],
      "percentageEmptyRedFlagAgentCoaching": [
        13
      ],
      "percentageNotEmptyRedFlagAgentCoaching": [
        13
      ],
      "countTrueRedFlagAgentCoaching": [
        10
      ],
      "countFalseRedFlagAgentCoaching": [
        10
      ],
      "countUniqueValuesRedFlagDncViolation": [
        10
      ],
      "countEmptyRedFlagDncViolation": [
        10
      ],
      "countNotEmptyRedFlagDncViolation": [
        10
      ],
      "percentageEmptyRedFlagDncViolation": [
        13
      ],
      "percentageNotEmptyRedFlagDncViolation": [
        13
      ],
      "countTrueRedFlagDncViolation": [
        10
      ],
      "countFalseRedFlagDncViolation": [
        10
      ],
      "countUniqueValuesHasRedFlag": [
        10
      ],
      "countEmptyHasRedFlag": [
        10
      ],
      "countNotEmptyHasRedFlag": [
        10
      ],
      "percentageEmptyHasRedFlag": [
        13
      ],
      "percentageNotEmptyHasRedFlag": [
        13
      ],
      "countTrueHasRedFlag": [
        10
      ],
      "countFalseHasRedFlag": [
        10
      ],
      "countUniqueValuesOpeningScore": [
        10
      ],
      "countEmptyOpeningScore": [
        10
      ],
      "countNotEmptyOpeningScore": [
        10
      ],
      "percentageEmptyOpeningScore": [
        13
      ],
      "percentageNotEmptyOpeningScore": [
        13
      ],
      "minOpeningScore": [
        13
      ],
      "maxOpeningScore": [
        13
      ],
      "avgOpeningScore": [
        13
      ],
      "sumOpeningScore": [
        13
      ],
      "countUniqueValuesFactFindingScore": [
        10
      ],
      "countEmptyFactFindingScore": [
        10
      ],
      "countNotEmptyFactFindingScore": [
        10
      ],
      "percentageEmptyFactFindingScore": [
        13
      ],
      "percentageNotEmptyFactFindingScore": [
        13
      ],
      "minFactFindingScore": [
        13
      ],
      "maxFactFindingScore": [
        13
      ],
      "avgFactFindingScore": [
        13
      ],
      "sumFactFindingScore": [
        13
      ],
      "countUniqueValuesEligibilityScore": [
        10
      ],
      "countEmptyEligibilityScore": [
        10
      ],
      "countNotEmptyEligibilityScore": [
        10
      ],
      "percentageEmptyEligibilityScore": [
        13
      ],
      "percentageNotEmptyEligibilityScore": [
        13
      ],
      "minEligibilityScore": [
        13
      ],
      "maxEligibilityScore": [
        13
      ],
      "avgEligibilityScore": [
        13
      ],
      "sumEligibilityScore": [
        13
      ],
      "countUniqueValuesPresentationScore": [
        10
      ],
      "countEmptyPresentationScore": [
        10
      ],
      "countNotEmptyPresentationScore": [
        10
      ],
      "percentageEmptyPresentationScore": [
        13
      ],
      "percentageNotEmptyPresentationScore": [
        13
      ],
      "minPresentationScore": [
        13
      ],
      "maxPresentationScore": [
        13
      ],
      "avgPresentationScore": [
        13
      ],
      "sumPresentationScore": [
        13
      ],
      "countUniqueValuesApplicationScore": [
        10
      ],
      "countEmptyApplicationScore": [
        10
      ],
      "countNotEmptyApplicationScore": [
        10
      ],
      "percentageEmptyApplicationScore": [
        13
      ],
      "percentageNotEmptyApplicationScore": [
        13
      ],
      "minApplicationScore": [
        13
      ],
      "maxApplicationScore": [
        13
      ],
      "avgApplicationScore": [
        13
      ],
      "sumApplicationScore": [
        13
      ],
      "countUniqueValuesClosingScore": [
        10
      ],
      "countEmptyClosingScore": [
        10
      ],
      "countNotEmptyClosingScore": [
        10
      ],
      "percentageEmptyClosingScore": [
        13
      ],
      "percentageNotEmptyClosingScore": [
        13
      ],
      "minClosingScore": [
        13
      ],
      "maxClosingScore": [
        13
      ],
      "avgClosingScore": [
        13
      ],
      "sumClosingScore": [
        13
      ],
      "countUniqueValuesScoreDetails": [
        10
      ],
      "countEmptyScoreDetails": [
        10
      ],
      "countNotEmptyScoreDetails": [
        10
      ],
      "percentageEmptyScoreDetails": [
        13
      ],
      "percentageNotEmptyScoreDetails": [
        13
      ],
      "countUniqueValuesRedFlagDetails": [
        10
      ],
      "countEmptyRedFlagDetails": [
        10
      ],
      "countNotEmptyRedFlagDetails": [
        10
      ],
      "percentageEmptyRedFlagDetails": [
        13
      ],
      "percentageNotEmptyRedFlagDetails": [
        13
      ],
      "countUniqueValuesTranscript": [
        10
      ],
      "countEmptyTranscript": [
        10
      ],
      "countNotEmptyTranscript": [
        10
      ],
      "percentageEmptyTranscript": [
        13
      ],
      "percentageNotEmptyTranscript": [
        13
      ],
      "countUniqueValuesRecommendations": [
        10
      ],
      "countEmptyRecommendations": [
        10
      ],
      "countNotEmptyRecommendations": [
        10
      ],
      "percentageEmptyRecommendations": [
        13
      ],
      "percentageNotEmptyRecommendations": [
        13
      ],
      "countUniqueValuesAnalyzedAt": [
        10
      ],
      "countEmptyAnalyzedAt": [
        10
      ],
      "countNotEmptyAnalyzedAt": [
        10
      ],
      "percentageEmptyAnalyzedAt": [
        13
      ],
      "percentageNotEmptyAnalyzedAt": [
        13
      ],
      "minAnalyzedAt": [
        7
      ],
      "maxAnalyzedAt": [
        7
      ],
      "countUniqueValuesId": [
        10
      ],
      "countEmptyId": [
        10
      ],
      "countNotEmptyId": [
        10
      ],
      "percentageEmptyId": [
        13
      ],
      "percentageNotEmptyId": [
        13
      ],
      "countUniqueValuesCreatedAt": [
        10
      ],
      "countEmptyCreatedAt": [
        10
      ],
      "countNotEmptyCreatedAt": [
        10
      ],
      "percentageEmptyCreatedAt": [
        13
      ],
      "percentageNotEmptyCreatedAt": [
        13
      ],
      "minCreatedAt": [
        7
      ],
      "maxCreatedAt": [
        7
      ],
      "countUniqueValuesUpdatedAt": [
        10
      ],
      "countEmptyUpdatedAt": [
        10
      ],
      "countNotEmptyUpdatedAt": [
        10
      ],
      "percentageEmptyUpdatedAt": [
        13
      ],
      "percentageNotEmptyUpdatedAt": [
        13
      ],
      "minUpdatedAt": [
        7
      ],
      "maxUpdatedAt": [
        7
      ],
      "countUniqueValuesDeletedAt": [
        10
      ],
      "countEmptyDeletedAt": [
        10
      ],
      "countNotEmptyDeletedAt": [
        10
      ],
      "percentageEmptyDeletedAt": [
        13
      ],
      "percentageNotEmptyDeletedAt": [
        13
      ],
      "minDeletedAt": [
        7
      ],
      "maxDeletedAt": [
        7
      ],
      "countUniqueValuesCreatedBy": [
        10
      ],
      "countEmptyCreatedBy": [
        10
      ],
      "countNotEmptyCreatedBy": [
        10
      ],
      "percentageEmptyCreatedBy": [
        13
      ],
      "percentageNotEmptyCreatedBy": [
        13
      ],
      "countUniqueValuesUpdatedBy": [
        10
      ],
      "countEmptyUpdatedBy": [
        10
      ],
      "countNotEmptyUpdatedBy": [
        10
      ],
      "percentageEmptyUpdatedBy": [
        13
      ],
      "percentageNotEmptyUpdatedBy": [
        13
      ],
      "countUniqueValuesPosition": [
        10
      ],
      "countEmptyPosition": [
        10
      ],
      "countNotEmptyPosition": [
        10
      ],
      "percentageEmptyPosition": [
        13
      ],
      "percentageNotEmptyPosition": [
        13
      ],
      "countUniqueValuesSearchVector": [
        10
      ],
      "countEmptySearchVector": [
        10
      ],
      "countNotEmptySearchVector": [
        10
      ],
      "percentageEmptySearchVector": [
        13
      ],
      "percentageNotEmptySearchVector": [
        13
      ],
      "countUniqueValuesOverallResult": [
        10
      ],
      "countEmptyOverallResult": [
        10
      ],
      "countNotEmptyOverallResult": [
        10
      ],
      "percentageEmptyOverallResult": [
        13
      ],
      "percentageNotEmptyOverallResult": [
        13
      ],
      "countUniqueValuesStatus": [
        10
      ],
      "countEmptyStatus": [
        10
      ],
      "countNotEmptyStatus": [
        10
      ],
      "percentageEmptyStatus": [
        13
      ],
      "percentageNotEmptyStatus": [
        13
      ],
      "edges": [
        648
      ],
      "pageInfo": [
        117
      ],
      "groupByDimensionValues": [
        25
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardRelationInput": {
      "connect": [
        652
      ],
      "disconnect": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardConnectInput": {
      "where": [
        653
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardWhereUniqueInput": {
      "id": [
        22
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardCreateInput": {
      "name": [
        1
      ],
      "overallScore": [
        13
      ],
      "callType": [
        644
      ],
      "redFlagRecordedLine": [
        6
      ],
      "redFlagMarketplace": [
        6
      ],
      "redFlagAor": [
        6
      ],
      "redFlagCommission": [
        6
      ],
      "redFlagHealthSherpa": [
        6
      ],
      "redFlagAgentCoaching": [
        6
      ],
      "redFlagDncViolation": [
        6
      ],
      "hasRedFlag": [
        6
      ],
      "openingScore": [
        13
      ],
      "factFindingScore": [
        13
      ],
      "eligibilityScore": [
        13
      ],
      "presentationScore": [
        13
      ],
      "applicationScore": [
        13
      ],
      "closingScore": [
        13
      ],
      "scoreDetails": [
        102
      ],
      "redFlagDetails": [
        102
      ],
      "transcript": [
        102
      ],
      "recommendations": [
        102
      ],
      "analyzedAt": [
        7
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "createdBy": [
        83
      ],
      "updatedBy": [
        83
      ],
      "position": [
        246
      ],
      "searchVector": [
        247
      ],
      "overallResult": [
        645
      ],
      "status": [
        646
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardUpdateInput": {
      "name": [
        1
      ],
      "overallScore": [
        13
      ],
      "callType": [
        644
      ],
      "redFlagRecordedLine": [
        6
      ],
      "redFlagMarketplace": [
        6
      ],
      "redFlagAor": [
        6
      ],
      "redFlagCommission": [
        6
      ],
      "redFlagHealthSherpa": [
        6
      ],
      "redFlagAgentCoaching": [
        6
      ],
      "redFlagDncViolation": [
        6
      ],
      "hasRedFlag": [
        6
      ],
      "openingScore": [
        13
      ],
      "factFindingScore": [
        13
      ],
      "eligibilityScore": [
        13
      ],
      "presentationScore": [
        13
      ],
      "applicationScore": [
        13
      ],
      "closingScore": [
        13
      ],
      "scoreDetails": [
        103
      ],
      "redFlagDetails": [
        103
      ],
      "transcript": [
        103
      ],
      "recommendations": [
        103
      ],
      "analyzedAt": [
        7
      ],
      "id": [
        22
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "createdBy": [
        84
      ],
      "updatedBy": [
        84
      ],
      "position": [
        246
      ],
      "searchVector": [
        247
      ],
      "overallResult": [
        645
      ],
      "status": [
        646
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardFilterInput": {
      "name": [
        56
      ],
      "overallScore": [
        179
      ],
      "callType": [
        657
      ],
      "redFlagRecordedLine": [
        175
      ],
      "redFlagMarketplace": [
        175
      ],
      "redFlagAor": [
        175
      ],
      "redFlagCommission": [
        175
      ],
      "redFlagHealthSherpa": [
        175
      ],
      "redFlagAgentCoaching": [
        175
      ],
      "redFlagDncViolation": [
        175
      ],
      "hasRedFlag": [
        175
      ],
      "openingScore": [
        179
      ],
      "factFindingScore": [
        179
      ],
      "eligibilityScore": [
        179
      ],
      "presentationScore": [
        179
      ],
      "applicationScore": [
        179
      ],
      "closingScore": [
        179
      ],
      "scoreDetails": [
        104
      ],
      "redFlagDetails": [
        104
      ],
      "transcript": [
        104
      ],
      "recommendations": [
        104
      ],
      "analyzedAt": [
        7
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "position": [
        179
      ],
      "searchVector": [
        257
      ],
      "timelineActivities": [
        658
      ],
      "favorites": [
        659
      ],
      "attachments": [
        660
      ],
      "noteTargets": [
        661
      ],
      "taskTargets": [
        662
      ],
      "overallResult": [
        663
      ],
      "status": [
        664
      ],
      "and": [
        656
      ],
      "or": [
        656
      ],
      "not": [
        656
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardCallTypeEnumFilter": {
      "eq": [
        644
      ],
      "neq": [
        644
      ],
      "in": [
        644
      ],
      "containsAny": [
        644
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "timelineActivitiesOneToManyFilter_fc92d951": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "happensAt": [
        7
      ],
      "name": [
        56
      ],
      "properties": [
        57
      ],
      "linkedRecordCachedName": [
        56
      ],
      "linkedRecordId": [
        33
      ],
      "linkedObjectMetadataId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetTaskId": [
        33
      ],
      "workspaceMemberId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetWorkflowVersionId": [
        33
      ],
      "targetWorkflowRunId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "favoritesOneToManyFilter_e6b70a53": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "position": [
        179
      ],
      "viewId": [
        33
      ],
      "companyId": [
        33
      ],
      "dashboardId": [
        33
      ],
      "forWorkspaceMemberId": [
        33
      ],
      "personId": [
        33
      ],
      "opportunityId": [
        33
      ],
      "workflowId": [
        33
      ],
      "workflowVersionId": [
        33
      ],
      "workflowRunId": [
        33
      ],
      "taskId": [
        33
      ],
      "noteId": [
        33
      ],
      "favoriteFolderId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "attachmentsOneToManyFilter_ad12373a": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "name": [
        56
      ],
      "file": [
        57
      ],
      "fullPath": [
        56
      ],
      "fileCategory": [
        127
      ],
      "createdBy": [
        85
      ],
      "updatedBy": [
        85
      ],
      "targetTaskId": [
        33
      ],
      "targetNoteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetDashboardId": [
        33
      ],
      "targetWorkflowId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "noteTargetsOneToManyFilter_eae70941": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "noteId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "taskTargetsOneToManyFilter_c5bb22e4": {
      "is": [
        34
      ],
      "id": [
        33
      ],
      "createdAt": [
        7
      ],
      "updatedAt": [
        7
      ],
      "deletedAt": [
        7
      ],
      "targetCompanyId": [
        33
      ],
      "targetOpportunityId": [
        33
      ],
      "targetPersonId": [
        33
      ],
      "taskId": [
        33
      ],
      "targetQaScorecardId": [
        33
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardOverallResultEnumFilter": {
      "eq": [
        645
      ],
      "neq": [
        645
      ],
      "in": [
        645
      ],
      "containsAny": [
        645
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardStatusEnumFilter": {
      "eq": [
        646
      ],
      "neq": [
        646
      ],
      "in": [
        646
      ],
      "containsAny": [
        646
      ],
      "is": [
        34
      ],
      "isEmptyArray": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardOrderByInput": {
      "name": [
        59
      ],
      "overallScore": [
        59
      ],
      "callType": [
        59
      ],
      "redFlagRecordedLine": [
        59
      ],
      "redFlagMarketplace": [
        59
      ],
      "redFlagAor": [
        59
      ],
      "redFlagCommission": [
        59
      ],
      "redFlagHealthSherpa": [
        59
      ],
      "redFlagAgentCoaching": [
        59
      ],
      "redFlagDncViolation": [
        59
      ],
      "hasRedFlag": [
        59
      ],
      "openingScore": [
        59
      ],
      "factFindingScore": [
        59
      ],
      "eligibilityScore": [
        59
      ],
      "presentationScore": [
        59
      ],
      "applicationScore": [
        59
      ],
      "closingScore": [
        59
      ],
      "scoreDetails": [
        105
      ],
      "redFlagDetails": [
        105
      ],
      "transcript": [
        105
      ],
      "recommendations": [
        105
      ],
      "analyzedAt": [
        59
      ],
      "id": [
        59
      ],
      "createdAt": [
        59
      ],
      "updatedAt": [
        59
      ],
      "deletedAt": [
        59
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "position": [
        59
      ],
      "searchVector": [
        59
      ],
      "overallResult": [
        59
      ],
      "status": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardOrderByWithGroupByInput": {
      "aggregate": [
        667
      ],
      "name": [
        59
      ],
      "overallScore": [
        59
      ],
      "callType": [
        59
      ],
      "redFlagRecordedLine": [
        59
      ],
      "redFlagMarketplace": [
        59
      ],
      "redFlagAor": [
        59
      ],
      "redFlagCommission": [
        59
      ],
      "redFlagHealthSherpa": [
        59
      ],
      "redFlagAgentCoaching": [
        59
      ],
      "redFlagDncViolation": [
        59
      ],
      "hasRedFlag": [
        59
      ],
      "openingScore": [
        59
      ],
      "factFindingScore": [
        59
      ],
      "eligibilityScore": [
        59
      ],
      "presentationScore": [
        59
      ],
      "applicationScore": [
        59
      ],
      "closingScore": [
        59
      ],
      "scoreDetails": [
        105
      ],
      "redFlagDetails": [
        105
      ],
      "transcript": [
        105
      ],
      "recommendations": [
        105
      ],
      "analyzedAt": [
        110
      ],
      "id": [
        59
      ],
      "createdAt": [
        110
      ],
      "updatedAt": [
        110
      ],
      "deletedAt": [
        110
      ],
      "createdBy": [
        87
      ],
      "updatedBy": [
        87
      ],
      "position": [
        59
      ],
      "searchVector": [
        59
      ],
      "overallResult": [
        59
      ],
      "status": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardOrderByWithGroupByAggregateInput": {
      "totalCount": [
        59
      ],
      "countUniqueValuesName": [
        59
      ],
      "countEmptyName": [
        59
      ],
      "countNotEmptyName": [
        59
      ],
      "percentageEmptyName": [
        59
      ],
      "percentageNotEmptyName": [
        59
      ],
      "countUniqueValuesOverallScore": [
        59
      ],
      "countEmptyOverallScore": [
        59
      ],
      "countNotEmptyOverallScore": [
        59
      ],
      "percentageEmptyOverallScore": [
        59
      ],
      "percentageNotEmptyOverallScore": [
        59
      ],
      "minOverallScore": [
        59
      ],
      "maxOverallScore": [
        59
      ],
      "avgOverallScore": [
        59
      ],
      "sumOverallScore": [
        59
      ],
      "countUniqueValuesCallType": [
        59
      ],
      "countEmptyCallType": [
        59
      ],
      "countNotEmptyCallType": [
        59
      ],
      "percentageEmptyCallType": [
        59
      ],
      "percentageNotEmptyCallType": [
        59
      ],
      "countUniqueValuesRedFlagRecordedLine": [
        59
      ],
      "countEmptyRedFlagRecordedLine": [
        59
      ],
      "countNotEmptyRedFlagRecordedLine": [
        59
      ],
      "percentageEmptyRedFlagRecordedLine": [
        59
      ],
      "percentageNotEmptyRedFlagRecordedLine": [
        59
      ],
      "countTrueRedFlagRecordedLine": [
        59
      ],
      "countFalseRedFlagRecordedLine": [
        59
      ],
      "countUniqueValuesRedFlagMarketplace": [
        59
      ],
      "countEmptyRedFlagMarketplace": [
        59
      ],
      "countNotEmptyRedFlagMarketplace": [
        59
      ],
      "percentageEmptyRedFlagMarketplace": [
        59
      ],
      "percentageNotEmptyRedFlagMarketplace": [
        59
      ],
      "countTrueRedFlagMarketplace": [
        59
      ],
      "countFalseRedFlagMarketplace": [
        59
      ],
      "countUniqueValuesRedFlagAor": [
        59
      ],
      "countEmptyRedFlagAor": [
        59
      ],
      "countNotEmptyRedFlagAor": [
        59
      ],
      "percentageEmptyRedFlagAor": [
        59
      ],
      "percentageNotEmptyRedFlagAor": [
        59
      ],
      "countTrueRedFlagAor": [
        59
      ],
      "countFalseRedFlagAor": [
        59
      ],
      "countUniqueValuesRedFlagCommission": [
        59
      ],
      "countEmptyRedFlagCommission": [
        59
      ],
      "countNotEmptyRedFlagCommission": [
        59
      ],
      "percentageEmptyRedFlagCommission": [
        59
      ],
      "percentageNotEmptyRedFlagCommission": [
        59
      ],
      "countTrueRedFlagCommission": [
        59
      ],
      "countFalseRedFlagCommission": [
        59
      ],
      "countUniqueValuesRedFlagHealthSherpa": [
        59
      ],
      "countEmptyRedFlagHealthSherpa": [
        59
      ],
      "countNotEmptyRedFlagHealthSherpa": [
        59
      ],
      "percentageEmptyRedFlagHealthSherpa": [
        59
      ],
      "percentageNotEmptyRedFlagHealthSherpa": [
        59
      ],
      "countTrueRedFlagHealthSherpa": [
        59
      ],
      "countFalseRedFlagHealthSherpa": [
        59
      ],
      "countUniqueValuesRedFlagAgentCoaching": [
        59
      ],
      "countEmptyRedFlagAgentCoaching": [
        59
      ],
      "countNotEmptyRedFlagAgentCoaching": [
        59
      ],
      "percentageEmptyRedFlagAgentCoaching": [
        59
      ],
      "percentageNotEmptyRedFlagAgentCoaching": [
        59
      ],
      "countTrueRedFlagAgentCoaching": [
        59
      ],
      "countFalseRedFlagAgentCoaching": [
        59
      ],
      "countUniqueValuesRedFlagDncViolation": [
        59
      ],
      "countEmptyRedFlagDncViolation": [
        59
      ],
      "countNotEmptyRedFlagDncViolation": [
        59
      ],
      "percentageEmptyRedFlagDncViolation": [
        59
      ],
      "percentageNotEmptyRedFlagDncViolation": [
        59
      ],
      "countTrueRedFlagDncViolation": [
        59
      ],
      "countFalseRedFlagDncViolation": [
        59
      ],
      "countUniqueValuesHasRedFlag": [
        59
      ],
      "countEmptyHasRedFlag": [
        59
      ],
      "countNotEmptyHasRedFlag": [
        59
      ],
      "percentageEmptyHasRedFlag": [
        59
      ],
      "percentageNotEmptyHasRedFlag": [
        59
      ],
      "countTrueHasRedFlag": [
        59
      ],
      "countFalseHasRedFlag": [
        59
      ],
      "countUniqueValuesOpeningScore": [
        59
      ],
      "countEmptyOpeningScore": [
        59
      ],
      "countNotEmptyOpeningScore": [
        59
      ],
      "percentageEmptyOpeningScore": [
        59
      ],
      "percentageNotEmptyOpeningScore": [
        59
      ],
      "minOpeningScore": [
        59
      ],
      "maxOpeningScore": [
        59
      ],
      "avgOpeningScore": [
        59
      ],
      "sumOpeningScore": [
        59
      ],
      "countUniqueValuesFactFindingScore": [
        59
      ],
      "countEmptyFactFindingScore": [
        59
      ],
      "countNotEmptyFactFindingScore": [
        59
      ],
      "percentageEmptyFactFindingScore": [
        59
      ],
      "percentageNotEmptyFactFindingScore": [
        59
      ],
      "minFactFindingScore": [
        59
      ],
      "maxFactFindingScore": [
        59
      ],
      "avgFactFindingScore": [
        59
      ],
      "sumFactFindingScore": [
        59
      ],
      "countUniqueValuesEligibilityScore": [
        59
      ],
      "countEmptyEligibilityScore": [
        59
      ],
      "countNotEmptyEligibilityScore": [
        59
      ],
      "percentageEmptyEligibilityScore": [
        59
      ],
      "percentageNotEmptyEligibilityScore": [
        59
      ],
      "minEligibilityScore": [
        59
      ],
      "maxEligibilityScore": [
        59
      ],
      "avgEligibilityScore": [
        59
      ],
      "sumEligibilityScore": [
        59
      ],
      "countUniqueValuesPresentationScore": [
        59
      ],
      "countEmptyPresentationScore": [
        59
      ],
      "countNotEmptyPresentationScore": [
        59
      ],
      "percentageEmptyPresentationScore": [
        59
      ],
      "percentageNotEmptyPresentationScore": [
        59
      ],
      "minPresentationScore": [
        59
      ],
      "maxPresentationScore": [
        59
      ],
      "avgPresentationScore": [
        59
      ],
      "sumPresentationScore": [
        59
      ],
      "countUniqueValuesApplicationScore": [
        59
      ],
      "countEmptyApplicationScore": [
        59
      ],
      "countNotEmptyApplicationScore": [
        59
      ],
      "percentageEmptyApplicationScore": [
        59
      ],
      "percentageNotEmptyApplicationScore": [
        59
      ],
      "minApplicationScore": [
        59
      ],
      "maxApplicationScore": [
        59
      ],
      "avgApplicationScore": [
        59
      ],
      "sumApplicationScore": [
        59
      ],
      "countUniqueValuesClosingScore": [
        59
      ],
      "countEmptyClosingScore": [
        59
      ],
      "countNotEmptyClosingScore": [
        59
      ],
      "percentageEmptyClosingScore": [
        59
      ],
      "percentageNotEmptyClosingScore": [
        59
      ],
      "minClosingScore": [
        59
      ],
      "maxClosingScore": [
        59
      ],
      "avgClosingScore": [
        59
      ],
      "sumClosingScore": [
        59
      ],
      "countUniqueValuesScoreDetails": [
        59
      ],
      "countEmptyScoreDetails": [
        59
      ],
      "countNotEmptyScoreDetails": [
        59
      ],
      "percentageEmptyScoreDetails": [
        59
      ],
      "percentageNotEmptyScoreDetails": [
        59
      ],
      "countUniqueValuesRedFlagDetails": [
        59
      ],
      "countEmptyRedFlagDetails": [
        59
      ],
      "countNotEmptyRedFlagDetails": [
        59
      ],
      "percentageEmptyRedFlagDetails": [
        59
      ],
      "percentageNotEmptyRedFlagDetails": [
        59
      ],
      "countUniqueValuesTranscript": [
        59
      ],
      "countEmptyTranscript": [
        59
      ],
      "countNotEmptyTranscript": [
        59
      ],
      "percentageEmptyTranscript": [
        59
      ],
      "percentageNotEmptyTranscript": [
        59
      ],
      "countUniqueValuesRecommendations": [
        59
      ],
      "countEmptyRecommendations": [
        59
      ],
      "countNotEmptyRecommendations": [
        59
      ],
      "percentageEmptyRecommendations": [
        59
      ],
      "percentageNotEmptyRecommendations": [
        59
      ],
      "countUniqueValuesAnalyzedAt": [
        59
      ],
      "countEmptyAnalyzedAt": [
        59
      ],
      "countNotEmptyAnalyzedAt": [
        59
      ],
      "percentageEmptyAnalyzedAt": [
        59
      ],
      "percentageNotEmptyAnalyzedAt": [
        59
      ],
      "minAnalyzedAt": [
        59
      ],
      "maxAnalyzedAt": [
        59
      ],
      "countUniqueValuesId": [
        59
      ],
      "countEmptyId": [
        59
      ],
      "countNotEmptyId": [
        59
      ],
      "percentageEmptyId": [
        59
      ],
      "percentageNotEmptyId": [
        59
      ],
      "countUniqueValuesCreatedAt": [
        59
      ],
      "countEmptyCreatedAt": [
        59
      ],
      "countNotEmptyCreatedAt": [
        59
      ],
      "percentageEmptyCreatedAt": [
        59
      ],
      "percentageNotEmptyCreatedAt": [
        59
      ],
      "minCreatedAt": [
        59
      ],
      "maxCreatedAt": [
        59
      ],
      "countUniqueValuesUpdatedAt": [
        59
      ],
      "countEmptyUpdatedAt": [
        59
      ],
      "countNotEmptyUpdatedAt": [
        59
      ],
      "percentageEmptyUpdatedAt": [
        59
      ],
      "percentageNotEmptyUpdatedAt": [
        59
      ],
      "minUpdatedAt": [
        59
      ],
      "maxUpdatedAt": [
        59
      ],
      "countUniqueValuesDeletedAt": [
        59
      ],
      "countEmptyDeletedAt": [
        59
      ],
      "countNotEmptyDeletedAt": [
        59
      ],
      "percentageEmptyDeletedAt": [
        59
      ],
      "percentageNotEmptyDeletedAt": [
        59
      ],
      "minDeletedAt": [
        59
      ],
      "maxDeletedAt": [
        59
      ],
      "countUniqueValuesCreatedBy": [
        59
      ],
      "countEmptyCreatedBy": [
        59
      ],
      "countNotEmptyCreatedBy": [
        59
      ],
      "percentageEmptyCreatedBy": [
        59
      ],
      "percentageNotEmptyCreatedBy": [
        59
      ],
      "countUniqueValuesUpdatedBy": [
        59
      ],
      "countEmptyUpdatedBy": [
        59
      ],
      "countNotEmptyUpdatedBy": [
        59
      ],
      "percentageEmptyUpdatedBy": [
        59
      ],
      "percentageNotEmptyUpdatedBy": [
        59
      ],
      "countUniqueValuesPosition": [
        59
      ],
      "countEmptyPosition": [
        59
      ],
      "countNotEmptyPosition": [
        59
      ],
      "percentageEmptyPosition": [
        59
      ],
      "percentageNotEmptyPosition": [
        59
      ],
      "countUniqueValuesSearchVector": [
        59
      ],
      "countEmptySearchVector": [
        59
      ],
      "countNotEmptySearchVector": [
        59
      ],
      "percentageEmptySearchVector": [
        59
      ],
      "percentageNotEmptySearchVector": [
        59
      ],
      "countUniqueValuesOverallResult": [
        59
      ],
      "countEmptyOverallResult": [
        59
      ],
      "countNotEmptyOverallResult": [
        59
      ],
      "percentageEmptyOverallResult": [
        59
      ],
      "percentageNotEmptyOverallResult": [
        59
      ],
      "countUniqueValuesStatus": [
        59
      ],
      "countEmptyStatus": [
        59
      ],
      "countNotEmptyStatus": [
        59
      ],
      "percentageEmptyStatus": [
        59
      ],
      "percentageNotEmptyStatus": [
        59
      ],
      "__typename": [
        1
      ]
    },
    "QaScorecardGroupByInput": {
      "name": [
        6
      ],
      "overallScore": [
        6
      ],
      "callType": [
        6
      ],
      "redFlagRecordedLine": [
        6
      ],
      "redFlagMarketplace": [
        6
      ],
      "redFlagAor": [
        6
      ],
      "redFlagCommission": [
        6
      ],
      "redFlagHealthSherpa": [
        6
      ],
      "redFlagAgentCoaching": [
        6
      ],
      "redFlagDncViolation": [
        6
      ],
      "hasRedFlag": [
        6
      ],
      "openingScore": [
        6
      ],
      "factFindingScore": [
        6
      ],
      "eligibilityScore": [
        6
      ],
      "presentationScore": [
        6
      ],
      "applicationScore": [
        6
      ],
      "closingScore": [
        6
      ],
      "scoreDetails": [
        106
      ],
      "redFlagDetails": [
        106
      ],
      "transcript": [
        106
      ],
      "recommendations": [
        106
      ],
      "analyzedAt": [
        109
      ],
      "id": [
        6
      ],
      "createdAt": [
        109
      ],
      "updatedAt": [
        109
      ],
      "deletedAt": [
        109
      ],
      "createdBy": [
        88
      ],
      "updatedBy": [
        88
      ],
      "position": [
        6
      ],
      "searchVector": [
        6
      ],
      "overallResult": [
        6
      ],
      "status": [
        6
      ],
      "__typename": [
        1
      ]
    }
  }
};

// node_modules/twenty-sdk/generated/core/index.ts
var typeMap = linkTypeMap(types_default);
var createClient2 = function(options) {
  return createClient({
    url: void 0,
    ...options,
    queryRoot: typeMap.Query,
    mutationRoot: typeMap.Mutation,
    subscriptionRoot: typeMap.Subscription
  });
};
var APP_ACCESS_TOKEN_ENV_KEY = "TWENTY_APP_ACCESS_TOKEN";
var API_KEY_ENV_KEY = "TWENTY_API_KEY";
var getProcessEnvironment = () => {
  const processObject = globalThis.process;
  return processObject?.env ?? {};
};
var getTokenFromAuthorizationHeader = (authorizationHeader) => {
  if (typeof authorizationHeader !== "string") {
    return null;
  }
  const trimmedAuthorizationHeader = authorizationHeader.trim();
  if (trimmedAuthorizationHeader.length === 0) {
    return null;
  }
  if (trimmedAuthorizationHeader === "Bearer") {
    return null;
  }
  if (trimmedAuthorizationHeader.startsWith("Bearer ")) {
    return trimmedAuthorizationHeader.slice("Bearer ".length).trim();
  }
  return trimmedAuthorizationHeader;
};
var getTokenFromHeaders = (headers) => {
  if (!headers) {
    return null;
  }
  if (headers instanceof Headers) {
    return getTokenFromAuthorizationHeader(
      headers.get("Authorization") ?? void 0
    );
  }
  if (Array.isArray(headers)) {
    const matchedAuthorizationHeader = headers.find(
      ([headerName]) => headerName.toLowerCase() === "authorization"
    );
    return getTokenFromAuthorizationHeader(matchedAuthorizationHeader?.[1]);
  }
  const headersRecord = headers;
  return getTokenFromAuthorizationHeader(
    headersRecord.Authorization ?? headersRecord.authorization
  );
};
var hasAuthenticationErrorInGraphqlPayload = (payload) => {
  if (!payload?.errors) {
    return false;
  }
  return payload.errors.some((graphqlError) => {
    return graphqlError.extensions?.code === "UNAUTHENTICATED" || graphqlError.message?.toLowerCase() === "unauthorized";
  });
};
var defaultOptions = {
  url: `${process.env.TWENTY_API_URL}/graphql`,
  headers: {
    "Content-Type": "application/json"
  }
};
var CoreApiClient = class {
  constructor(options) {
    this.refreshAccessTokenPromise = null;
    const merged = {
      ...defaultOptions,
      ...options
    };
    const {
      url,
      headers,
      fetch: customFetchImplementation,
      fetcher: _fetcher,
      batch: _batch,
      ...requestOptions
    } = merged;
    this.url = url ?? "";
    this.requestOptions = requestOptions;
    this.headers = headers ?? {};
    this.fetchImplementation = customFetchImplementation ?? globalThis.fetch ?? null;
    const processEnvironment = getProcessEnvironment();
    const tokenFromHeaders = getTokenFromHeaders(
      typeof headers === "function" ? void 0 : headers
    );
    this.authorizationToken = tokenFromHeaders ?? processEnvironment[APP_ACCESS_TOKEN_ENV_KEY] ?? processEnvironment[API_KEY_ENV_KEY] ?? null;
    this.client = createClient2({
      ...merged,
      headers: void 0,
      fetcher: async (operation) => this.executeGraphqlRequestWithOptionalRefresh({
        operation
      })
    });
  }
  query(request) {
    return this.client.query(request);
  }
  mutation(request) {
    return this.client.mutation(request);
  }
  async uploadFile(fileBuffer, filename, contentType = "application/octet-stream", fieldMetadataUniversalIdentifier) {
    const form = new FormData();
    form.append(
      "operations",
      JSON.stringify({
        query: `mutation UploadFilesFieldFileByUniversalIdentifier($file: Upload!, $fieldMetadataUniversalIdentifier: String!) {
        uploadFilesFieldFileByUniversalIdentifier(file: $file, fieldMetadataUniversalIdentifier: $fieldMetadataUniversalIdentifier) { id path size createdAt url }
      }`,
        variables: {
          file: null,
          fieldMetadataUniversalIdentifier
        }
      })
    );
    form.append("map", JSON.stringify({ "0": ["variables.file"] }));
    form.append(
      "0",
      new Blob([fileBuffer], { type: contentType }),
      filename
    );
    const result = await this.executeGraphqlRequestWithOptionalRefresh({
      operation: form,
      headers: {},
      requestInit: {
        method: "POST"
      }
    });
    if (result.errors) {
      throw new GenqlError(result.errors, result.data);
    }
    const data = result.data;
    return data.uploadFilesFieldFileByUniversalIdentifier;
  }
  async executeGraphqlRequestWithOptionalRefresh({
    operation,
    headers,
    requestInit
  }) {
    const firstResponse = await this.executeGraphqlRequest({
      operation,
      headers,
      requestInit,
      token: this.authorizationToken
    });
    if (this.shouldRefreshToken(firstResponse)) {
      const refreshedAccessToken = await this.requestRefreshedAccessToken();
      if (refreshedAccessToken) {
        const retryResponse = await this.executeGraphqlRequest({
          operation,
          headers,
          requestInit,
          token: refreshedAccessToken
        });
        return this.assertResponseIsSuccessful(retryResponse);
      }
    }
    return this.assertResponseIsSuccessful(firstResponse);
  }
  async executeGraphqlRequest({
    operation,
    headers,
    requestInit,
    token
  }) {
    if (!this.fetchImplementation) {
      throw new Error(
        "Global `fetch` function is not available, pass a fetch implementation to the Twenty client"
      );
    }
    const resolvedHeaders = await this.resolveHeaders();
    const requestHeaders = new Headers(resolvedHeaders);
    if (headers) {
      new Headers(headers).forEach(
        (value, key) => requestHeaders.set(key, value)
      );
    }
    if (operation instanceof FormData) {
      requestHeaders.delete("Content-Type");
    } else {
      requestHeaders.set("Content-Type", "application/json");
    }
    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    } else {
      requestHeaders.delete("Authorization");
    }
    const response = await this.fetchImplementation.call(globalThis, this.url, {
      ...this.requestOptions,
      ...requestInit,
      method: requestInit?.method ?? "POST",
      headers: requestHeaders,
      body: operation instanceof FormData ? operation : JSON.stringify(operation)
    });
    const rawBody = await response.text();
    let payload = null;
    if (rawBody.trim().length > 0) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = null;
      }
    }
    return {
      status: response.status,
      statusText: response.statusText,
      payload,
      rawBody
    };
  }
  async resolveHeaders() {
    if (typeof this.headers === "function") {
      return await this.headers() ?? {};
    }
    return this.headers ?? {};
  }
  shouldRefreshToken(response) {
    if (response.status === 401) {
      return true;
    }
    return hasAuthenticationErrorInGraphqlPayload(response.payload);
  }
  assertResponseIsSuccessful(response) {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${response.statusText}: ${response.rawBody}`);
    }
    if (response.payload === null) {
      throw new Error("Invalid JSON response");
    }
    return response.payload;
  }
  async requestRefreshedAccessToken() {
    const refreshAccessTokenFunction = globalThis.frontComponentHostCommunicationApi?.requestAccessTokenRefresh;
    if (typeof refreshAccessTokenFunction !== "function") {
      return null;
    }
    if (!this.refreshAccessTokenPromise) {
      this.refreshAccessTokenPromise = refreshAccessTokenFunction().then((refreshedAccessToken) => {
        if (typeof refreshedAccessToken !== "string" || refreshedAccessToken.length === 0) {
          return null;
        }
        this.setAuthorizationToken(refreshedAccessToken);
        return refreshedAccessToken;
      }).catch((refreshError) => {
        console.error("Twenty client: token refresh failed", refreshError);
        return null;
      }).finally(() => {
        this.refreshAccessTokenPromise = null;
      });
    }
    return this.refreshAccessTokenPromise;
  }
  setAuthorizationToken(token) {
    this.authorizationToken = token;
    const processEnvironment = getProcessEnvironment();
    processEnvironment[APP_ACCESS_TOKEN_ENV_KEY] = token;
  }
};

// node_modules/twenty-sdk/generated/metadata/runtime/linkTypeMap.ts
var linkTypeMap2 = (typeMap3) => {
  const indexToName = Object.assign(
    {},
    ...Object.keys(typeMap3.types).map((k, i) => ({ [i]: k }))
  );
  let intermediaryTypeMap = Object.assign(
    {},
    ...Object.keys(typeMap3.types || {}).map(
      (k) => {
        const type = typeMap3.types[k];
        const fields = type || {};
        return {
          [k]: {
            name: k,
            // type scalar properties
            scalar: Object.keys(fields).filter((f) => {
              const [type2] = fields[f] || [];
              return type2 && typeMap3.scalars.includes(type2);
            }),
            // fields with corresponding `type` and `args`
            fields: Object.assign(
              {},
              ...Object.keys(fields).map(
                (f) => {
                  const [typeIndex, args] = fields[f] || [];
                  if (typeIndex == null) {
                    return {};
                  }
                  return {
                    [f]: {
                      // replace index with type name
                      type: indexToName[typeIndex],
                      args: Object.assign(
                        {},
                        ...Object.keys(args || {}).map(
                          (k2) => {
                            if (!args || !args[k2]) {
                              return;
                            }
                            const [
                              argTypeName,
                              argTypeString
                            ] = args[k2];
                            return {
                              [k2]: [
                                indexToName[argTypeName],
                                argTypeString || indexToName[argTypeName]
                              ]
                            };
                          }
                        )
                      )
                    }
                  };
                }
              )
            )
          }
        };
      }
    )
  );
  const res = resolveConcreteTypes2(intermediaryTypeMap);
  return res;
};
var resolveConcreteTypes2 = (linkedTypeMap) => {
  Object.keys(linkedTypeMap).forEach((typeNameFromKey) => {
    const type = linkedTypeMap[typeNameFromKey];
    if (!type.fields) {
      return;
    }
    const fields = type.fields;
    Object.keys(fields).forEach((f) => {
      const field = fields[f];
      if (field.args) {
        const args = field.args;
        Object.keys(args).forEach((key) => {
          const arg = args[key];
          if (arg) {
            const [typeName2] = arg;
            if (typeof typeName2 === "string") {
              if (!linkedTypeMap[typeName2]) {
                linkedTypeMap[typeName2] = { name: typeName2 };
              }
              arg[0] = linkedTypeMap[typeName2];
            }
          }
        });
      }
      const typeName = field.type;
      if (typeof typeName === "string") {
        if (!linkedTypeMap[typeName]) {
          linkedTypeMap[typeName] = { name: typeName };
        }
        field.type = linkedTypeMap[typeName];
      }
    });
  });
  return linkedTypeMap;
};

// node_modules/twenty-sdk/generated/metadata/types.ts
var types_default2 = {
  "scalars": [
    1,
    3,
    4,
    6,
    10,
    11,
    13,
    14,
    16,
    18,
    21,
    22,
    23,
    33,
    36,
    38,
    49,
    51,
    53,
    56,
    59,
    60,
    61,
    62,
    63,
    65,
    68,
    69,
    75,
    78,
    83,
    86,
    87,
    89,
    93,
    94,
    111,
    114,
    116,
    125,
    126,
    127,
    129,
    137,
    151,
    152,
    157,
    161,
    180,
    213,
    221,
    240,
    241,
    246,
    249,
    255,
    256,
    258,
    263,
    268,
    269,
    281,
    296,
    297,
    320,
    327,
    328,
    329,
    331,
    340,
    399,
    457,
    458,
    460
  ],
  "types": {
    "BillingProductDTO": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "images": [
        1
      ],
      "metadata": [
        124
      ],
      "on_BillingLicensedProduct": [
        133
      ],
      "on_BillingMeteredProduct": [
        134
      ],
      "__typename": [
        1
      ]
    },
    "String": {},
    "ApiKey": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "expiresAt": [
        4
      ],
      "revokedAt": [
        4
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "role": [
        28
      ],
      "__typename": [
        1
      ]
    },
    "UUID": {},
    "DateTime": {},
    "ApplicationRegistrationVariable": {
      "id": [
        3
      ],
      "key": [
        1
      ],
      "description": [
        1
      ],
      "isSecret": [
        6
      ],
      "isRequired": [
        6
      ],
      "isFilled": [
        6
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "Boolean": {},
    "ApplicationRegistration": {
      "id": [
        3
      ],
      "universalIdentifier": [
        1
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "logoUrl": [
        1
      ],
      "author": [
        1
      ],
      "oAuthClientId": [
        1
      ],
      "oAuthRedirectUris": [
        1
      ],
      "oAuthScopes": [
        1
      ],
      "websiteUrl": [
        1
      ],
      "termsUrl": [
        1
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "TwoFactorAuthenticationMethodSummary": {
      "twoFactorAuthenticationMethodId": [
        3
      ],
      "status": [
        1
      ],
      "strategy": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "RowLevelPermissionPredicateGroup": {
      "id": [
        1
      ],
      "parentRowLevelPermissionPredicateGroupId": [
        1
      ],
      "logicalOperator": [
        11
      ],
      "positionInRowLevelPermissionPredicateGroup": [
        10
      ],
      "roleId": [
        1
      ],
      "objectMetadataId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "Float": {},
    "RowLevelPermissionPredicateGroupLogicalOperator": {},
    "RowLevelPermissionPredicate": {
      "id": [
        1
      ],
      "fieldMetadataId": [
        1
      ],
      "objectMetadataId": [
        1
      ],
      "operand": [
        13
      ],
      "subFieldName": [
        1
      ],
      "workspaceMemberFieldMetadataId": [
        1
      ],
      "workspaceMemberSubFieldName": [
        1
      ],
      "rowLevelPermissionPredicateGroupId": [
        1
      ],
      "positionInRowLevelPermissionPredicateGroup": [
        10
      ],
      "roleId": [
        1
      ],
      "value": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "RowLevelPermissionPredicateOperand": {},
    "JSON": {},
    "ObjectPermission": {
      "objectMetadataId": [
        3
      ],
      "canReadObjectRecords": [
        6
      ],
      "canUpdateObjectRecords": [
        6
      ],
      "canSoftDeleteObjectRecords": [
        6
      ],
      "canDestroyObjectRecords": [
        6
      ],
      "showInSidebar": [
        6
      ],
      "editWindowMinutes": [
        16
      ],
      "restrictedFields": [
        14
      ],
      "rowLevelPermissionPredicates": [
        12
      ],
      "rowLevelPermissionPredicateGroups": [
        9
      ],
      "__typename": [
        1
      ]
    },
    "Int": {},
    "UserWorkspace": {
      "id": [
        3
      ],
      "user": [
        67
      ],
      "userId": [
        3
      ],
      "locale": [
        1
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "permissionFlags": [
        18
      ],
      "objectPermissions": [
        15
      ],
      "objectsPermissions": [
        15
      ],
      "twoFactorAuthenticationMethodSummary": [
        8
      ],
      "__typename": [
        1
      ]
    },
    "PermissionFlagType": {},
    "FullName": {
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMember": {
      "id": [
        3
      ],
      "name": [
        19
      ],
      "userEmail": [
        1
      ],
      "colorScheme": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "locale": [
        1
      ],
      "calendarStartDay": [
        16
      ],
      "timeZone": [
        1
      ],
      "dateFormat": [
        21
      ],
      "timeFormat": [
        22
      ],
      "roles": [
        28
      ],
      "userWorkspaceId": [
        3
      ],
      "numberFormat": [
        23
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMemberDateFormatEnum": {},
    "WorkspaceMemberTimeFormatEnum": {},
    "WorkspaceMemberNumberFormatEnum": {},
    "Agent": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "description": [
        1
      ],
      "prompt": [
        1
      ],
      "modelId": [
        1
      ],
      "responseFormat": [
        14
      ],
      "roleId": [
        3
      ],
      "isCustom": [
        6
      ],
      "applicationId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "modelConfiguration": [
        14
      ],
      "evaluationInputs": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "FieldPermission": {
      "id": [
        3
      ],
      "objectMetadataId": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "roleId": [
        3
      ],
      "canReadFieldValue": [
        6
      ],
      "canUpdateFieldValue": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "PermissionFlag": {
      "id": [
        3
      ],
      "roleId": [
        3
      ],
      "flag": [
        18
      ],
      "__typename": [
        1
      ]
    },
    "ApiKeyForRole": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "expiresAt": [
        4
      ],
      "revokedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "Role": {
      "id": [
        3
      ],
      "universalIdentifier": [
        3
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "isEditable": [
        6
      ],
      "canBeAssignedToUsers": [
        6
      ],
      "canBeAssignedToAgents": [
        6
      ],
      "canBeAssignedToApiKeys": [
        6
      ],
      "workspaceMembers": [
        20
      ],
      "agents": [
        24
      ],
      "apiKeys": [
        27
      ],
      "canUpdateAllSettings": [
        6
      ],
      "canAccessAllTools": [
        6
      ],
      "canReadAllObjectRecords": [
        6
      ],
      "canUpdateAllObjectRecords": [
        6
      ],
      "canSoftDeleteAllObjectRecords": [
        6
      ],
      "canDestroyAllObjectRecords": [
        6
      ],
      "showAllObjectsInSidebar": [
        6
      ],
      "editWindowMinutes": [
        16
      ],
      "permissionFlags": [
        26
      ],
      "objectPermissions": [
        15
      ],
      "fieldPermissions": [
        25
      ],
      "rowLevelPermissionPredicates": [
        12
      ],
      "rowLevelPermissionPredicateGroups": [
        9
      ],
      "__typename": [
        1
      ]
    },
    "ApplicationVariable": {
      "id": [
        3
      ],
      "key": [
        1
      ],
      "value": [
        1
      ],
      "description": [
        1
      ],
      "isSecret": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "LogicFunction": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "runtime": [
        1
      ],
      "timeoutSeconds": [
        10
      ],
      "sourceHandlerPath": [
        1
      ],
      "handlerName": [
        1
      ],
      "toolInputSchema": [
        14
      ],
      "isTool": [
        6
      ],
      "cronTriggerSettings": [
        14
      ],
      "databaseEventTriggerSettings": [
        14
      ],
      "httpRouteTriggerSettings": [
        14
      ],
      "applicationId": [
        3
      ],
      "universalIdentifier": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "StandardOverrides": {
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "translations": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "Field": {
      "id": [
        3
      ],
      "universalIdentifier": [
        3
      ],
      "type": [
        33
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "standardOverrides": [
        31
      ],
      "isCustom": [
        6
      ],
      "isActive": [
        6
      ],
      "isSystem": [
        6
      ],
      "isUIReadOnly": [
        6
      ],
      "isNullable": [
        6
      ],
      "isUnique": [
        6
      ],
      "defaultValue": [
        14
      ],
      "options": [
        14
      ],
      "settings": [
        14
      ],
      "isLabelSyncedWithName": [
        6
      ],
      "morphId": [
        3
      ],
      "relationTargetObjectMetadataId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "applicationId": [
        3
      ],
      "relation": [
        179
      ],
      "morphRelations": [
        179
      ],
      "object": [
        44
      ],
      "__typename": [
        1
      ]
    },
    "FieldMetadataType": {},
    "IndexField": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "order": [
        10
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "Index": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "isCustom": [
        6
      ],
      "isUnique": [
        6
      ],
      "indexWhereClause": [
        1
      ],
      "indexType": [
        36
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "indexFieldMetadataList": [
        34
      ],
      "objectMetadata": [
        172,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            39,
            "ObjectFilter!"
          ]
        }
      ],
      "indexFieldMetadatas": [
        170,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            42,
            "IndexFieldFilter!"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "IndexType": {},
    "CursorPaging": {
      "before": [
        38
      ],
      "after": [
        38
      ],
      "first": [
        16
      ],
      "last": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "ConnectionCursor": {},
    "ObjectFilter": {
      "and": [
        39
      ],
      "or": [
        39
      ],
      "id": [
        40
      ],
      "universalIdentifier": [
        40
      ],
      "isCustom": [
        41
      ],
      "isRemote": [
        41
      ],
      "isActive": [
        41
      ],
      "isSystem": [
        41
      ],
      "isUIReadOnly": [
        41
      ],
      "isSearchable": [
        41
      ],
      "__typename": [
        1
      ]
    },
    "UUIDFilterComparison": {
      "is": [
        6
      ],
      "isNot": [
        6
      ],
      "eq": [
        3
      ],
      "neq": [
        3
      ],
      "gt": [
        3
      ],
      "gte": [
        3
      ],
      "lt": [
        3
      ],
      "lte": [
        3
      ],
      "like": [
        3
      ],
      "notLike": [
        3
      ],
      "iLike": [
        3
      ],
      "notILike": [
        3
      ],
      "in": [
        3
      ],
      "notIn": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "BooleanFieldComparison": {
      "is": [
        6
      ],
      "isNot": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "IndexFieldFilter": {
      "and": [
        42
      ],
      "or": [
        42
      ],
      "id": [
        40
      ],
      "fieldMetadataId": [
        40
      ],
      "__typename": [
        1
      ]
    },
    "ObjectStandardOverrides": {
      "labelSingular": [
        1
      ],
      "labelPlural": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "translations": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "Object": {
      "id": [
        3
      ],
      "universalIdentifier": [
        3
      ],
      "nameSingular": [
        1
      ],
      "namePlural": [
        1
      ],
      "labelSingular": [
        1
      ],
      "labelPlural": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "standardOverrides": [
        43
      ],
      "shortcut": [
        1
      ],
      "isCustom": [
        6
      ],
      "isRemote": [
        6
      ],
      "isActive": [
        6
      ],
      "isSystem": [
        6
      ],
      "isUIReadOnly": [
        6
      ],
      "isSearchable": [
        6
      ],
      "applicationId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "labelIdentifierFieldMetadataId": [
        3
      ],
      "imageIdentifierFieldMetadataId": [
        3
      ],
      "isLabelSyncedWithName": [
        6
      ],
      "duplicateCriteria": [
        1
      ],
      "fieldsList": [
        32
      ],
      "indexMetadataList": [
        35
      ],
      "fields": [
        177,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            45,
            "FieldFilter!"
          ]
        }
      ],
      "indexMetadatas": [
        175,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            46,
            "IndexFilter!"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "FieldFilter": {
      "and": [
        45
      ],
      "or": [
        45
      ],
      "id": [
        40
      ],
      "universalIdentifier": [
        40
      ],
      "isCustom": [
        41
      ],
      "isActive": [
        41
      ],
      "isSystem": [
        41
      ],
      "isUIReadOnly": [
        41
      ],
      "__typename": [
        1
      ]
    },
    "IndexFilter": {
      "and": [
        46
      ],
      "or": [
        46
      ],
      "id": [
        40
      ],
      "isCustom": [
        41
      ],
      "__typename": [
        1
      ]
    },
    "Application": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "version": [
        1
      ],
      "universalIdentifier": [
        1
      ],
      "packageJsonChecksum": [
        1
      ],
      "packageJsonFileId": [
        3
      ],
      "yarnLockChecksum": [
        1
      ],
      "yarnLockFileId": [
        3
      ],
      "availablePackages": [
        14
      ],
      "canBeUninstalled": [
        6
      ],
      "defaultRoleId": [
        1
      ],
      "settingsCustomTabFrontComponentId": [
        3
      ],
      "defaultLogicFunctionRole": [
        28
      ],
      "agents": [
        24
      ],
      "logicFunctions": [
        30
      ],
      "objects": [
        44
      ],
      "applicationVariables": [
        29
      ],
      "__typename": [
        1
      ]
    },
    "CoreViewField": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "isVisible": [
        6
      ],
      "size": [
        10
      ],
      "position": [
        10
      ],
      "aggregateOperation": [
        49
      ],
      "viewId": [
        3
      ],
      "viewFieldGroupId": [
        3
      ],
      "workspaceId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "AggregateOperations": {},
    "CoreViewFilterGroup": {
      "id": [
        3
      ],
      "parentViewFilterGroupId": [
        3
      ],
      "logicalOperator": [
        51
      ],
      "positionInViewFilterGroup": [
        10
      ],
      "viewId": [
        3
      ],
      "workspaceId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "ViewFilterGroupLogicalOperator": {},
    "CoreViewFilter": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "operand": [
        53
      ],
      "value": [
        14
      ],
      "viewFilterGroupId": [
        3
      ],
      "positionInViewFilterGroup": [
        10
      ],
      "subFieldName": [
        1
      ],
      "viewId": [
        3
      ],
      "workspaceId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "ViewFilterOperand": {},
    "CoreViewGroup": {
      "id": [
        3
      ],
      "isVisible": [
        6
      ],
      "fieldValue": [
        1
      ],
      "position": [
        10
      ],
      "viewId": [
        3
      ],
      "workspaceId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "CoreViewSort": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "direction": [
        56
      ],
      "viewId": [
        3
      ],
      "workspaceId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "ViewSortDirection": {},
    "CoreViewFieldGroup": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "position": [
        10
      ],
      "isVisible": [
        6
      ],
      "viewId": [
        3
      ],
      "workspaceId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "viewFields": [
        48
      ],
      "__typename": [
        1
      ]
    },
    "CoreView": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "objectMetadataId": [
        3
      ],
      "type": [
        59
      ],
      "key": [
        60
      ],
      "icon": [
        1
      ],
      "position": [
        10
      ],
      "isCompact": [
        6
      ],
      "isCustom": [
        6
      ],
      "openRecordIn": [
        61
      ],
      "kanbanAggregateOperation": [
        49
      ],
      "kanbanAggregateOperationFieldMetadataId": [
        3
      ],
      "mainGroupByFieldMetadataId": [
        3
      ],
      "shouldHideEmptyGroups": [
        6
      ],
      "calendarFieldMetadataId": [
        3
      ],
      "workspaceId": [
        3
      ],
      "anyFieldFilterValue": [
        1
      ],
      "calendarLayout": [
        62
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "viewFields": [
        48
      ],
      "viewFilters": [
        52
      ],
      "viewFilterGroups": [
        50
      ],
      "viewSorts": [
        55
      ],
      "viewGroups": [
        54
      ],
      "viewFieldGroups": [
        57
      ],
      "visibility": [
        63
      ],
      "createdByUserWorkspaceId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "ViewType": {},
    "ViewKey": {},
    "ViewOpenRecordIn": {},
    "ViewCalendarLayout": {},
    "ViewVisibility": {},
    "Workspace": {
      "id": [
        3
      ],
      "displayName": [
        1
      ],
      "logo": [
        1
      ],
      "logoFileId": [
        3
      ],
      "inviteHash": [
        1
      ],
      "deletedAt": [
        4
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "allowImpersonation": [
        6
      ],
      "isPublicInviteLinkEnabled": [
        6
      ],
      "trashRetentionDays": [
        10
      ],
      "eventLogRetentionDays": [
        10
      ],
      "workspaceMembersCount": [
        10
      ],
      "activationStatus": [
        65
      ],
      "views": [
        58
      ],
      "viewFields": [
        48
      ],
      "viewFilters": [
        52
      ],
      "viewFilterGroups": [
        50
      ],
      "viewGroups": [
        54
      ],
      "viewSorts": [
        55
      ],
      "metadataVersion": [
        10
      ],
      "databaseUrl": [
        1
      ],
      "databaseSchema": [
        1
      ],
      "subdomain": [
        1
      ],
      "customDomain": [
        1
      ],
      "isGoogleAuthEnabled": [
        6
      ],
      "isGoogleAuthBypassEnabled": [
        6
      ],
      "isTwoFactorAuthenticationEnforced": [
        6
      ],
      "isPasswordAuthEnabled": [
        6
      ],
      "isPasswordAuthBypassEnabled": [
        6
      ],
      "isMicrosoftAuthEnabled": [
        6
      ],
      "isMicrosoftAuthBypassEnabled": [
        6
      ],
      "isCustomDomainEnabled": [
        6
      ],
      "editableProfileFields": [
        1
      ],
      "defaultRole": [
        28
      ],
      "version": [
        1
      ],
      "fastModel": [
        1
      ],
      "smartModel": [
        1
      ],
      "aiAdditionalInstructions": [
        1
      ],
      "autoEnableNewAiModels": [
        6
      ],
      "disabledAiModelIds": [
        1
      ],
      "enabledAiModelIds": [
        1
      ],
      "useRecommendedModels": [
        6
      ],
      "routerModel": [
        1
      ],
      "workspaceCustomApplication": [
        47
      ],
      "featureFlags": [
        160
      ],
      "billingSubscriptions": [
        136
      ],
      "currentBillingSubscription": [
        136
      ],
      "billingEntitlements": [
        156
      ],
      "hasValidEnterpriseKey": [
        6
      ],
      "workspaceUrls": [
        149
      ],
      "workspaceCustomApplicationId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceActivationStatus": {},
    "AppToken": {
      "id": [
        3
      ],
      "type": [
        1
      ],
      "expiresAt": [
        4
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "User": {
      "id": [
        3
      ],
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "email": [
        1
      ],
      "defaultAvatarUrl": [
        1
      ],
      "isEmailVerified": [
        6
      ],
      "disabled": [
        6
      ],
      "canImpersonate": [
        6
      ],
      "canAccessFullAdminPanel": [
        6
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "locale": [
        1
      ],
      "workspaceMember": [
        20
      ],
      "userWorkspaces": [
        17
      ],
      "onboardingStatus": [
        68
      ],
      "currentWorkspace": [
        64
      ],
      "currentUserWorkspace": [
        17
      ],
      "userVars": [
        69
      ],
      "workspaceMembers": [
        20
      ],
      "deletedWorkspaceMembers": [
        155
      ],
      "hasPassword": [
        6
      ],
      "supportUserHash": [
        1
      ],
      "workspaces": [
        17
      ],
      "availableWorkspaces": [
        154
      ],
      "__typename": [
        1
      ]
    },
    "OnboardingStatus": {},
    "JSONObject": {},
    "RatioAggregateConfig": {
      "fieldMetadataId": [
        3
      ],
      "optionValue": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "NewFieldDefaultConfiguration": {
      "isVisible": [
        6
      ],
      "viewFieldGroupId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "RichTextV2Body": {
      "blocknote": [
        1
      ],
      "markdown": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "GridPosition": {
      "row": [
        10
      ],
      "column": [
        10
      ],
      "rowSpan": [
        10
      ],
      "columnSpan": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "PageLayoutWidget": {
      "id": [
        3
      ],
      "pageLayoutTabId": [
        3
      ],
      "title": [
        1
      ],
      "type": [
        75
      ],
      "objectMetadataId": [
        3
      ],
      "gridPosition": [
        73
      ],
      "position": [
        76
      ],
      "configuration": [
        81
      ],
      "conditionalDisplay": [
        14
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "WidgetType": {},
    "PageLayoutWidgetPosition": {
      "on_PageLayoutWidgetGridPosition": [
        77
      ],
      "on_PageLayoutWidgetVerticalListPosition": [
        79
      ],
      "on_PageLayoutWidgetCanvasPosition": [
        80
      ],
      "__typename": [
        1
      ]
    },
    "PageLayoutWidgetGridPosition": {
      "layoutMode": [
        78
      ],
      "row": [
        16
      ],
      "column": [
        16
      ],
      "rowSpan": [
        16
      ],
      "columnSpan": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "PageLayoutTabLayoutMode": {},
    "PageLayoutWidgetVerticalListPosition": {
      "layoutMode": [
        78
      ],
      "index": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "PageLayoutWidgetCanvasPosition": {
      "layoutMode": [
        78
      ],
      "__typename": [
        1
      ]
    },
    "WidgetConfiguration": {
      "on_AggregateChartConfiguration": [
        82
      ],
      "on_StandaloneRichTextConfiguration": [
        84
      ],
      "on_PieChartConfiguration": [
        85
      ],
      "on_LineChartConfiguration": [
        88
      ],
      "on_IframeConfiguration": [
        90
      ],
      "on_GaugeChartConfiguration": [
        91
      ],
      "on_BarChartConfiguration": [
        92
      ],
      "on_CalendarConfiguration": [
        95
      ],
      "on_FrontComponentConfiguration": [
        96
      ],
      "on_EmailsConfiguration": [
        97
      ],
      "on_FieldConfiguration": [
        98
      ],
      "on_FieldRichTextConfiguration": [
        99
      ],
      "on_FieldsConfiguration": [
        100
      ],
      "on_FilesConfiguration": [
        101
      ],
      "on_NotesConfiguration": [
        102
      ],
      "on_TasksConfiguration": [
        103
      ],
      "on_TimelineConfiguration": [
        104
      ],
      "on_ViewConfiguration": [
        105
      ],
      "on_WorkflowConfiguration": [
        106
      ],
      "on_WorkflowRunConfiguration": [
        107
      ],
      "on_WorkflowVersionConfiguration": [
        108
      ],
      "__typename": [
        1
      ]
    },
    "AggregateChartConfiguration": {
      "configurationType": [
        83
      ],
      "aggregateFieldMetadataId": [
        3
      ],
      "aggregateOperation": [
        49
      ],
      "label": [
        1
      ],
      "displayDataLabel": [
        6
      ],
      "format": [
        1
      ],
      "description": [
        1
      ],
      "filter": [
        14
      ],
      "timezone": [
        1
      ],
      "firstDayOfTheWeek": [
        16
      ],
      "prefix": [
        1
      ],
      "suffix": [
        1
      ],
      "ratioAggregateConfig": [
        70
      ],
      "__typename": [
        1
      ]
    },
    "WidgetConfigurationType": {},
    "StandaloneRichTextConfiguration": {
      "configurationType": [
        83
      ],
      "body": [
        72
      ],
      "__typename": [
        1
      ]
    },
    "PieChartConfiguration": {
      "configurationType": [
        83
      ],
      "aggregateFieldMetadataId": [
        3
      ],
      "aggregateOperation": [
        49
      ],
      "groupByFieldMetadataId": [
        3
      ],
      "groupBySubFieldName": [
        1
      ],
      "dateGranularity": [
        86
      ],
      "orderBy": [
        87
      ],
      "manualSortOrder": [
        1
      ],
      "displayDataLabel": [
        6
      ],
      "showCenterMetric": [
        6
      ],
      "displayLegend": [
        6
      ],
      "hideEmptyCategory": [
        6
      ],
      "splitMultiValueFields": [
        6
      ],
      "description": [
        1
      ],
      "color": [
        1
      ],
      "filter": [
        14
      ],
      "timezone": [
        1
      ],
      "firstDayOfTheWeek": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "ObjectRecordGroupByDateGranularity": {},
    "GraphOrderBy": {},
    "LineChartConfiguration": {
      "configurationType": [
        83
      ],
      "aggregateFieldMetadataId": [
        3
      ],
      "aggregateOperation": [
        49
      ],
      "primaryAxisGroupByFieldMetadataId": [
        3
      ],
      "primaryAxisGroupBySubFieldName": [
        1
      ],
      "primaryAxisDateGranularity": [
        86
      ],
      "primaryAxisOrderBy": [
        87
      ],
      "primaryAxisManualSortOrder": [
        1
      ],
      "secondaryAxisGroupByFieldMetadataId": [
        3
      ],
      "secondaryAxisGroupBySubFieldName": [
        1
      ],
      "secondaryAxisGroupByDateGranularity": [
        86
      ],
      "secondaryAxisOrderBy": [
        87
      ],
      "secondaryAxisManualSortOrder": [
        1
      ],
      "omitNullValues": [
        6
      ],
      "splitMultiValueFields": [
        6
      ],
      "axisNameDisplay": [
        89
      ],
      "displayDataLabel": [
        6
      ],
      "displayLegend": [
        6
      ],
      "rangeMin": [
        10
      ],
      "rangeMax": [
        10
      ],
      "description": [
        1
      ],
      "color": [
        1
      ],
      "filter": [
        14
      ],
      "isStacked": [
        6
      ],
      "isCumulative": [
        6
      ],
      "timezone": [
        1
      ],
      "firstDayOfTheWeek": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "AxisNameDisplay": {},
    "IframeConfiguration": {
      "configurationType": [
        83
      ],
      "url": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "GaugeChartConfiguration": {
      "configurationType": [
        83
      ],
      "aggregateFieldMetadataId": [
        3
      ],
      "aggregateOperation": [
        49
      ],
      "displayDataLabel": [
        6
      ],
      "color": [
        1
      ],
      "description": [
        1
      ],
      "filter": [
        14
      ],
      "timezone": [
        1
      ],
      "firstDayOfTheWeek": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "BarChartConfiguration": {
      "configurationType": [
        83
      ],
      "aggregateFieldMetadataId": [
        3
      ],
      "aggregateOperation": [
        49
      ],
      "primaryAxisGroupByFieldMetadataId": [
        3
      ],
      "primaryAxisGroupBySubFieldName": [
        1
      ],
      "primaryAxisDateGranularity": [
        86
      ],
      "primaryAxisOrderBy": [
        87
      ],
      "primaryAxisManualSortOrder": [
        1
      ],
      "secondaryAxisGroupByFieldMetadataId": [
        3
      ],
      "secondaryAxisGroupBySubFieldName": [
        1
      ],
      "secondaryAxisGroupByDateGranularity": [
        86
      ],
      "secondaryAxisOrderBy": [
        87
      ],
      "secondaryAxisManualSortOrder": [
        1
      ],
      "omitNullValues": [
        6
      ],
      "splitMultiValueFields": [
        6
      ],
      "axisNameDisplay": [
        89
      ],
      "displayDataLabel": [
        6
      ],
      "displayLegend": [
        6
      ],
      "rangeMin": [
        10
      ],
      "rangeMax": [
        10
      ],
      "description": [
        1
      ],
      "color": [
        1
      ],
      "filter": [
        14
      ],
      "groupMode": [
        93
      ],
      "layout": [
        94
      ],
      "isCumulative": [
        6
      ],
      "timezone": [
        1
      ],
      "firstDayOfTheWeek": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "BarChartGroupMode": {},
    "BarChartLayout": {},
    "CalendarConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "FrontComponentConfiguration": {
      "configurationType": [
        83
      ],
      "frontComponentId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "EmailsConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "FieldConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "FieldRichTextConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "FieldsConfiguration": {
      "configurationType": [
        83
      ],
      "viewId": [
        1
      ],
      "newFieldDefaultConfiguration": [
        71
      ],
      "__typename": [
        1
      ]
    },
    "FilesConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "NotesConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "TasksConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "TimelineConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "ViewConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowRunConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "WorkflowVersionConfiguration": {
      "configurationType": [
        83
      ],
      "__typename": [
        1
      ]
    },
    "PageLayoutTab": {
      "id": [
        3
      ],
      "applicationId": [
        3
      ],
      "title": [
        1
      ],
      "position": [
        10
      ],
      "pageLayoutId": [
        3
      ],
      "widgets": [
        74
      ],
      "icon": [
        1
      ],
      "layoutMode": [
        78
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "PageLayout": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "type": [
        111
      ],
      "objectMetadataId": [
        3
      ],
      "tabs": [
        109
      ],
      "defaultTabToFocusOnMobileAndSidePanelId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "PageLayoutType": {},
    "ObjectRecordEventProperties": {
      "updatedFields": [
        1
      ],
      "before": [
        14
      ],
      "after": [
        14
      ],
      "diff": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "MetadataEvent": {
      "type": [
        114
      ],
      "metadataName": [
        1
      ],
      "recordId": [
        1
      ],
      "properties": [
        112
      ],
      "__typename": [
        1
      ]
    },
    "MetadataEventAction": {},
    "ObjectRecordEvent": {
      "action": [
        116
      ],
      "objectNameSingular": [
        1
      ],
      "recordId": [
        1
      ],
      "userId": [
        1
      ],
      "workspaceMemberId": [
        1
      ],
      "properties": [
        112
      ],
      "__typename": [
        1
      ]
    },
    "DatabaseEventAction": {},
    "ObjectRecordEventWithQueryIds": {
      "queryIds": [
        1
      ],
      "objectRecordEvent": [
        115
      ],
      "__typename": [
        1
      ]
    },
    "MetadataEventWithQueryIds": {
      "queryIds": [
        1
      ],
      "metadataEvent": [
        113
      ],
      "__typename": [
        1
      ]
    },
    "EventSubscription": {
      "eventStreamId": [
        1
      ],
      "objectRecordEventsWithQueryIds": [
        117
      ],
      "metadataEventsWithQueryIds": [
        118
      ],
      "__typename": [
        1
      ]
    },
    "OnDbEvent": {
      "action": [
        116
      ],
      "objectNameSingular": [
        1
      ],
      "eventDate": [
        4
      ],
      "record": [
        14
      ],
      "updatedFields": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "Analytics": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "BillingSubscriptionSchedulePhaseItem": {
      "price": [
        1
      ],
      "quantity": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "BillingSubscriptionSchedulePhase": {
      "start_date": [
        10
      ],
      "end_date": [
        10
      ],
      "items": [
        122
      ],
      "__typename": [
        1
      ]
    },
    "BillingProductMetadata": {
      "planKey": [
        125
      ],
      "priceUsageBased": [
        126
      ],
      "productKey": [
        127
      ],
      "__typename": [
        1
      ]
    },
    "BillingPlanKey": {},
    "BillingUsageType": {},
    "BillingProductKey": {},
    "BillingPriceLicensed": {
      "recurringInterval": [
        129
      ],
      "unitAmount": [
        10
      ],
      "stripePriceId": [
        1
      ],
      "priceUsageType": [
        126
      ],
      "__typename": [
        1
      ]
    },
    "SubscriptionInterval": {},
    "BillingPriceTier": {
      "upTo": [
        10
      ],
      "flatAmount": [
        10
      ],
      "unitAmount": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "BillingPriceMetered": {
      "tiers": [
        130
      ],
      "recurringInterval": [
        129
      ],
      "stripePriceId": [
        1
      ],
      "priceUsageType": [
        126
      ],
      "__typename": [
        1
      ]
    },
    "BillingProduct": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "images": [
        1
      ],
      "metadata": [
        124
      ],
      "__typename": [
        1
      ]
    },
    "BillingLicensedProduct": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "images": [
        1
      ],
      "metadata": [
        124
      ],
      "prices": [
        128
      ],
      "__typename": [
        1
      ]
    },
    "BillingMeteredProduct": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "images": [
        1
      ],
      "metadata": [
        124
      ],
      "prices": [
        131
      ],
      "__typename": [
        1
      ]
    },
    "BillingSubscriptionItem": {
      "id": [
        3
      ],
      "hasReachedCurrentPeriodCap": [
        6
      ],
      "quantity": [
        10
      ],
      "stripePriceId": [
        1
      ],
      "billingProduct": [
        0
      ],
      "__typename": [
        1
      ]
    },
    "BillingSubscription": {
      "id": [
        3
      ],
      "status": [
        137
      ],
      "interval": [
        129
      ],
      "billingSubscriptionItems": [
        135
      ],
      "currentPeriodEnd": [
        4
      ],
      "metadata": [
        14
      ],
      "phases": [
        123
      ],
      "__typename": [
        1
      ]
    },
    "SubscriptionStatus": {},
    "BillingEndTrialPeriod": {
      "status": [
        137
      ],
      "hasPaymentMethod": [
        6
      ],
      "billingPortalUrl": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "BillingMeteredProductUsage": {
      "productKey": [
        127
      ],
      "periodStart": [
        4
      ],
      "periodEnd": [
        4
      ],
      "usedCredits": [
        10
      ],
      "grantedCredits": [
        10
      ],
      "rolloverCredits": [
        10
      ],
      "totalGrantedCredits": [
        10
      ],
      "unitPriceCents": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "BillingPlan": {
      "planKey": [
        125
      ],
      "licensedProducts": [
        133
      ],
      "meteredProducts": [
        134
      ],
      "__typename": [
        1
      ]
    },
    "BillingSession": {
      "url": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "BillingUpdate": {
      "currentBillingSubscription": [
        136
      ],
      "billingSubscriptions": [
        136
      ],
      "__typename": [
        1
      ]
    },
    "OnboardingStepSuccess": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ApprovedAccessDomain": {
      "id": [
        3
      ],
      "domain": [
        1
      ],
      "isValidated": [
        6
      ],
      "createdAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "FileWithSignedUrl": {
      "id": [
        3
      ],
      "path": [
        1
      ],
      "size": [
        10
      ],
      "createdAt": [
        4
      ],
      "url": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceInvitation": {
      "id": [
        3
      ],
      "email": [
        1
      ],
      "roleId": [
        3
      ],
      "expiresAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "SendInvitations": {
      "success": [
        6
      ],
      "errors": [
        1
      ],
      "result": [
        146
      ],
      "__typename": [
        1
      ]
    },
    "ResendEmailVerificationToken": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceUrls": {
      "customUrl": [
        1
      ],
      "subdomainUrl": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "SSOConnection": {
      "type": [
        151
      ],
      "id": [
        3
      ],
      "issuer": [
        1
      ],
      "name": [
        1
      ],
      "status": [
        152
      ],
      "__typename": [
        1
      ]
    },
    "IdentityProviderType": {},
    "SSOIdentityProviderStatus": {},
    "AvailableWorkspace": {
      "id": [
        3
      ],
      "displayName": [
        1
      ],
      "loginToken": [
        1
      ],
      "personalInviteToken": [
        1
      ],
      "inviteHash": [
        1
      ],
      "workspaceUrls": [
        149
      ],
      "logo": [
        1
      ],
      "sso": [
        150
      ],
      "__typename": [
        1
      ]
    },
    "AvailableWorkspaces": {
      "availableWorkspacesForSignIn": [
        153
      ],
      "availableWorkspacesForSignUp": [
        153
      ],
      "__typename": [
        1
      ]
    },
    "DeletedWorkspaceMember": {
      "id": [
        3
      ],
      "name": [
        19
      ],
      "userEmail": [
        1
      ],
      "avatarUrl": [
        1
      ],
      "userWorkspaceId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "BillingEntitlement": {
      "key": [
        157
      ],
      "value": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "BillingEntitlementKey": {},
    "DomainRecord": {
      "validationType": [
        1
      ],
      "type": [
        1
      ],
      "status": [
        1
      ],
      "key": [
        1
      ],
      "value": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "DomainValidRecords": {
      "id": [
        3
      ],
      "domain": [
        1
      ],
      "records": [
        158
      ],
      "__typename": [
        1
      ]
    },
    "FeatureFlag": {
      "key": [
        161
      ],
      "value": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "FeatureFlagKey": {},
    "SSOIdentityProvider": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "type": [
        151
      ],
      "status": [
        152
      ],
      "issuer": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "AuthProviders": {
      "sso": [
        162
      ],
      "google": [
        6
      ],
      "magicLink": [
        6
      ],
      "password": [
        6
      ],
      "microsoft": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "AuthBypassProviders": {
      "google": [
        6
      ],
      "password": [
        6
      ],
      "microsoft": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "PublicWorkspaceData": {
      "id": [
        3
      ],
      "authProviders": [
        163
      ],
      "authBypassProviders": [
        164
      ],
      "logo": [
        1
      ],
      "displayName": [
        1
      ],
      "workspaceUrls": [
        149
      ],
      "__typename": [
        1
      ]
    },
    "IndexEdge": {
      "node": [
        35
      ],
      "cursor": [
        38
      ],
      "__typename": [
        1
      ]
    },
    "PageInfo": {
      "hasNextPage": [
        6
      ],
      "hasPreviousPage": [
        6
      ],
      "startCursor": [
        38
      ],
      "endCursor": [
        38
      ],
      "__typename": [
        1
      ]
    },
    "IndexConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        166
      ],
      "__typename": [
        1
      ]
    },
    "IndexFieldEdge": {
      "node": [
        34
      ],
      "cursor": [
        38
      ],
      "__typename": [
        1
      ]
    },
    "IndexIndexFieldMetadatasConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        169
      ],
      "__typename": [
        1
      ]
    },
    "ObjectEdge": {
      "node": [
        44
      ],
      "cursor": [
        38
      ],
      "__typename": [
        1
      ]
    },
    "IndexObjectMetadataConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        171
      ],
      "__typename": [
        1
      ]
    },
    "ObjectRecordCount": {
      "objectNamePlural": [
        1
      ],
      "totalCount": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "ObjectConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        171
      ],
      "__typename": [
        1
      ]
    },
    "ObjectIndexMetadatasConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        166
      ],
      "__typename": [
        1
      ]
    },
    "FieldEdge": {
      "node": [
        32
      ],
      "cursor": [
        38
      ],
      "__typename": [
        1
      ]
    },
    "ObjectFieldsConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        176
      ],
      "__typename": [
        1
      ]
    },
    "UpsertRowLevelPermissionPredicatesResult": {
      "predicates": [
        12
      ],
      "predicateGroups": [
        9
      ],
      "__typename": [
        1
      ]
    },
    "Relation": {
      "type": [
        180
      ],
      "sourceObjectMetadata": [
        44
      ],
      "targetObjectMetadata": [
        44
      ],
      "sourceFieldMetadata": [
        32
      ],
      "targetFieldMetadata": [
        32
      ],
      "__typename": [
        1
      ]
    },
    "RelationType": {},
    "FieldConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        176
      ],
      "__typename": [
        1
      ]
    },
    "VersionDistributionEntry": {
      "version": [
        1
      ],
      "count": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "ApplicationRegistrationStats": {
      "activeInstalls": [
        16
      ],
      "mostInstalledVersion": [
        1
      ],
      "versionDistribution": [
        182
      ],
      "__typename": [
        1
      ]
    },
    "CreateApplicationRegistration": {
      "applicationRegistration": [
        7
      ],
      "clientSecret": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "PublicApplicationRegistration": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "logoUrl": [
        1
      ],
      "websiteUrl": [
        1
      ],
      "oAuthScopes": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "RotateClientSecret": {
      "clientSecret": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "DeleteSso": {
      "identityProviderId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "EditSso": {
      "id": [
        3
      ],
      "type": [
        151
      ],
      "issuer": [
        1
      ],
      "name": [
        1
      ],
      "status": [
        152
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceNameAndId": {
      "displayName": [
        1
      ],
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "FindAvailableSSOIDP": {
      "type": [
        151
      ],
      "id": [
        3
      ],
      "issuer": [
        1
      ],
      "name": [
        1
      ],
      "status": [
        152
      ],
      "workspace": [
        189
      ],
      "__typename": [
        1
      ]
    },
    "SetupSso": {
      "id": [
        3
      ],
      "type": [
        151
      ],
      "issuer": [
        1
      ],
      "name": [
        1
      ],
      "status": [
        152
      ],
      "__typename": [
        1
      ]
    },
    "DeleteTwoFactorAuthenticationMethod": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "InitiateTwoFactorAuthenticationProvisioning": {
      "uri": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "VerifyTwoFactorAuthenticationMethod": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "AuthorizeApp": {
      "redirectUrl": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "AuthToken": {
      "token": [
        1
      ],
      "expiresAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "AuthTokenPair": {
      "accessOrWorkspaceAgnosticToken": [
        196
      ],
      "refreshToken": [
        196
      ],
      "__typename": [
        1
      ]
    },
    "AvailableWorkspacesAndAccessTokens": {
      "tokens": [
        197
      ],
      "availableWorkspaces": [
        154
      ],
      "__typename": [
        1
      ]
    },
    "EmailPasswordResetLink": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "GetAuthorizationUrlForSSO": {
      "authorizationURL": [
        1
      ],
      "type": [
        1
      ],
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "InvalidatePassword": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceUrlsAndId": {
      "workspaceUrls": [
        149
      ],
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "SignUp": {
      "loginToken": [
        196
      ],
      "workspace": [
        202
      ],
      "__typename": [
        1
      ]
    },
    "TransientToken": {
      "transientToken": [
        196
      ],
      "__typename": [
        1
      ]
    },
    "ValidatePasswordResetToken": {
      "id": [
        3
      ],
      "email": [
        1
      ],
      "hasPassword": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "VerifyEmailAndGetLoginToken": {
      "loginToken": [
        196
      ],
      "workspaceUrls": [
        149
      ],
      "__typename": [
        1
      ]
    },
    "ApiKeyToken": {
      "token": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "AuthTokens": {
      "tokens": [
        197
      ],
      "__typename": [
        1
      ]
    },
    "LoginToken": {
      "loginToken": [
        196
      ],
      "__typename": [
        1
      ]
    },
    "CheckUserExist": {
      "exists": [
        6
      ],
      "availableWorkspacesCount": [
        10
      ],
      "isEmailVerified": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceInviteHashValid": {
      "isValid": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "LogicFunctionExecutionResult": {
      "data": [
        14
      ],
      "logs": [
        1
      ],
      "duration": [
        10
      ],
      "status": [
        213
      ],
      "error": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "LogicFunctionExecutionStatus": {},
    "LogicFunctionLogs": {
      "logs": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "ToolIndexEntry": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "category": [
        1
      ],
      "objectName": [
        1
      ],
      "inputSchema": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "AgentMessagePart": {
      "id": [
        3
      ],
      "messageId": [
        3
      ],
      "orderIndex": [
        16
      ],
      "type": [
        1
      ],
      "textContent": [
        1
      ],
      "reasoningContent": [
        1
      ],
      "toolName": [
        1
      ],
      "toolCallId": [
        1
      ],
      "toolInput": [
        14
      ],
      "toolOutput": [
        14
      ],
      "state": [
        1
      ],
      "errorMessage": [
        1
      ],
      "errorDetails": [
        14
      ],
      "sourceUrlSourceId": [
        1
      ],
      "sourceUrlUrl": [
        1
      ],
      "sourceUrlTitle": [
        1
      ],
      "sourceDocumentSourceId": [
        1
      ],
      "sourceDocumentMediaType": [
        1
      ],
      "sourceDocumentTitle": [
        1
      ],
      "sourceDocumentFilename": [
        1
      ],
      "fileMediaType": [
        1
      ],
      "fileFilename": [
        1
      ],
      "fileId": [
        3
      ],
      "fileUrl": [
        1
      ],
      "providerMetadata": [
        14
      ],
      "createdAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "Skill": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "description": [
        1
      ],
      "content": [
        1
      ],
      "isCustom": [
        6
      ],
      "isActive": [
        6
      ],
      "applicationId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "ApplicationTokenPair": {
      "applicationAccessToken": [
        196
      ],
      "applicationRefreshToken": [
        196
      ],
      "__typename": [
        1
      ]
    },
    "FrontComponent": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "sourceComponentPath": [
        1
      ],
      "builtComponentPath": [
        1
      ],
      "componentName": [
        1
      ],
      "builtComponentChecksum": [
        1
      ],
      "universalIdentifier": [
        3
      ],
      "applicationId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "isHeadless": [
        6
      ],
      "applicationTokenPair": [
        218
      ],
      "__typename": [
        1
      ]
    },
    "CommandMenuItem": {
      "id": [
        3
      ],
      "workflowVersionId": [
        3
      ],
      "frontComponentId": [
        3
      ],
      "frontComponent": [
        219
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "isPinned": [
        6
      ],
      "availabilityType": [
        221
      ],
      "conditionalAvailabilityExpression": [
        1
      ],
      "availabilityObjectMetadataId": [
        3
      ],
      "applicationId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "CommandMenuItemAvailabilityType": {},
    "AgentChatThread": {
      "id": [
        3
      ],
      "title": [
        1
      ],
      "totalInputTokens": [
        16
      ],
      "totalOutputTokens": [
        16
      ],
      "contextWindowTokens": [
        16
      ],
      "conversationSize": [
        16
      ],
      "totalInputCredits": [
        10
      ],
      "totalOutputCredits": [
        10
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "AgentMessage": {
      "id": [
        3
      ],
      "threadId": [
        3
      ],
      "turnId": [
        3
      ],
      "agentId": [
        3
      ],
      "role": [
        1
      ],
      "parts": [
        216
      ],
      "createdAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "AISystemPromptSection": {
      "title": [
        1
      ],
      "content": [
        1
      ],
      "estimatedTokenCount": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "AISystemPromptPreview": {
      "sections": [
        224
      ],
      "estimatedTokenCount": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "AgentChatThreadEdge": {
      "node": [
        222
      ],
      "cursor": [
        38
      ],
      "__typename": [
        1
      ]
    },
    "AgentChatThreadConnection": {
      "pageInfo": [
        167
      ],
      "edges": [
        226
      ],
      "__typename": [
        1
      ]
    },
    "AgentTurnEvaluation": {
      "id": [
        3
      ],
      "turnId": [
        3
      ],
      "score": [
        16
      ],
      "comment": [
        1
      ],
      "createdAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "AgentTurn": {
      "id": [
        3
      ],
      "threadId": [
        3
      ],
      "agentId": [
        3
      ],
      "evaluations": [
        228
      ],
      "messages": [
        223
      ],
      "createdAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "RecordIdentifier": {
      "id": [
        3
      ],
      "labelIdentifier": [
        1
      ],
      "imageIdentifier": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "NavigationMenuItem": {
      "id": [
        3
      ],
      "userWorkspaceId": [
        3
      ],
      "targetRecordId": [
        3
      ],
      "targetObjectMetadataId": [
        3
      ],
      "viewId": [
        3
      ],
      "name": [
        1
      ],
      "link": [
        1
      ],
      "icon": [
        1
      ],
      "color": [
        1
      ],
      "folderId": [
        3
      ],
      "position": [
        10
      ],
      "applicationId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "targetRecordIdentifier": [
        230
      ],
      "__typename": [
        1
      ]
    },
    "IngestionFieldMapping": {
      "id": [
        3
      ],
      "pipelineId": [
        3
      ],
      "sourceFieldPath": [
        1
      ],
      "targetFieldName": [
        1
      ],
      "targetCompositeSubField": [
        1
      ],
      "transform": [
        14
      ],
      "relationTargetObjectName": [
        1
      ],
      "relationMatchFieldName": [
        1
      ],
      "relationAutoCreate": [
        6
      ],
      "position": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "IngestionLog": {
      "id": [
        3
      ],
      "pipelineId": [
        3
      ],
      "status": [
        1
      ],
      "triggerType": [
        1
      ],
      "totalRecordsReceived": [
        16
      ],
      "recordsCreated": [
        16
      ],
      "recordsUpdated": [
        16
      ],
      "recordsSkipped": [
        16
      ],
      "recordsFailed": [
        16
      ],
      "errors": [
        14
      ],
      "incomingPayload": [
        14
      ],
      "startedAt": [
        4
      ],
      "completedAt": [
        4
      ],
      "durationMs": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "IngestionPipeline": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "mode": [
        1
      ],
      "targetObjectNameSingular": [
        1
      ],
      "webhookSecret": [
        1
      ],
      "sourceUrl": [
        1
      ],
      "sourceHttpMethod": [
        1
      ],
      "sourceAuthConfig": [
        14
      ],
      "sourceRequestConfig": [
        14
      ],
      "responseRecordsPath": [
        1
      ],
      "schedule": [
        1
      ],
      "dedupFieldName": [
        1
      ],
      "paginationConfig": [
        14
      ],
      "isEnabled": [
        6
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "TestIngestionPipelineResult": {
      "success": [
        6
      ],
      "totalRecords": [
        16
      ],
      "validRecords": [
        16
      ],
      "invalidRecords": [
        16
      ],
      "previewRecords": [
        14
      ],
      "errors": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "Webhook": {
      "id": [
        3
      ],
      "targetUrl": [
        1
      ],
      "operations": [
        1
      ],
      "description": [
        1
      ],
      "secret": [
        1
      ],
      "applicationId": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "deletedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "BillingTrialPeriod": {
      "duration": [
        10
      ],
      "isCreditCardRequired": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "NativeModelCapabilities": {
      "webSearch": [
        6
      ],
      "twitterSearch": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ClientAIModelConfig": {
      "modelId": [
        1
      ],
      "label": [
        1
      ],
      "modelFamily": [
        240
      ],
      "inferenceProvider": [
        241
      ],
      "inputCostPerMillionTokensInCredits": [
        10
      ],
      "outputCostPerMillionTokensInCredits": [
        10
      ],
      "nativeCapabilities": [
        238
      ],
      "deprecated": [
        6
      ],
      "isRecommended": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ModelFamily": {},
    "InferenceProvider": {},
    "AdminAIModelConfig": {
      "modelId": [
        1
      ],
      "label": [
        1
      ],
      "modelFamily": [
        240
      ],
      "inferenceProvider": [
        241
      ],
      "isAvailable": [
        6
      ],
      "isAdminEnabled": [
        6
      ],
      "deprecated": [
        6
      ],
      "isRecommended": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "AdminAIModels": {
      "autoEnableNewModels": [
        6
      ],
      "models": [
        242
      ],
      "__typename": [
        1
      ]
    },
    "Billing": {
      "isBillingEnabled": [
        6
      ],
      "billingUrl": [
        1
      ],
      "trialPeriods": [
        237
      ],
      "__typename": [
        1
      ]
    },
    "Support": {
      "supportDriver": [
        246
      ],
      "supportFrontChatId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "SupportDriver": {},
    "Sentry": {
      "environment": [
        1
      ],
      "release": [
        1
      ],
      "dsn": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "Captcha": {
      "provider": [
        249
      ],
      "siteKey": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CaptchaDriverType": {},
    "ApiConfig": {
      "mutationMaximumAffectedRecords": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "PublicFeatureFlagMetadata": {
      "label": [
        1
      ],
      "description": [
        1
      ],
      "imagePath": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "PublicFeatureFlag": {
      "key": [
        161
      ],
      "metadata": [
        251
      ],
      "__typename": [
        1
      ]
    },
    "ClientConfig": {
      "appVersion": [
        1
      ],
      "authProviders": [
        163
      ],
      "billing": [
        244
      ],
      "aiModels": [
        239
      ],
      "signInPrefilled": [
        6
      ],
      "isMultiWorkspaceEnabled": [
        6
      ],
      "isEmailVerificationRequired": [
        6
      ],
      "defaultSubdomain": [
        1
      ],
      "frontDomain": [
        1
      ],
      "analyticsEnabled": [
        6
      ],
      "support": [
        245
      ],
      "isAttachmentPreviewEnabled": [
        6
      ],
      "sentry": [
        247
      ],
      "captcha": [
        248
      ],
      "chromeExtensionId": [
        1
      ],
      "api": [
        250
      ],
      "canManageFeatureFlags": [
        6
      ],
      "publicFeatureFlags": [
        252
      ],
      "isMicrosoftMessagingEnabled": [
        6
      ],
      "isMicrosoftCalendarEnabled": [
        6
      ],
      "isGoogleMessagingEnabled": [
        6
      ],
      "isGoogleCalendarEnabled": [
        6
      ],
      "isConfigVariablesInDbEnabled": [
        6
      ],
      "isImapSmtpCaldavEnabled": [
        6
      ],
      "allowRequestsToTwentyIcons": [
        6
      ],
      "calendarBookingPageId": [
        1
      ],
      "isCloudflareIntegrationEnabled": [
        6
      ],
      "isClickHouseConfigured": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ConfigVariable": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "value": [
        14
      ],
      "isSensitive": [
        6
      ],
      "source": [
        255
      ],
      "isEnvOnly": [
        6
      ],
      "type": [
        256
      ],
      "options": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "ConfigSource": {},
    "ConfigVariableType": {},
    "ConfigVariablesGroupData": {
      "variables": [
        254
      ],
      "name": [
        258
      ],
      "description": [
        1
      ],
      "isHiddenOnLoad": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ConfigVariablesGroup": {},
    "ConfigVariables": {
      "groups": [
        257
      ],
      "__typename": [
        1
      ]
    },
    "JobOperationResult": {
      "jobId": [
        1
      ],
      "success": [
        6
      ],
      "error": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "DeleteJobsResponse": {
      "deletedCount": [
        16
      ],
      "results": [
        260
      ],
      "__typename": [
        1
      ]
    },
    "QueueJob": {
      "id": [
        1
      ],
      "name": [
        1
      ],
      "data": [
        14
      ],
      "state": [
        263
      ],
      "timestamp": [
        10
      ],
      "failedReason": [
        1
      ],
      "processedOn": [
        10
      ],
      "finishedOn": [
        10
      ],
      "attemptsMade": [
        10
      ],
      "returnValue": [
        14
      ],
      "logs": [
        1
      ],
      "stackTrace": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "JobState": {},
    "QueueRetentionConfig": {
      "completedMaxAge": [
        10
      ],
      "completedMaxCount": [
        10
      ],
      "failedMaxAge": [
        10
      ],
      "failedMaxCount": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "QueueJobsResponse": {
      "jobs": [
        262
      ],
      "count": [
        10
      ],
      "totalCount": [
        10
      ],
      "hasMore": [
        6
      ],
      "retentionConfig": [
        264
      ],
      "__typename": [
        1
      ]
    },
    "RetryJobsResponse": {
      "retriedCount": [
        16
      ],
      "results": [
        260
      ],
      "__typename": [
        1
      ]
    },
    "SystemHealthService": {
      "id": [
        268
      ],
      "label": [
        1
      ],
      "status": [
        269
      ],
      "__typename": [
        1
      ]
    },
    "HealthIndicatorId": {},
    "AdminPanelHealthServiceStatus": {},
    "SystemHealth": {
      "services": [
        267
      ],
      "__typename": [
        1
      ]
    },
    "UserInfo": {
      "id": [
        3
      ],
      "email": [
        1
      ],
      "firstName": [
        1
      ],
      "lastName": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceInfo": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "allowImpersonation": [
        6
      ],
      "logo": [
        1
      ],
      "totalUsers": [
        10
      ],
      "workspaceUrls": [
        149
      ],
      "users": [
        271
      ],
      "featureFlags": [
        160
      ],
      "__typename": [
        1
      ]
    },
    "UserLookup": {
      "user": [
        271
      ],
      "workspaces": [
        272
      ],
      "__typename": [
        1
      ]
    },
    "VersionInfo": {
      "currentVersion": [
        1
      ],
      "latestVersion": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "AdminPanelWorkerQueueHealth": {
      "id": [
        1
      ],
      "queueName": [
        1
      ],
      "status": [
        269
      ],
      "__typename": [
        1
      ]
    },
    "AdminPanelHealthServiceData": {
      "id": [
        268
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "status": [
        269
      ],
      "errorMessage": [
        1
      ],
      "details": [
        1
      ],
      "queues": [
        275
      ],
      "__typename": [
        1
      ]
    },
    "QueueMetricsDataPoint": {
      "x": [
        10
      ],
      "y": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "QueueMetricsSeries": {
      "id": [
        1
      ],
      "data": [
        277
      ],
      "__typename": [
        1
      ]
    },
    "WorkerQueueMetrics": {
      "failed": [
        10
      ],
      "completed": [
        10
      ],
      "waiting": [
        10
      ],
      "active": [
        10
      ],
      "delayed": [
        10
      ],
      "failureRate": [
        10
      ],
      "failedData": [
        10
      ],
      "completedData": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "QueueMetricsData": {
      "queueName": [
        1
      ],
      "workers": [
        10
      ],
      "timeRange": [
        281
      ],
      "details": [
        279
      ],
      "data": [
        278
      ],
      "__typename": [
        1
      ]
    },
    "QueueMetricsTimeRange": {},
    "Impersonate": {
      "loginToken": [
        196
      ],
      "workspace": [
        202
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMigration": {
      "applicationUniversalIdentifier": [
        1
      ],
      "actions": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "File": {
      "id": [
        3
      ],
      "path": [
        1
      ],
      "size": [
        10
      ],
      "createdAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceAppField": {
      "name": [
        1
      ],
      "type": [
        1
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "objectUniversalIdentifier": [
        1
      ],
      "universalIdentifier": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceAppObject": {
      "universalIdentifier": [
        1
      ],
      "nameSingular": [
        1
      ],
      "namePlural": [
        1
      ],
      "labelSingular": [
        1
      ],
      "labelPlural": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "fields": [
        285
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceAppLogicFunction": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "timeoutSeconds": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceAppFrontComponent": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceAppRoleObjectPermission": {
      "objectUniversalIdentifier": [
        1
      ],
      "canReadObjectRecords": [
        6
      ],
      "canUpdateObjectRecords": [
        6
      ],
      "canSoftDeleteObjectRecords": [
        6
      ],
      "canDestroyObjectRecords": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceAppRoleFieldPermission": {
      "objectUniversalIdentifier": [
        1
      ],
      "fieldUniversalIdentifier": [
        1
      ],
      "canReadFieldValue": [
        6
      ],
      "canUpdateFieldValue": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceAppDefaultRole": {
      "id": [
        1
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "canReadAllObjectRecords": [
        6
      ],
      "canUpdateAllObjectRecords": [
        6
      ],
      "canSoftDeleteAllObjectRecords": [
        6
      ],
      "canDestroyAllObjectRecords": [
        6
      ],
      "canUpdateAllSettings": [
        6
      ],
      "canAccessAllTools": [
        6
      ],
      "objectPermissions": [
        289
      ],
      "fieldPermissions": [
        290
      ],
      "permissionFlags": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "MarketplaceApp": {
      "id": [
        1
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "version": [
        1
      ],
      "author": [
        1
      ],
      "category": [
        1
      ],
      "logo": [
        1
      ],
      "screenshots": [
        1
      ],
      "aboutDescription": [
        1
      ],
      "providers": [
        1
      ],
      "websiteUrl": [
        1
      ],
      "termsUrl": [
        1
      ],
      "objects": [
        286
      ],
      "fields": [
        285
      ],
      "logicFunctions": [
        287
      ],
      "frontComponents": [
        288
      ],
      "defaultRole": [
        291
      ],
      "__typename": [
        1
      ]
    },
    "PublicDomain": {
      "id": [
        3
      ],
      "domain": [
        1
      ],
      "isValidated": [
        6
      ],
      "createdAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "VerificationRecord": {
      "type": [
        1
      ],
      "key": [
        1
      ],
      "value": [
        1
      ],
      "priority": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "EmailingDomain": {
      "id": [
        3
      ],
      "createdAt": [
        4
      ],
      "updatedAt": [
        4
      ],
      "domain": [
        1
      ],
      "driver": [
        296
      ],
      "status": [
        297
      ],
      "verificationRecords": [
        294
      ],
      "verifiedAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "EmailingDomainDriver": {},
    "EmailingDomainStatus": {},
    "AutocompleteResult": {
      "text": [
        1
      ],
      "placeId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "Location": {
      "lat": [
        10
      ],
      "lng": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "PlaceDetailsResult": {
      "street1": [
        1
      ],
      "street2": [
        1
      ],
      "state": [
        1
      ],
      "postcode": [
        1
      ],
      "city": [
        1
      ],
      "country": [
        1
      ],
      "location": [
        299
      ],
      "__typename": [
        1
      ]
    },
    "ConnectionParametersOutput": {
      "host": [
        1
      ],
      "port": [
        10
      ],
      "username": [
        1
      ],
      "password": [
        1
      ],
      "secure": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "ImapSmtpCaldavConnectionParameters": {
      "IMAP": [
        301
      ],
      "SMTP": [
        301
      ],
      "CALDAV": [
        301
      ],
      "__typename": [
        1
      ]
    },
    "ConnectedImapSmtpCaldavAccount": {
      "id": [
        3
      ],
      "handle": [
        1
      ],
      "provider": [
        1
      ],
      "accountOwnerId": [
        3
      ],
      "connectionParameters": [
        302
      ],
      "__typename": [
        1
      ]
    },
    "ImapSmtpCaldavConnectionSuccess": {
      "success": [
        6
      ],
      "connectedAccountId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "PostgresCredentials": {
      "id": [
        3
      ],
      "user": [
        1
      ],
      "password": [
        1
      ],
      "workspaceId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "ChannelSyncSuccess": {
      "success": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "BarChartSeries": {
      "key": [
        1
      ],
      "label": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "BarChartData": {
      "data": [
        14
      ],
      "indexBy": [
        1
      ],
      "keys": [
        1
      ],
      "series": [
        307
      ],
      "xAxisLabel": [
        1
      ],
      "yAxisLabel": [
        1
      ],
      "showLegend": [
        6
      ],
      "showDataLabels": [
        6
      ],
      "layout": [
        94
      ],
      "groupMode": [
        93
      ],
      "hasTooManyGroups": [
        6
      ],
      "formattedToRawLookup": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "LineChartDataPoint": {
      "x": [
        1
      ],
      "y": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "LineChartSeries": {
      "id": [
        1
      ],
      "label": [
        1
      ],
      "data": [
        309
      ],
      "__typename": [
        1
      ]
    },
    "LineChartData": {
      "series": [
        310
      ],
      "xAxisLabel": [
        1
      ],
      "yAxisLabel": [
        1
      ],
      "showLegend": [
        6
      ],
      "showDataLabels": [
        6
      ],
      "hasTooManyGroups": [
        6
      ],
      "formattedToRawLookup": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "PieChartDataItem": {
      "id": [
        1
      ],
      "value": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "PieChartData": {
      "data": [
        312
      ],
      "showLegend": [
        6
      ],
      "showDataLabels": [
        6
      ],
      "showCenterMetric": [
        6
      ],
      "hasTooManyGroups": [
        6
      ],
      "formattedToRawLookup": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "DuplicatedDashboard": {
      "id": [
        3
      ],
      "title": [
        1
      ],
      "pageLayoutId": [
        3
      ],
      "position": [
        10
      ],
      "createdAt": [
        1
      ],
      "updatedAt": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "EventLogRecord": {
      "event": [
        1
      ],
      "timestamp": [
        4
      ],
      "userId": [
        1
      ],
      "properties": [
        14
      ],
      "recordId": [
        1
      ],
      "objectMetadataId": [
        1
      ],
      "isCustom": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "EventLogPageInfo": {
      "endCursor": [
        1
      ],
      "hasNextPage": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "EventLogQueryResult": {
      "records": [
        315
      ],
      "totalCount": [
        16
      ],
      "pageInfo": [
        316
      ],
      "__typename": [
        1
      ]
    },
    "Query": {
      "getPageLayoutWidgets": [
        74,
        {
          "pageLayoutTabId": [
            1,
            "String!"
          ]
        }
      ],
      "getPageLayoutWidget": [
        74,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getPageLayoutTabs": [
        109,
        {
          "pageLayoutId": [
            1,
            "String!"
          ]
        }
      ],
      "getPageLayoutTab": [
        109,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getPageLayouts": [
        110,
        {
          "objectMetadataId": [
            1
          ],
          "pageLayoutType": [
            111
          ]
        }
      ],
      "getPageLayout": [
        110,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "findOneLogicFunction": [
        30,
        {
          "input": [
            319,
            "LogicFunctionIdInput!"
          ]
        }
      ],
      "findManyLogicFunctions": [
        30
      ],
      "getAvailablePackages": [
        14,
        {
          "input": [
            319,
            "LogicFunctionIdInput!"
          ]
        }
      ],
      "getLogicFunctionSourceCode": [
        1,
        {
          "input": [
            319,
            "LogicFunctionIdInput!"
          ]
        }
      ],
      "objectRecordCounts": [
        173
      ],
      "object": [
        44,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "objects": [
        174,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            39,
            "ObjectFilter!"
          ]
        }
      ],
      "getCoreViewFields": [
        48,
        {
          "viewId": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViewField": [
        48,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViews": [
        58,
        {
          "objectMetadataId": [
            1
          ],
          "viewTypes": [
            59,
            "[ViewType!]"
          ]
        }
      ],
      "getCoreView": [
        58,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViewSorts": [
        55,
        {
          "viewId": [
            1
          ]
        }
      ],
      "getCoreViewSort": [
        55,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViewGroups": [
        54,
        {
          "viewId": [
            1
          ]
        }
      ],
      "getCoreViewGroup": [
        54,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViewFilterGroups": [
        50,
        {
          "viewId": [
            1
          ]
        }
      ],
      "getCoreViewFilterGroup": [
        50,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViewFilters": [
        52,
        {
          "viewId": [
            1
          ]
        }
      ],
      "getCoreViewFilter": [
        52,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViewFieldGroups": [
        57,
        {
          "viewId": [
            1,
            "String!"
          ]
        }
      ],
      "getCoreViewFieldGroup": [
        57,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "index": [
        35,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "indexMetadatas": [
        168,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            46,
            "IndexFilter!"
          ]
        }
      ],
      "commandMenuItems": [
        220
      ],
      "commandMenuItem": [
        220,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "frontComponents": [
        219
      ],
      "frontComponent": [
        219,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "findManyAgents": [
        24
      ],
      "findOneAgent": [
        24,
        {
          "input": [
            321,
            "AgentIdInput!"
          ]
        }
      ],
      "billingPortalSession": [
        141,
        {
          "returnUrlPath": [
            1
          ]
        }
      ],
      "listPlans": [
        140
      ],
      "getMeteredProductsUsage": [
        139
      ],
      "getRoles": [
        28
      ],
      "findWorkspaceInvitations": [
        146
      ],
      "getApprovedAccessDomains": [
        144
      ],
      "apiKeys": [
        2
      ],
      "apiKey": [
        2,
        {
          "input": [
            322,
            "GetApiKeyInput!"
          ]
        }
      ],
      "getToolIndex": [
        215
      ],
      "getToolInputSchema": [
        14,
        {
          "toolName": [
            1,
            "String!"
          ]
        }
      ],
      "field": [
        32,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "fields": [
        181,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            45,
            "FieldFilter!"
          ]
        }
      ],
      "currentUser": [
        67
      ],
      "currentWorkspace": [
        64
      ],
      "getPublicWorkspaceDataByDomain": [
        165,
        {
          "origin": [
            1
          ]
        }
      ],
      "checkUserExists": [
        210,
        {
          "email": [
            1,
            "String!"
          ],
          "captchaToken": [
            1
          ]
        }
      ],
      "checkWorkspaceInviteHashIsValid": [
        211,
        {
          "inviteHash": [
            1,
            "String!"
          ]
        }
      ],
      "findWorkspaceFromInviteHash": [
        64,
        {
          "inviteHash": [
            1,
            "String!"
          ]
        }
      ],
      "validatePasswordResetToken": [
        205,
        {
          "passwordResetToken": [
            1,
            "String!"
          ]
        }
      ],
      "findApplicationRegistrationByClientId": [
        185,
        {
          "clientId": [
            1,
            "String!"
          ]
        }
      ],
      "findApplicationRegistrationByUniversalIdentifier": [
        7,
        {
          "universalIdentifier": [
            1,
            "String!"
          ]
        }
      ],
      "findManyApplicationRegistrations": [
        7
      ],
      "findOneApplicationRegistration": [
        7,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "findApplicationRegistrationStats": [
        183,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "findApplicationRegistrationVariables": [
        5,
        {
          "applicationRegistrationId": [
            1,
            "String!"
          ]
        }
      ],
      "getSSOIdentityProviders": [
        190
      ],
      "ingestionPipelines": [
        234
      ],
      "ingestionPipeline": [
        234,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "ingestionFieldMappings": [
        232,
        {
          "pipelineId": [
            3,
            "UUID!"
          ]
        }
      ],
      "ingestionLogs": [
        233,
        {
          "pipelineId": [
            3,
            "UUID!"
          ],
          "limit": [
            16
          ]
        }
      ],
      "webhooks": [
        236
      ],
      "webhook": [
        236,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "chatThread": [
        222,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "chatMessages": [
        223,
        {
          "threadId": [
            3,
            "UUID!"
          ]
        }
      ],
      "getAISystemPromptPreview": [
        225
      ],
      "skills": [
        217
      ],
      "skill": [
        217,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "chatThreads": [
        227,
        {
          "paging": [
            37,
            "CursorPaging!"
          ],
          "filter": [
            323,
            "AgentChatThreadFilter!"
          ],
          "sorting": [
            326,
            "[AgentChatThreadSort!]!"
          ]
        }
      ],
      "agentTurns": [
        229,
        {
          "agentId": [
            3,
            "UUID!"
          ]
        }
      ],
      "navigationMenuItems": [
        231
      ],
      "navigationMenuItem": [
        231,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "eventLogs": [
        317,
        {
          "input": [
            330,
            "EventLogQueryInput!"
          ]
        }
      ],
      "pieChartData": [
        313,
        {
          "input": [
            334,
            "PieChartDataInput!"
          ]
        }
      ],
      "lineChartData": [
        311,
        {
          "input": [
            335,
            "LineChartDataInput!"
          ]
        }
      ],
      "barChartData": [
        308,
        {
          "input": [
            336,
            "BarChartDataInput!"
          ]
        }
      ],
      "getConnectedImapSmtpCaldavAccount": [
        303,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "getAutoCompleteAddress": [
        298,
        {
          "address": [
            1,
            "String!"
          ],
          "token": [
            1,
            "String!"
          ],
          "country": [
            1
          ],
          "isFieldCity": [
            6
          ]
        }
      ],
      "getAddressDetails": [
        300,
        {
          "placeId": [
            1,
            "String!"
          ],
          "token": [
            1,
            "String!"
          ]
        }
      ],
      "getConfigVariablesGrouped": [
        259
      ],
      "getSystemHealthStatus": [
        270
      ],
      "getIndicatorHealthStatus": [
        276,
        {
          "indicatorId": [
            268,
            "HealthIndicatorId!"
          ]
        }
      ],
      "getQueueMetrics": [
        280,
        {
          "queueName": [
            1,
            "String!"
          ],
          "timeRange": [
            281
          ]
        }
      ],
      "versionInfo": [
        274
      ],
      "getAdminAiModels": [
        243
      ],
      "getDatabaseConfigVariable": [
        254,
        {
          "key": [
            1,
            "String!"
          ]
        }
      ],
      "getQueueJobs": [
        265,
        {
          "queueName": [
            1,
            "String!"
          ],
          "state": [
            263,
            "JobState!"
          ],
          "limit": [
            16
          ],
          "offset": [
            16
          ]
        }
      ],
      "getPostgresCredentials": [
        305
      ],
      "findManyPublicDomains": [
        293
      ],
      "getEmailingDomains": [
        295
      ],
      "findManyApplications": [
        47
      ],
      "findOneApplication": [
        47,
        {
          "id": [
            3
          ],
          "universalIdentifier": [
            3
          ]
        }
      ],
      "findManyMarketplaceApps": [
        292
      ],
      "__typename": [
        1
      ]
    },
    "LogicFunctionIdInput": {
      "id": [
        320
      ],
      "__typename": [
        1
      ]
    },
    "ID": {},
    "AgentIdInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "GetApiKeyInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "AgentChatThreadFilter": {
      "and": [
        323
      ],
      "or": [
        323
      ],
      "id": [
        40
      ],
      "updatedAt": [
        324
      ],
      "__typename": [
        1
      ]
    },
    "DateFieldComparison": {
      "is": [
        6
      ],
      "isNot": [
        6
      ],
      "eq": [
        4
      ],
      "neq": [
        4
      ],
      "gt": [
        4
      ],
      "gte": [
        4
      ],
      "lt": [
        4
      ],
      "lte": [
        4
      ],
      "in": [
        4
      ],
      "notIn": [
        4
      ],
      "between": [
        325
      ],
      "notBetween": [
        325
      ],
      "__typename": [
        1
      ]
    },
    "DateFieldComparisonBetween": {
      "lower": [
        4
      ],
      "upper": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "AgentChatThreadSort": {
      "field": [
        327
      ],
      "direction": [
        328
      ],
      "nulls": [
        329
      ],
      "__typename": [
        1
      ]
    },
    "AgentChatThreadSortFields": {},
    "SortDirection": {},
    "SortNulls": {},
    "EventLogQueryInput": {
      "table": [
        331
      ],
      "filters": [
        332
      ],
      "first": [
        16
      ],
      "after": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "EventLogTable": {},
    "EventLogFiltersInput": {
      "eventType": [
        1
      ],
      "userWorkspaceId": [
        1
      ],
      "dateRange": [
        333
      ],
      "recordId": [
        1
      ],
      "objectMetadataId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "EventLogDateRangeInput": {
      "start": [
        4
      ],
      "end": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "PieChartDataInput": {
      "objectMetadataId": [
        3
      ],
      "configuration": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "LineChartDataInput": {
      "objectMetadataId": [
        3
      ],
      "configuration": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "BarChartDataInput": {
      "objectMetadataId": [
        3
      ],
      "configuration": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "Mutation": {
      "addQueryToEventStream": [
        6,
        {
          "input": [
            338,
            "AddQuerySubscriptionInput!"
          ]
        }
      ],
      "removeQueryFromEventStream": [
        6,
        {
          "input": [
            339,
            "RemoveQueryFromEventStreamInput!"
          ]
        }
      ],
      "createObjectEvent": [
        121,
        {
          "event": [
            1,
            "String!"
          ],
          "recordId": [
            3,
            "UUID!"
          ],
          "objectMetadataId": [
            3,
            "UUID!"
          ],
          "properties": [
            14
          ]
        }
      ],
      "trackAnalytics": [
        121,
        {
          "type": [
            340,
            "AnalyticsType!"
          ],
          "name": [
            1
          ],
          "event": [
            1
          ],
          "properties": [
            14
          ]
        }
      ],
      "createPageLayoutWidget": [
        74,
        {
          "input": [
            341,
            "CreatePageLayoutWidgetInput!"
          ]
        }
      ],
      "updatePageLayoutWidget": [
        74,
        {
          "id": [
            1,
            "String!"
          ],
          "input": [
            343,
            "UpdatePageLayoutWidgetInput!"
          ]
        }
      ],
      "destroyPageLayoutWidget": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "createPageLayoutTab": [
        109,
        {
          "input": [
            344,
            "CreatePageLayoutTabInput!"
          ]
        }
      ],
      "updatePageLayoutTab": [
        109,
        {
          "id": [
            1,
            "String!"
          ],
          "input": [
            345,
            "UpdatePageLayoutTabInput!"
          ]
        }
      ],
      "destroyPageLayoutTab": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "createPageLayout": [
        110,
        {
          "input": [
            346,
            "CreatePageLayoutInput!"
          ]
        }
      ],
      "updatePageLayout": [
        110,
        {
          "id": [
            1,
            "String!"
          ],
          "input": [
            347,
            "UpdatePageLayoutInput!"
          ]
        }
      ],
      "destroyPageLayout": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "updatePageLayoutWithTabsAndWidgets": [
        110,
        {
          "id": [
            1,
            "String!"
          ],
          "input": [
            348,
            "UpdatePageLayoutWithTabsInput!"
          ]
        }
      ],
      "deleteOneLogicFunction": [
        30,
        {
          "input": [
            319,
            "LogicFunctionIdInput!"
          ]
        }
      ],
      "createOneLogicFunction": [
        30,
        {
          "input": [
            351,
            "CreateLogicFunctionFromSourceInput!"
          ]
        }
      ],
      "executeOneLogicFunction": [
        212,
        {
          "input": [
            352,
            "ExecuteOneLogicFunctionInput!"
          ]
        }
      ],
      "updateOneLogicFunction": [
        6,
        {
          "input": [
            353,
            "UpdateLogicFunctionFromSourceInput!"
          ]
        }
      ],
      "createOneObject": [
        44,
        {
          "input": [
            355,
            "CreateOneObjectInput!"
          ]
        }
      ],
      "deleteOneObject": [
        44,
        {
          "input": [
            357,
            "DeleteOneObjectInput!"
          ]
        }
      ],
      "updateOneObject": [
        44,
        {
          "input": [
            358,
            "UpdateOneObjectInput!"
          ]
        }
      ],
      "updateCoreViewField": [
        48,
        {
          "input": [
            360,
            "UpdateViewFieldInput!"
          ]
        }
      ],
      "createCoreViewField": [
        48,
        {
          "input": [
            362,
            "CreateViewFieldInput!"
          ]
        }
      ],
      "createManyCoreViewFields": [
        48,
        {
          "inputs": [
            362,
            "[CreateViewFieldInput!]!"
          ]
        }
      ],
      "deleteCoreViewField": [
        48,
        {
          "input": [
            363,
            "DeleteViewFieldInput!"
          ]
        }
      ],
      "destroyCoreViewField": [
        48,
        {
          "input": [
            364,
            "DestroyViewFieldInput!"
          ]
        }
      ],
      "createCoreView": [
        58,
        {
          "input": [
            365,
            "CreateViewInput!"
          ]
        }
      ],
      "updateCoreView": [
        58,
        {
          "id": [
            1,
            "String!"
          ],
          "input": [
            366,
            "UpdateViewInput!"
          ]
        }
      ],
      "deleteCoreView": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "destroyCoreView": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "createCoreViewSort": [
        55,
        {
          "input": [
            367,
            "CreateViewSortInput!"
          ]
        }
      ],
      "updateCoreViewSort": [
        55,
        {
          "input": [
            368,
            "UpdateViewSortInput!"
          ]
        }
      ],
      "deleteCoreViewSort": [
        6,
        {
          "input": [
            370,
            "DeleteViewSortInput!"
          ]
        }
      ],
      "destroyCoreViewSort": [
        6,
        {
          "input": [
            371,
            "DestroyViewSortInput!"
          ]
        }
      ],
      "createCoreViewGroup": [
        54,
        {
          "input": [
            372,
            "CreateViewGroupInput!"
          ]
        }
      ],
      "createManyCoreViewGroups": [
        54,
        {
          "inputs": [
            372,
            "[CreateViewGroupInput!]!"
          ]
        }
      ],
      "updateCoreViewGroup": [
        54,
        {
          "input": [
            373,
            "UpdateViewGroupInput!"
          ]
        }
      ],
      "deleteCoreViewGroup": [
        54,
        {
          "input": [
            375,
            "DeleteViewGroupInput!"
          ]
        }
      ],
      "destroyCoreViewGroup": [
        54,
        {
          "input": [
            376,
            "DestroyViewGroupInput!"
          ]
        }
      ],
      "createCoreViewFilterGroup": [
        50,
        {
          "input": [
            377,
            "CreateViewFilterGroupInput!"
          ]
        }
      ],
      "updateCoreViewFilterGroup": [
        50,
        {
          "id": [
            1,
            "String!"
          ],
          "input": [
            378,
            "UpdateViewFilterGroupInput!"
          ]
        }
      ],
      "deleteCoreViewFilterGroup": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "destroyCoreViewFilterGroup": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "createCoreViewFilter": [
        52,
        {
          "input": [
            379,
            "CreateViewFilterInput!"
          ]
        }
      ],
      "updateCoreViewFilter": [
        52,
        {
          "input": [
            380,
            "UpdateViewFilterInput!"
          ]
        }
      ],
      "deleteCoreViewFilter": [
        52,
        {
          "input": [
            382,
            "DeleteViewFilterInput!"
          ]
        }
      ],
      "destroyCoreViewFilter": [
        52,
        {
          "input": [
            383,
            "DestroyViewFilterInput!"
          ]
        }
      ],
      "updateCoreViewFieldGroup": [
        57,
        {
          "input": [
            384,
            "UpdateViewFieldGroupInput!"
          ]
        }
      ],
      "createCoreViewFieldGroup": [
        57,
        {
          "input": [
            386,
            "CreateViewFieldGroupInput!"
          ]
        }
      ],
      "createManyCoreViewFieldGroups": [
        57,
        {
          "inputs": [
            386,
            "[CreateViewFieldGroupInput!]!"
          ]
        }
      ],
      "deleteCoreViewFieldGroup": [
        57,
        {
          "input": [
            387,
            "DeleteViewFieldGroupInput!"
          ]
        }
      ],
      "destroyCoreViewFieldGroup": [
        57,
        {
          "input": [
            388,
            "DestroyViewFieldGroupInput!"
          ]
        }
      ],
      "upsertFieldsWidget": [
        58,
        {
          "input": [
            389,
            "UpsertFieldsWidgetInput!"
          ]
        }
      ],
      "createCommandMenuItem": [
        220,
        {
          "input": [
            392,
            "CreateCommandMenuItemInput!"
          ]
        }
      ],
      "updateCommandMenuItem": [
        220,
        {
          "input": [
            393,
            "UpdateCommandMenuItemInput!"
          ]
        }
      ],
      "deleteCommandMenuItem": [
        220,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "createFrontComponent": [
        219,
        {
          "input": [
            394,
            "CreateFrontComponentInput!"
          ]
        }
      ],
      "updateFrontComponent": [
        219,
        {
          "input": [
            395,
            "UpdateFrontComponentInput!"
          ]
        }
      ],
      "deleteFrontComponent": [
        219,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "createOneAgent": [
        24,
        {
          "input": [
            397,
            "CreateAgentInput!"
          ]
        }
      ],
      "updateOneAgent": [
        24,
        {
          "input": [
            398,
            "UpdateAgentInput!"
          ]
        }
      ],
      "deleteOneAgent": [
        24,
        {
          "input": [
            321,
            "AgentIdInput!"
          ]
        }
      ],
      "uploadAIChatFile": [
        145,
        {
          "file": [
            399,
            "Upload!"
          ]
        }
      ],
      "uploadWorkflowFile": [
        145,
        {
          "file": [
            399,
            "Upload!"
          ]
        }
      ],
      "uploadWorkspaceLogo": [
        145,
        {
          "file": [
            399,
            "Upload!"
          ]
        }
      ],
      "uploadWorkspaceMemberProfilePicture": [
        145,
        {
          "file": [
            399,
            "Upload!"
          ]
        }
      ],
      "uploadFilesFieldFile": [
        145,
        {
          "file": [
            399,
            "Upload!"
          ],
          "fieldMetadataId": [
            1,
            "String!"
          ]
        }
      ],
      "uploadFilesFieldFileByUniversalIdentifier": [
        145,
        {
          "file": [
            399,
            "Upload!"
          ],
          "fieldMetadataUniversalIdentifier": [
            1,
            "String!"
          ]
        }
      ],
      "checkoutSession": [
        141,
        {
          "recurringInterval": [
            129,
            "SubscriptionInterval!"
          ],
          "plan": [
            125,
            "BillingPlanKey!"
          ],
          "requirePaymentMethod": [
            6,
            "Boolean!"
          ],
          "successUrlPath": [
            1
          ]
        }
      ],
      "switchSubscriptionInterval": [
        142
      ],
      "switchBillingPlan": [
        142
      ],
      "cancelSwitchBillingPlan": [
        142
      ],
      "cancelSwitchBillingInterval": [
        142
      ],
      "setMeteredSubscriptionPrice": [
        142,
        {
          "priceId": [
            1,
            "String!"
          ]
        }
      ],
      "endSubscriptionTrialPeriod": [
        138
      ],
      "cancelSwitchMeteredPrice": [
        142
      ],
      "updateWorkspaceMemberRole": [
        20,
        {
          "workspaceMemberId": [
            3,
            "UUID!"
          ],
          "roleId": [
            3,
            "UUID!"
          ]
        }
      ],
      "createOneRole": [
        28,
        {
          "createRoleInput": [
            400,
            "CreateRoleInput!"
          ]
        }
      ],
      "updateOneRole": [
        28,
        {
          "updateRoleInput": [
            401,
            "UpdateRoleInput!"
          ]
        }
      ],
      "deleteOneRole": [
        1,
        {
          "roleId": [
            3,
            "UUID!"
          ]
        }
      ],
      "upsertObjectPermissions": [
        15,
        {
          "upsertObjectPermissionsInput": [
            403,
            "UpsertObjectPermissionsInput!"
          ]
        }
      ],
      "upsertPermissionFlags": [
        26,
        {
          "upsertPermissionFlagsInput": [
            405,
            "UpsertPermissionFlagsInput!"
          ]
        }
      ],
      "upsertFieldPermissions": [
        25,
        {
          "upsertFieldPermissionsInput": [
            406,
            "UpsertFieldPermissionsInput!"
          ]
        }
      ],
      "upsertRowLevelPermissionPredicates": [
        178,
        {
          "input": [
            408,
            "UpsertRowLevelPermissionPredicatesInput!"
          ]
        }
      ],
      "assignRoleToAgent": [
        6,
        {
          "agentId": [
            3,
            "UUID!"
          ],
          "roleId": [
            3,
            "UUID!"
          ]
        }
      ],
      "removeRoleFromAgent": [
        6,
        {
          "agentId": [
            3,
            "UUID!"
          ]
        }
      ],
      "skipSyncEmailOnboardingStep": [
        143
      ],
      "skipBookOnboardingStep": [
        143
      ],
      "deleteWorkspaceInvitation": [
        1,
        {
          "appTokenId": [
            1,
            "String!"
          ]
        }
      ],
      "resendWorkspaceInvitation": [
        147,
        {
          "appTokenId": [
            1,
            "String!"
          ]
        }
      ],
      "sendInvitations": [
        147,
        {
          "emails": [
            1,
            "[String!]!"
          ],
          "roleId": [
            3
          ]
        }
      ],
      "createApprovedAccessDomain": [
        144,
        {
          "input": [
            411,
            "CreateApprovedAccessDomainInput!"
          ]
        }
      ],
      "deleteApprovedAccessDomain": [
        6,
        {
          "input": [
            412,
            "DeleteApprovedAccessDomainInput!"
          ]
        }
      ],
      "validateApprovedAccessDomain": [
        144,
        {
          "input": [
            413,
            "ValidateApprovedAccessDomainInput!"
          ]
        }
      ],
      "createApiKey": [
        2,
        {
          "input": [
            414,
            "CreateApiKeyInput!"
          ]
        }
      ],
      "updateApiKey": [
        2,
        {
          "input": [
            415,
            "UpdateApiKeyInput!"
          ]
        }
      ],
      "revokeApiKey": [
        2,
        {
          "input": [
            416,
            "RevokeApiKeyInput!"
          ]
        }
      ],
      "assignRoleToApiKey": [
        6,
        {
          "apiKeyId": [
            3,
            "UUID!"
          ],
          "roleId": [
            3,
            "UUID!"
          ]
        }
      ],
      "createOneField": [
        32,
        {
          "input": [
            417,
            "CreateOneFieldMetadataInput!"
          ]
        }
      ],
      "updateOneField": [
        32,
        {
          "input": [
            419,
            "UpdateOneFieldMetadataInput!"
          ]
        }
      ],
      "deleteOneField": [
        32,
        {
          "input": [
            421,
            "DeleteOneFieldInput!"
          ]
        }
      ],
      "deleteUser": [
        67
      ],
      "deleteUserFromWorkspace": [
        17,
        {
          "workspaceMemberIdToDelete": [
            1,
            "String!"
          ]
        }
      ],
      "updateUserEmail": [
        6,
        {
          "newEmail": [
            1,
            "String!"
          ],
          "verifyEmailRedirectPath": [
            1
          ]
        }
      ],
      "resendEmailVerificationToken": [
        148,
        {
          "email": [
            1,
            "String!"
          ],
          "origin": [
            1,
            "String!"
          ]
        }
      ],
      "activateWorkspace": [
        64,
        {
          "data": [
            422,
            "ActivateWorkspaceInput!"
          ]
        }
      ],
      "updateWorkspace": [
        64,
        {
          "data": [
            423,
            "UpdateWorkspaceInput!"
          ]
        }
      ],
      "deleteCurrentWorkspace": [
        64
      ],
      "checkCustomDomainValidRecords": [
        159
      ],
      "getAuthorizationUrlForSSO": [
        200,
        {
          "input": [
            424,
            "GetAuthorizationUrlForSSOInput!"
          ]
        }
      ],
      "getLoginTokenFromCredentials": [
        209,
        {
          "email": [
            1,
            "String!"
          ],
          "password": [
            1,
            "String!"
          ],
          "captchaToken": [
            1
          ],
          "locale": [
            1
          ],
          "verifyEmailRedirectPath": [
            1
          ],
          "origin": [
            1,
            "String!"
          ]
        }
      ],
      "signIn": [
        198,
        {
          "email": [
            1,
            "String!"
          ],
          "password": [
            1,
            "String!"
          ],
          "captchaToken": [
            1
          ],
          "locale": [
            1
          ],
          "verifyEmailRedirectPath": [
            1
          ]
        }
      ],
      "verifyEmailAndGetLoginToken": [
        206,
        {
          "emailVerificationToken": [
            1,
            "String!"
          ],
          "email": [
            1,
            "String!"
          ],
          "captchaToken": [
            1
          ],
          "origin": [
            1,
            "String!"
          ]
        }
      ],
      "verifyEmailAndGetWorkspaceAgnosticToken": [
        198,
        {
          "emailVerificationToken": [
            1,
            "String!"
          ],
          "email": [
            1,
            "String!"
          ],
          "captchaToken": [
            1
          ]
        }
      ],
      "getAuthTokensFromOTP": [
        208,
        {
          "otp": [
            1,
            "String!"
          ],
          "loginToken": [
            1,
            "String!"
          ],
          "captchaToken": [
            1
          ],
          "origin": [
            1,
            "String!"
          ]
        }
      ],
      "signUp": [
        198,
        {
          "email": [
            1,
            "String!"
          ],
          "password": [
            1,
            "String!"
          ],
          "captchaToken": [
            1
          ],
          "locale": [
            1
          ],
          "verifyEmailRedirectPath": [
            1
          ]
        }
      ],
      "signUpInWorkspace": [
        203,
        {
          "email": [
            1,
            "String!"
          ],
          "password": [
            1,
            "String!"
          ],
          "workspaceId": [
            3
          ],
          "workspaceInviteHash": [
            1
          ],
          "workspacePersonalInviteToken": [
            1
          ],
          "captchaToken": [
            1
          ],
          "locale": [
            1
          ],
          "verifyEmailRedirectPath": [
            1
          ]
        }
      ],
      "signUpInNewWorkspace": [
        203
      ],
      "generateTransientToken": [
        204
      ],
      "getAuthTokensFromLoginToken": [
        208,
        {
          "loginToken": [
            1,
            "String!"
          ],
          "origin": [
            1,
            "String!"
          ]
        }
      ],
      "authorizeApp": [
        195,
        {
          "clientId": [
            1,
            "String!"
          ],
          "codeChallenge": [
            1
          ],
          "redirectUrl": [
            1,
            "String!"
          ],
          "state": [
            1
          ],
          "scope": [
            1
          ]
        }
      ],
      "renewToken": [
        208,
        {
          "appToken": [
            1,
            "String!"
          ]
        }
      ],
      "generateApiKeyToken": [
        207,
        {
          "apiKeyId": [
            3,
            "UUID!"
          ],
          "expiresAt": [
            1,
            "String!"
          ]
        }
      ],
      "emailPasswordResetLink": [
        199,
        {
          "email": [
            1,
            "String!"
          ],
          "workspaceId": [
            3
          ]
        }
      ],
      "updatePasswordViaResetToken": [
        201,
        {
          "passwordResetToken": [
            1,
            "String!"
          ],
          "newPassword": [
            1,
            "String!"
          ]
        }
      ],
      "createApplicationRegistration": [
        184,
        {
          "input": [
            425,
            "CreateApplicationRegistrationInput!"
          ]
        }
      ],
      "updateApplicationRegistration": [
        7,
        {
          "input": [
            426,
            "UpdateApplicationRegistrationInput!"
          ]
        }
      ],
      "deleteApplicationRegistration": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "rotateApplicationRegistrationClientSecret": [
        186,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "createApplicationRegistrationVariable": [
        5,
        {
          "input": [
            428,
            "CreateApplicationRegistrationVariableInput!"
          ]
        }
      ],
      "updateApplicationRegistrationVariable": [
        5,
        {
          "input": [
            429,
            "UpdateApplicationRegistrationVariableInput!"
          ]
        }
      ],
      "deleteApplicationRegistrationVariable": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "initiateOTPProvisioning": [
        193,
        {
          "loginToken": [
            1,
            "String!"
          ],
          "origin": [
            1,
            "String!"
          ]
        }
      ],
      "initiateOTPProvisioningForAuthenticatedUser": [
        193
      ],
      "deleteTwoFactorAuthenticationMethod": [
        192,
        {
          "twoFactorAuthenticationMethodId": [
            3,
            "UUID!"
          ]
        }
      ],
      "verifyTwoFactorAuthenticationMethodForAuthenticatedUser": [
        194,
        {
          "otp": [
            1,
            "String!"
          ]
        }
      ],
      "createOIDCIdentityProvider": [
        191,
        {
          "input": [
            431,
            "SetupOIDCSsoInput!"
          ]
        }
      ],
      "createSAMLIdentityProvider": [
        191,
        {
          "input": [
            432,
            "SetupSAMLSsoInput!"
          ]
        }
      ],
      "deleteSSOIdentityProvider": [
        187,
        {
          "input": [
            433,
            "DeleteSsoInput!"
          ]
        }
      ],
      "editSSOIdentityProvider": [
        188,
        {
          "input": [
            434,
            "EditSsoInput!"
          ]
        }
      ],
      "createIngestionPipeline": [
        234,
        {
          "input": [
            435,
            "CreateIngestionPipelineInput!"
          ]
        }
      ],
      "updateIngestionPipeline": [
        234,
        {
          "input": [
            436,
            "UpdateIngestionPipelineInput!"
          ]
        }
      ],
      "deleteIngestionPipeline": [
        234,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "triggerIngestionPull": [
        233,
        {
          "pipelineId": [
            3,
            "UUID!"
          ]
        }
      ],
      "testIngestionPipeline": [
        235,
        {
          "input": [
            438,
            "TestIngestionPipelineInput!"
          ]
        }
      ],
      "createIngestionFieldMapping": [
        232,
        {
          "input": [
            439,
            "CreateIngestionFieldMappingInput!"
          ]
        }
      ],
      "createIngestionFieldMappings": [
        232,
        {
          "inputs": [
            439,
            "[CreateIngestionFieldMappingInput!]!"
          ]
        }
      ],
      "updateIngestionFieldMapping": [
        232,
        {
          "input": [
            440,
            "UpdateIngestionFieldMappingInput!"
          ]
        }
      ],
      "deleteIngestionFieldMapping": [
        6,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "createWebhook": [
        236,
        {
          "input": [
            442,
            "CreateWebhookInput!"
          ]
        }
      ],
      "updateWebhook": [
        236,
        {
          "input": [
            443,
            "UpdateWebhookInput!"
          ]
        }
      ],
      "deleteWebhook": [
        236,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "createChatThread": [
        222
      ],
      "createSkill": [
        217,
        {
          "input": [
            445,
            "CreateSkillInput!"
          ]
        }
      ],
      "updateSkill": [
        217,
        {
          "input": [
            446,
            "UpdateSkillInput!"
          ]
        }
      ],
      "deleteSkill": [
        217,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "activateSkill": [
        217,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "deactivateSkill": [
        217,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "evaluateAgentTurn": [
        228,
        {
          "turnId": [
            3,
            "UUID!"
          ]
        }
      ],
      "runEvaluationInput": [
        229,
        {
          "agentId": [
            3,
            "UUID!"
          ],
          "input": [
            1,
            "String!"
          ]
        }
      ],
      "createNavigationMenuItem": [
        231,
        {
          "input": [
            447,
            "CreateNavigationMenuItemInput!"
          ]
        }
      ],
      "updateNavigationMenuItem": [
        231,
        {
          "input": [
            448,
            "UpdateOneNavigationMenuItemInput!"
          ]
        }
      ],
      "deleteNavigationMenuItem": [
        231,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "duplicateDashboard": [
        314,
        {
          "id": [
            3,
            "UUID!"
          ]
        }
      ],
      "impersonate": [
        282,
        {
          "userId": [
            3,
            "UUID!"
          ],
          "workspaceId": [
            3,
            "UUID!"
          ]
        }
      ],
      "startChannelSync": [
        306,
        {
          "connectedAccountId": [
            3,
            "UUID!"
          ]
        }
      ],
      "saveImapSmtpCaldavAccount": [
        304,
        {
          "accountOwnerId": [
            3,
            "UUID!"
          ],
          "handle": [
            1,
            "String!"
          ],
          "connectionParameters": [
            450,
            "EmailAccountConnectionParameters!"
          ],
          "id": [
            3
          ]
        }
      ],
      "updateLabPublicFeatureFlag": [
        160,
        {
          "input": [
            452,
            "UpdateLabPublicFeatureFlagInput!"
          ]
        }
      ],
      "userLookupAdminPanel": [
        273,
        {
          "userIdentifier": [
            1,
            "String!"
          ]
        }
      ],
      "updateWorkspaceFeatureFlag": [
        6,
        {
          "workspaceId": [
            3,
            "UUID!"
          ],
          "featureFlag": [
            1,
            "String!"
          ],
          "value": [
            6,
            "Boolean!"
          ]
        }
      ],
      "setAdminAiModelEnabled": [
        6,
        {
          "modelId": [
            1,
            "String!"
          ],
          "enabled": [
            6,
            "Boolean!"
          ]
        }
      ],
      "createDatabaseConfigVariable": [
        6,
        {
          "key": [
            1,
            "String!"
          ],
          "value": [
            14,
            "JSON!"
          ]
        }
      ],
      "updateDatabaseConfigVariable": [
        6,
        {
          "key": [
            1,
            "String!"
          ],
          "value": [
            14,
            "JSON!"
          ]
        }
      ],
      "deleteDatabaseConfigVariable": [
        6,
        {
          "key": [
            1,
            "String!"
          ]
        }
      ],
      "retryJobs": [
        266,
        {
          "queueName": [
            1,
            "String!"
          ],
          "jobIds": [
            1,
            "[String!]!"
          ]
        }
      ],
      "deleteJobs": [
        261,
        {
          "queueName": [
            1,
            "String!"
          ],
          "jobIds": [
            1,
            "[String!]!"
          ]
        }
      ],
      "enablePostgresProxy": [
        305
      ],
      "disablePostgresProxy": [
        305
      ],
      "createPublicDomain": [
        293,
        {
          "domain": [
            1,
            "String!"
          ]
        }
      ],
      "deletePublicDomain": [
        6,
        {
          "domain": [
            1,
            "String!"
          ]
        }
      ],
      "checkPublicDomainValidRecords": [
        159,
        {
          "domain": [
            1,
            "String!"
          ]
        }
      ],
      "createEmailingDomain": [
        295,
        {
          "domain": [
            1,
            "String!"
          ],
          "driver": [
            296,
            "EmailingDomainDriver!"
          ]
        }
      ],
      "deleteEmailingDomain": [
        6,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "verifyEmailingDomain": [
        295,
        {
          "id": [
            1,
            "String!"
          ]
        }
      ],
      "createOneAppToken": [
        66,
        {
          "input": [
            453,
            "CreateOneAppTokenInput!"
          ]
        }
      ],
      "renewApplicationToken": [
        218,
        {
          "applicationRefreshToken": [
            1,
            "String!"
          ]
        }
      ],
      "installApplication": [
        6,
        {
          "workspaceMigration": [
            455,
            "WorkspaceMigrationInput!"
          ]
        }
      ],
      "uninstallApplication": [
        6,
        {
          "universalIdentifier": [
            1,
            "String!"
          ]
        }
      ],
      "generateApplicationToken": [
        218,
        {
          "applicationId": [
            3,
            "UUID!"
          ]
        }
      ],
      "syncApplication": [
        283,
        {
          "manifest": [
            14,
            "JSON!"
          ]
        }
      ],
      "createOneApplication": [
        47,
        {
          "input": [
            459,
            "CreateApplicationInput!"
          ]
        }
      ],
      "uploadApplicationFile": [
        284,
        {
          "file": [
            399,
            "Upload!"
          ],
          "applicationUniversalIdentifier": [
            1,
            "String!"
          ],
          "fileFolder": [
            460,
            "FileFolder!"
          ],
          "filePath": [
            1,
            "String!"
          ]
        }
      ],
      "installMarketplaceApp": [
        6
      ],
      "updateOneApplicationVariable": [
        6,
        {
          "key": [
            1,
            "String!"
          ],
          "value": [
            1,
            "String!"
          ],
          "applicationId": [
            3,
            "UUID!"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "AddQuerySubscriptionInput": {
      "eventStreamId": [
        1
      ],
      "queryId": [
        1
      ],
      "operationSignature": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "RemoveQueryFromEventStreamInput": {
      "eventStreamId": [
        1
      ],
      "queryId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "AnalyticsType": {},
    "CreatePageLayoutWidgetInput": {
      "pageLayoutTabId": [
        3
      ],
      "title": [
        1
      ],
      "type": [
        75
      ],
      "objectMetadataId": [
        3
      ],
      "gridPosition": [
        342
      ],
      "position": [
        14
      ],
      "configuration": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "GridPositionInput": {
      "row": [
        10
      ],
      "column": [
        10
      ],
      "rowSpan": [
        10
      ],
      "columnSpan": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "UpdatePageLayoutWidgetInput": {
      "title": [
        1
      ],
      "type": [
        75
      ],
      "objectMetadataId": [
        3
      ],
      "gridPosition": [
        342
      ],
      "position": [
        14
      ],
      "configuration": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "CreatePageLayoutTabInput": {
      "title": [
        1
      ],
      "position": [
        10
      ],
      "pageLayoutId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdatePageLayoutTabInput": {
      "title": [
        1
      ],
      "position": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "CreatePageLayoutInput": {
      "name": [
        1
      ],
      "type": [
        111
      ],
      "objectMetadataId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdatePageLayoutInput": {
      "name": [
        1
      ],
      "type": [
        111
      ],
      "objectMetadataId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdatePageLayoutWithTabsInput": {
      "name": [
        1
      ],
      "type": [
        111
      ],
      "objectMetadataId": [
        3
      ],
      "tabs": [
        349
      ],
      "__typename": [
        1
      ]
    },
    "UpdatePageLayoutTabWithWidgetsInput": {
      "id": [
        3
      ],
      "title": [
        1
      ],
      "position": [
        10
      ],
      "widgets": [
        350
      ],
      "__typename": [
        1
      ]
    },
    "UpdatePageLayoutWidgetWithIdInput": {
      "id": [
        3
      ],
      "pageLayoutTabId": [
        3
      ],
      "title": [
        1
      ],
      "type": [
        75
      ],
      "objectMetadataId": [
        3
      ],
      "gridPosition": [
        342
      ],
      "position": [
        14
      ],
      "configuration": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "CreateLogicFunctionFromSourceInput": {
      "id": [
        3
      ],
      "universalIdentifier": [
        3
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "timeoutSeconds": [
        10
      ],
      "toolInputSchema": [
        14
      ],
      "isTool": [
        6
      ],
      "source": [
        14
      ],
      "cronTriggerSettings": [
        14
      ],
      "databaseEventTriggerSettings": [
        14
      ],
      "httpRouteTriggerSettings": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "ExecuteOneLogicFunctionInput": {
      "id": [
        3
      ],
      "payload": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "UpdateLogicFunctionFromSourceInput": {
      "id": [
        3
      ],
      "update": [
        354
      ],
      "__typename": [
        1
      ]
    },
    "UpdateLogicFunctionFromSourceInputUpdates": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "timeoutSeconds": [
        10
      ],
      "sourceHandlerCode": [
        1
      ],
      "toolInputSchema": [
        14
      ],
      "handlerName": [
        1
      ],
      "sourceHandlerPath": [
        1
      ],
      "isTool": [
        6
      ],
      "cronTriggerSettings": [
        14
      ],
      "databaseEventTriggerSettings": [
        14
      ],
      "httpRouteTriggerSettings": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "CreateOneObjectInput": {
      "object": [
        356
      ],
      "__typename": [
        1
      ]
    },
    "CreateObjectInput": {
      "nameSingular": [
        1
      ],
      "namePlural": [
        1
      ],
      "labelSingular": [
        1
      ],
      "labelPlural": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "shortcut": [
        1
      ],
      "skipNameField": [
        6
      ],
      "isRemote": [
        6
      ],
      "primaryKeyColumnType": [
        1
      ],
      "primaryKeyFieldMetadataSettings": [
        14
      ],
      "isLabelSyncedWithName": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "DeleteOneObjectInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateOneObjectInput": {
      "update": [
        359
      ],
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateObjectPayload": {
      "labelSingular": [
        1
      ],
      "labelPlural": [
        1
      ],
      "nameSingular": [
        1
      ],
      "namePlural": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "shortcut": [
        1
      ],
      "isActive": [
        6
      ],
      "labelIdentifierFieldMetadataId": [
        3
      ],
      "imageIdentifierFieldMetadataId": [
        3
      ],
      "isLabelSyncedWithName": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewFieldInput": {
      "id": [
        3
      ],
      "update": [
        361
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewFieldInputUpdates": {
      "isVisible": [
        6
      ],
      "size": [
        10
      ],
      "position": [
        10
      ],
      "aggregateOperation": [
        49
      ],
      "viewFieldGroupId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateViewFieldInput": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "viewId": [
        3
      ],
      "isVisible": [
        6
      ],
      "size": [
        10
      ],
      "position": [
        10
      ],
      "aggregateOperation": [
        49
      ],
      "viewFieldGroupId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "DeleteViewFieldInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "DestroyViewFieldInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateViewInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "objectMetadataId": [
        3
      ],
      "type": [
        59
      ],
      "key": [
        60
      ],
      "icon": [
        1
      ],
      "position": [
        10
      ],
      "isCompact": [
        6
      ],
      "shouldHideEmptyGroups": [
        6
      ],
      "openRecordIn": [
        61
      ],
      "kanbanAggregateOperation": [
        49
      ],
      "kanbanAggregateOperationFieldMetadataId": [
        3
      ],
      "anyFieldFilterValue": [
        1
      ],
      "calendarLayout": [
        62
      ],
      "calendarFieldMetadataId": [
        3
      ],
      "mainGroupByFieldMetadataId": [
        3
      ],
      "visibility": [
        63
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "type": [
        59
      ],
      "icon": [
        1
      ],
      "position": [
        10
      ],
      "isCompact": [
        6
      ],
      "openRecordIn": [
        61
      ],
      "kanbanAggregateOperation": [
        49
      ],
      "kanbanAggregateOperationFieldMetadataId": [
        3
      ],
      "anyFieldFilterValue": [
        1
      ],
      "calendarLayout": [
        62
      ],
      "calendarFieldMetadataId": [
        3
      ],
      "visibility": [
        63
      ],
      "mainGroupByFieldMetadataId": [
        3
      ],
      "shouldHideEmptyGroups": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CreateViewSortInput": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "direction": [
        56
      ],
      "viewId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewSortInput": {
      "id": [
        3
      ],
      "update": [
        369
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewSortInputUpdates": {
      "direction": [
        56
      ],
      "__typename": [
        1
      ]
    },
    "DeleteViewSortInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "DestroyViewSortInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateViewGroupInput": {
      "id": [
        3
      ],
      "isVisible": [
        6
      ],
      "fieldValue": [
        1
      ],
      "position": [
        10
      ],
      "viewId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewGroupInput": {
      "id": [
        3
      ],
      "update": [
        374
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewGroupInputUpdates": {
      "fieldMetadataId": [
        3
      ],
      "isVisible": [
        6
      ],
      "fieldValue": [
        1
      ],
      "position": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "DeleteViewGroupInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "DestroyViewGroupInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateViewFilterGroupInput": {
      "id": [
        3
      ],
      "parentViewFilterGroupId": [
        3
      ],
      "logicalOperator": [
        51
      ],
      "positionInViewFilterGroup": [
        10
      ],
      "viewId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewFilterGroupInput": {
      "id": [
        3
      ],
      "parentViewFilterGroupId": [
        3
      ],
      "logicalOperator": [
        51
      ],
      "positionInViewFilterGroup": [
        10
      ],
      "viewId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateViewFilterInput": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "operand": [
        53
      ],
      "value": [
        14
      ],
      "viewFilterGroupId": [
        3
      ],
      "positionInViewFilterGroup": [
        10
      ],
      "subFieldName": [
        1
      ],
      "viewId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewFilterInput": {
      "id": [
        3
      ],
      "update": [
        381
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewFilterInputUpdates": {
      "fieldMetadataId": [
        3
      ],
      "operand": [
        53
      ],
      "value": [
        14
      ],
      "viewFilterGroupId": [
        3
      ],
      "positionInViewFilterGroup": [
        10
      ],
      "subFieldName": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "DeleteViewFilterInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "DestroyViewFilterInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewFieldGroupInput": {
      "id": [
        3
      ],
      "update": [
        385
      ],
      "__typename": [
        1
      ]
    },
    "UpdateViewFieldGroupInputUpdates": {
      "name": [
        1
      ],
      "position": [
        10
      ],
      "isVisible": [
        6
      ],
      "deletedAt": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CreateViewFieldGroupInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "viewId": [
        3
      ],
      "position": [
        10
      ],
      "isVisible": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "DeleteViewFieldGroupInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "DestroyViewFieldGroupInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpsertFieldsWidgetInput": {
      "widgetId": [
        3
      ],
      "groups": [
        390
      ],
      "fields": [
        391
      ],
      "__typename": [
        1
      ]
    },
    "UpsertFieldsWidgetGroupInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "position": [
        10
      ],
      "isVisible": [
        6
      ],
      "fields": [
        391
      ],
      "__typename": [
        1
      ]
    },
    "UpsertFieldsWidgetFieldInput": {
      "viewFieldId": [
        3
      ],
      "isVisible": [
        6
      ],
      "position": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "CreateCommandMenuItemInput": {
      "workflowVersionId": [
        3
      ],
      "frontComponentId": [
        3
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "isPinned": [
        6
      ],
      "availabilityType": [
        221
      ],
      "conditionalAvailabilityExpression": [
        1
      ],
      "availabilityObjectMetadataId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateCommandMenuItemInput": {
      "id": [
        3
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "isPinned": [
        6
      ],
      "availabilityType": [
        221
      ],
      "availabilityObjectMetadataId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateFrontComponentInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "sourceComponentPath": [
        1
      ],
      "builtComponentPath": [
        1
      ],
      "componentName": [
        1
      ],
      "builtComponentChecksum": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "UpdateFrontComponentInput": {
      "id": [
        3
      ],
      "update": [
        396
      ],
      "__typename": [
        1
      ]
    },
    "UpdateFrontComponentInputUpdates": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CreateAgentInput": {
      "name": [
        1
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "description": [
        1
      ],
      "prompt": [
        1
      ],
      "modelId": [
        1
      ],
      "roleId": [
        3
      ],
      "responseFormat": [
        14
      ],
      "modelConfiguration": [
        14
      ],
      "evaluationInputs": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "UpdateAgentInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "description": [
        1
      ],
      "prompt": [
        1
      ],
      "modelId": [
        1
      ],
      "roleId": [
        3
      ],
      "responseFormat": [
        14
      ],
      "modelConfiguration": [
        14
      ],
      "evaluationInputs": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "Upload": {},
    "CreateRoleInput": {
      "id": [
        1
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "canUpdateAllSettings": [
        6
      ],
      "canAccessAllTools": [
        6
      ],
      "canReadAllObjectRecords": [
        6
      ],
      "canUpdateAllObjectRecords": [
        6
      ],
      "canSoftDeleteAllObjectRecords": [
        6
      ],
      "canDestroyAllObjectRecords": [
        6
      ],
      "showAllObjectsInSidebar": [
        6
      ],
      "canBeAssignedToUsers": [
        6
      ],
      "canBeAssignedToAgents": [
        6
      ],
      "canBeAssignedToApiKeys": [
        6
      ],
      "editWindowMinutes": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "UpdateRoleInput": {
      "update": [
        402
      ],
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateRolePayload": {
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "canUpdateAllSettings": [
        6
      ],
      "canAccessAllTools": [
        6
      ],
      "canReadAllObjectRecords": [
        6
      ],
      "canUpdateAllObjectRecords": [
        6
      ],
      "canSoftDeleteAllObjectRecords": [
        6
      ],
      "canDestroyAllObjectRecords": [
        6
      ],
      "showAllObjectsInSidebar": [
        6
      ],
      "canBeAssignedToUsers": [
        6
      ],
      "canBeAssignedToAgents": [
        6
      ],
      "canBeAssignedToApiKeys": [
        6
      ],
      "editWindowMinutes": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "UpsertObjectPermissionsInput": {
      "roleId": [
        3
      ],
      "objectPermissions": [
        404
      ],
      "__typename": [
        1
      ]
    },
    "ObjectPermissionInput": {
      "objectMetadataId": [
        3
      ],
      "canReadObjectRecords": [
        6
      ],
      "canUpdateObjectRecords": [
        6
      ],
      "canSoftDeleteObjectRecords": [
        6
      ],
      "canDestroyObjectRecords": [
        6
      ],
      "showInSidebar": [
        6
      ],
      "editWindowMinutes": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "UpsertPermissionFlagsInput": {
      "roleId": [
        3
      ],
      "permissionFlagKeys": [
        18
      ],
      "__typename": [
        1
      ]
    },
    "UpsertFieldPermissionsInput": {
      "roleId": [
        3
      ],
      "fieldPermissions": [
        407
      ],
      "__typename": [
        1
      ]
    },
    "FieldPermissionInput": {
      "objectMetadataId": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "canReadFieldValue": [
        6
      ],
      "canUpdateFieldValue": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "UpsertRowLevelPermissionPredicatesInput": {
      "roleId": [
        3
      ],
      "objectMetadataId": [
        3
      ],
      "predicates": [
        409
      ],
      "predicateGroups": [
        410
      ],
      "__typename": [
        1
      ]
    },
    "RowLevelPermissionPredicateInput": {
      "id": [
        3
      ],
      "fieldMetadataId": [
        3
      ],
      "operand": [
        13
      ],
      "value": [
        14
      ],
      "subFieldName": [
        1
      ],
      "workspaceMemberFieldMetadataId": [
        1
      ],
      "workspaceMemberSubFieldName": [
        1
      ],
      "rowLevelPermissionPredicateGroupId": [
        3
      ],
      "positionInRowLevelPermissionPredicateGroup": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "RowLevelPermissionPredicateGroupInput": {
      "id": [
        3
      ],
      "objectMetadataId": [
        3
      ],
      "parentRowLevelPermissionPredicateGroupId": [
        3
      ],
      "logicalOperator": [
        11
      ],
      "positionInRowLevelPermissionPredicateGroup": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "CreateApprovedAccessDomainInput": {
      "domain": [
        1
      ],
      "email": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "DeleteApprovedAccessDomainInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "ValidateApprovedAccessDomainInput": {
      "validationToken": [
        1
      ],
      "approvedAccessDomainId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateApiKeyInput": {
      "name": [
        1
      ],
      "expiresAt": [
        1
      ],
      "revokedAt": [
        1
      ],
      "roleId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "UpdateApiKeyInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "expiresAt": [
        1
      ],
      "revokedAt": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "RevokeApiKeyInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "CreateOneFieldMetadataInput": {
      "field": [
        418
      ],
      "__typename": [
        1
      ]
    },
    "CreateFieldInput": {
      "type": [
        33
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "isCustom": [
        6
      ],
      "isActive": [
        6
      ],
      "isSystem": [
        6
      ],
      "isUIReadOnly": [
        6
      ],
      "isNullable": [
        6
      ],
      "isUnique": [
        6
      ],
      "defaultValue": [
        14
      ],
      "options": [
        14
      ],
      "settings": [
        14
      ],
      "isLabelSyncedWithName": [
        6
      ],
      "relationTargetObjectMetadataId": [
        3
      ],
      "objectMetadataId": [
        3
      ],
      "isRemoteCreation": [
        6
      ],
      "relationCreationPayload": [
        14
      ],
      "morphRelationsCreationPayload": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "UpdateOneFieldMetadataInput": {
      "id": [
        3
      ],
      "update": [
        420
      ],
      "__typename": [
        1
      ]
    },
    "UpdateFieldInput": {
      "universalIdentifier": [
        3
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "description": [
        1
      ],
      "icon": [
        1
      ],
      "isActive": [
        6
      ],
      "isSystem": [
        6
      ],
      "isUIReadOnly": [
        6
      ],
      "isNullable": [
        6
      ],
      "isUnique": [
        6
      ],
      "defaultValue": [
        14
      ],
      "options": [
        14
      ],
      "settings": [
        14
      ],
      "isLabelSyncedWithName": [
        6
      ],
      "relationTargetObjectMetadataId": [
        3
      ],
      "morphRelationsUpdatePayload": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "DeleteOneFieldInput": {
      "id": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "ActivateWorkspaceInput": {
      "displayName": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "UpdateWorkspaceInput": {
      "subdomain": [
        1
      ],
      "customDomain": [
        1
      ],
      "displayName": [
        1
      ],
      "logo": [
        1
      ],
      "inviteHash": [
        1
      ],
      "isPublicInviteLinkEnabled": [
        6
      ],
      "allowImpersonation": [
        6
      ],
      "isGoogleAuthEnabled": [
        6
      ],
      "isMicrosoftAuthEnabled": [
        6
      ],
      "isPasswordAuthEnabled": [
        6
      ],
      "isGoogleAuthBypassEnabled": [
        6
      ],
      "isMicrosoftAuthBypassEnabled": [
        6
      ],
      "isPasswordAuthBypassEnabled": [
        6
      ],
      "defaultRoleId": [
        3
      ],
      "isTwoFactorAuthenticationEnforced": [
        6
      ],
      "trashRetentionDays": [
        10
      ],
      "eventLogRetentionDays": [
        10
      ],
      "fastModel": [
        1
      ],
      "smartModel": [
        1
      ],
      "aiAdditionalInstructions": [
        1
      ],
      "editableProfileFields": [
        1
      ],
      "autoEnableNewAiModels": [
        6
      ],
      "disabledAiModelIds": [
        1
      ],
      "enabledAiModelIds": [
        1
      ],
      "useRecommendedModels": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "GetAuthorizationUrlForSSOInput": {
      "identityProviderId": [
        3
      ],
      "workspaceInviteHash": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CreateApplicationRegistrationInput": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "logoUrl": [
        1
      ],
      "author": [
        1
      ],
      "universalIdentifier": [
        1
      ],
      "oAuthRedirectUris": [
        1
      ],
      "oAuthScopes": [
        1
      ],
      "websiteUrl": [
        1
      ],
      "termsUrl": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "UpdateApplicationRegistrationInput": {
      "id": [
        1
      ],
      "update": [
        427
      ],
      "__typename": [
        1
      ]
    },
    "UpdateApplicationRegistrationPayload": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "logoUrl": [
        1
      ],
      "author": [
        1
      ],
      "oAuthRedirectUris": [
        1
      ],
      "oAuthScopes": [
        1
      ],
      "websiteUrl": [
        1
      ],
      "termsUrl": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CreateApplicationRegistrationVariableInput": {
      "applicationRegistrationId": [
        1
      ],
      "key": [
        1
      ],
      "value": [
        1
      ],
      "description": [
        1
      ],
      "isSecret": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "UpdateApplicationRegistrationVariableInput": {
      "id": [
        1
      ],
      "update": [
        430
      ],
      "__typename": [
        1
      ]
    },
    "UpdateApplicationRegistrationVariablePayload": {
      "value": [
        1
      ],
      "description": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "SetupOIDCSsoInput": {
      "name": [
        1
      ],
      "issuer": [
        1
      ],
      "clientID": [
        1
      ],
      "clientSecret": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "SetupSAMLSsoInput": {
      "name": [
        1
      ],
      "issuer": [
        1
      ],
      "id": [
        3
      ],
      "ssoURL": [
        1
      ],
      "certificate": [
        1
      ],
      "fingerprint": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "DeleteSsoInput": {
      "identityProviderId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "EditSsoInput": {
      "id": [
        3
      ],
      "status": [
        152
      ],
      "__typename": [
        1
      ]
    },
    "CreateIngestionPipelineInput": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "mode": [
        1
      ],
      "targetObjectNameSingular": [
        1
      ],
      "sourceUrl": [
        1
      ],
      "sourceHttpMethod": [
        1
      ],
      "sourceAuthConfig": [
        14
      ],
      "sourceRequestConfig": [
        14
      ],
      "responseRecordsPath": [
        1
      ],
      "schedule": [
        1
      ],
      "dedupFieldName": [
        1
      ],
      "paginationConfig": [
        14
      ],
      "isEnabled": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "UpdateIngestionPipelineInput": {
      "id": [
        3
      ],
      "update": [
        437
      ],
      "__typename": [
        1
      ]
    },
    "UpdateIngestionPipelineInputUpdates": {
      "name": [
        1
      ],
      "description": [
        1
      ],
      "mode": [
        1
      ],
      "targetObjectNameSingular": [
        1
      ],
      "sourceUrl": [
        1
      ],
      "sourceHttpMethod": [
        1
      ],
      "sourceAuthConfig": [
        14
      ],
      "sourceRequestConfig": [
        14
      ],
      "responseRecordsPath": [
        1
      ],
      "schedule": [
        1
      ],
      "dedupFieldName": [
        1
      ],
      "paginationConfig": [
        14
      ],
      "isEnabled": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "TestIngestionPipelineInput": {
      "pipelineId": [
        3
      ],
      "sampleRecords": [
        14
      ],
      "__typename": [
        1
      ]
    },
    "CreateIngestionFieldMappingInput": {
      "pipelineId": [
        3
      ],
      "sourceFieldPath": [
        1
      ],
      "targetFieldName": [
        1
      ],
      "targetCompositeSubField": [
        1
      ],
      "transform": [
        14
      ],
      "relationTargetObjectName": [
        1
      ],
      "relationMatchFieldName": [
        1
      ],
      "relationAutoCreate": [
        6
      ],
      "position": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "UpdateIngestionFieldMappingInput": {
      "id": [
        3
      ],
      "update": [
        441
      ],
      "__typename": [
        1
      ]
    },
    "UpdateIngestionFieldMappingInputUpdates": {
      "sourceFieldPath": [
        1
      ],
      "targetFieldName": [
        1
      ],
      "targetCompositeSubField": [
        1
      ],
      "transform": [
        14
      ],
      "relationTargetObjectName": [
        1
      ],
      "relationMatchFieldName": [
        1
      ],
      "relationAutoCreate": [
        6
      ],
      "position": [
        16
      ],
      "__typename": [
        1
      ]
    },
    "CreateWebhookInput": {
      "id": [
        3
      ],
      "targetUrl": [
        1
      ],
      "operations": [
        1
      ],
      "description": [
        1
      ],
      "secret": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "UpdateWebhookInput": {
      "id": [
        3
      ],
      "update": [
        444
      ],
      "__typename": [
        1
      ]
    },
    "UpdateWebhookInputUpdates": {
      "targetUrl": [
        1
      ],
      "operations": [
        1
      ],
      "description": [
        1
      ],
      "secret": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "CreateSkillInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "description": [
        1
      ],
      "content": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "UpdateSkillInput": {
      "id": [
        3
      ],
      "name": [
        1
      ],
      "label": [
        1
      ],
      "icon": [
        1
      ],
      "description": [
        1
      ],
      "content": [
        1
      ],
      "isActive": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CreateNavigationMenuItemInput": {
      "userWorkspaceId": [
        3
      ],
      "targetRecordId": [
        3
      ],
      "targetObjectMetadataId": [
        3
      ],
      "viewId": [
        3
      ],
      "name": [
        1
      ],
      "link": [
        1
      ],
      "icon": [
        1
      ],
      "color": [
        1
      ],
      "folderId": [
        3
      ],
      "position": [
        10
      ],
      "__typename": [
        1
      ]
    },
    "UpdateOneNavigationMenuItemInput": {
      "id": [
        3
      ],
      "update": [
        449
      ],
      "__typename": [
        1
      ]
    },
    "UpdateNavigationMenuItemInput": {
      "folderId": [
        3
      ],
      "position": [
        10
      ],
      "name": [
        1
      ],
      "link": [
        1
      ],
      "icon": [
        1
      ],
      "color": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "EmailAccountConnectionParameters": {
      "IMAP": [
        451
      ],
      "SMTP": [
        451
      ],
      "CALDAV": [
        451
      ],
      "__typename": [
        1
      ]
    },
    "ConnectionParameters": {
      "host": [
        1
      ],
      "port": [
        10
      ],
      "username": [
        1
      ],
      "password": [
        1
      ],
      "secure": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "UpdateLabPublicFeatureFlagInput": {
      "publicFeatureFlag": [
        1
      ],
      "value": [
        6
      ],
      "__typename": [
        1
      ]
    },
    "CreateOneAppTokenInput": {
      "appToken": [
        454
      ],
      "__typename": [
        1
      ]
    },
    "CreateAppTokenInput": {
      "expiresAt": [
        4
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMigrationInput": {
      "actions": [
        456
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMigrationDeleteActionInput": {
      "type": [
        457
      ],
      "metadataName": [
        458
      ],
      "universalIdentifier": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "WorkspaceMigrationActionType": {},
    "AllMetadataName": {},
    "CreateApplicationInput": {
      "universalIdentifier": [
        1
      ],
      "name": [
        1
      ],
      "description": [
        1
      ],
      "version": [
        1
      ],
      "sourcePath": [
        1
      ],
      "applicationRegistrationId": [
        1
      ],
      "__typename": [
        1
      ]
    },
    "FileFolder": {},
    "Subscription": {
      "onDbEvent": [
        120,
        {
          "input": [
            462,
            "OnDbEventInput!"
          ]
        }
      ],
      "onEventSubscription": [
        119,
        {
          "eventStreamId": [
            1,
            "String!"
          ]
        }
      ],
      "logicFunctionLogs": [
        214,
        {
          "input": [
            463,
            "LogicFunctionLogsInput!"
          ]
        }
      ],
      "__typename": [
        1
      ]
    },
    "OnDbEventInput": {
      "action": [
        116
      ],
      "objectNameSingular": [
        1
      ],
      "recordId": [
        3
      ],
      "__typename": [
        1
      ]
    },
    "LogicFunctionLogsInput": {
      "applicationId": [
        3
      ],
      "applicationUniversalIdentifier": [
        3
      ],
      "name": [
        1
      ],
      "id": [
        3
      ],
      "universalIdentifier": [
        3
      ],
      "__typename": [
        1
      ]
    }
  }
};

// node_modules/twenty-sdk/generated/metadata/index.ts
var typeMap2 = linkTypeMap2(types_default2);
var defaultOptions2 = {
  url: `${process.env.TWENTY_API_URL}/metadata`,
  headers: {
    "Content-Type": "application/json"
  }
};

// src/logic-functions/analyze-call-compliance.ts
var resolveAgentName = async (agentId) => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token = process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
  if (!apiBaseUrl || !token) return null;
  const response = await fetch(`${apiBaseUrl}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      query: `query { agentProfile(filter: { id: { eq: "${agentId}" } }) { name } }`
    })
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.data?.agentProfile?.name ?? null;
};
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
  return analysis.recommendations.map((r) => {
    if (typeof r === "string") return r;
    const category = r.category ? `[${r.category.charAt(0).toUpperCase() + r.category.slice(1)}]` : "";
    return `**${r.priority}** ${category} \u2014 ${r.title}
${r.detail}`;
  }).join("\n\n");
};
var handler = async (event) => {
  const body = event.body;
  if (!body?.recordingUrl && !body?.transcript) {
    throw new Error(
      "Must provide either recordingUrl or transcript in request body"
    );
  }
  const client = new CoreApiClient();
  const recordingUrl = body.recordingUrl;
  let agentName = body.agentName;
  if (!agentName && body.agentId) {
    console.log("[analyze] Resolving agent name for", body.agentId);
    agentName = await resolveAgentName(body.agentId) ?? void 0;
    console.log("[analyze] Resolved agent name:", agentName ?? "not found");
  }
  const linkRelations = async (scorecardId2) => {
    const updateFields = {};
    if (body.agentId) updateFields.agentProfileId = body.agentId;
    if (body.callId) updateFields.callId = body.callId;
    if (Object.keys(updateFields).length === 0) return;
    try {
      const apiBaseUrl = process.env.TWENTY_API_URL;
      const token = process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;
      if (!apiBaseUrl || !token) return;
      const dataStr = Object.entries(updateFields).map(([k, v]) => `${k}: "${v}"`).join(", ");
      await fetch(`${apiBaseUrl}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: `mutation { updateQaScorecard(id: "${scorecardId2}", data: { ${dataStr} }) { id } }`
        })
      });
      console.log(
        "[analyze] Linked relations to scorecard",
        scorecardId2,
        updateFields
      );
    } catch (err) {
      console.warn("[analyze] Failed to link relations:", err);
    }
  };
  let transcriptMarkdown = body.transcript ?? "";
  if (!transcriptMarkdown && recordingUrl) {
    console.log("[analyze] Transcribing recording...");
    try {
      const transcription = await transcribeRecording(recordingUrl);
      transcriptMarkdown = transcription.markdown;
    } catch (transcriptionError) {
      console.warn(
        "[analyze] Transcription failed, creating SKIPPED scorecard:",
        transcriptionError
      );
      const agentLabel2 = agentName || "Unknown Agent";
      const dateStr2 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const scorecardName2 = `QA - ${agentLabel2} - ${body.callName || dateStr2}`;
      const errorMsg = transcriptionError instanceof Error ? transcriptionError.message : "Unknown transcription error";
      const scorecardData2 = {
        name: scorecardName2,
        overallScore: 0,
        overallResult: "NOT_APPLICABLE",
        callType: "GENERAL",
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
          markdown: `Transcription failed: ${errorMsg}`
        },
        status: "SKIPPED",
        analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const result2 = await client.mutation({
        createQaScorecard: {
          __args: { data: scorecardData2 },
          id: true,
          name: true,
          status: true
        }
      });
      const scorecardId2 = result2.createQaScorecard?.id;
      if (scorecardId2) {
        await linkRelations(scorecardId2);
      }
      return {
        scorecardId: scorecardId2,
        overallScore: 0,
        overallResult: "NOT_APPLICABLE",
        hasRedFlag: false,
        callQuality: "NOT_SCORABLE",
        error: errorMsg
      };
    }
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
  const isNotScorable = redFlagAnalysis.callQuality === "NOT_SCORABLE";
  const agentLabel = agentName || "Unknown Agent";
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const scorecardName = `QA - ${agentLabel} - ${body.callName || dateStr}`;
  if (isNotScorable) {
    console.log(
      "[analyze] Call classified as NOT_SCORABLE \u2014 skipping full scorecard analysis"
    );
    const scorecardData2 = {
      name: scorecardName,
      overallScore: 0,
      overallResult: "NOT_APPLICABLE",
      callType: redFlagAnalysis.callType || "GENERAL",
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
      status: "SKIPPED",
      analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const result2 = await client.mutation({
      createQaScorecard: {
        __args: { data: scorecardData2 },
        id: true,
        name: true,
        overallScore: true,
        overallResult: true,
        hasRedFlag: true,
        status: true
      }
    });
    const scorecardId2 = result2.createQaScorecard?.id;
    if (scorecardId2) {
      await linkRelations(scorecardId2);
    }
    console.log(
      "[analyze] QA Scorecard created (SKIPPED):",
      JSON.stringify({
        id: scorecardId2,
        score: 0,
        result: "NOT_APPLICABLE",
        hasRedFlag: false,
        callType: redFlagAnalysis.callType
      })
    );
    return {
      scorecardId: scorecardId2,
      overallScore: 0,
      overallResult: "NOT_APPLICABLE",
      hasRedFlag: false,
      callType: redFlagAnalysis.callType,
      callQuality: "NOT_SCORABLE",
      redFlags: Object.fromEntries(
        RED_FLAGS.map((flag) => [flag.key, false])
      )
    };
  }
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
  console.log("[analyze] Creating QA Scorecard record...");
  const scoreDetails = buildScoreDetailsMarkdown(scorecardAnalysis);
  const redFlagDetails = buildRedFlagDetailsMarkdown(redFlagAnalysis);
  const recommendations = buildRecommendationsMarkdown(scorecardAnalysis);
  const scorecardData = {
    name: scorecardName,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    callType: redFlagAnalysis.callType || "GENERAL",
    redFlagRecordedLine: redFlagAnalysis.redFlags.recordedLineDisclosure?.violated ?? false,
    redFlagMarketplace: redFlagAnalysis.redFlags.marketplaceDisclosure?.violated ?? false,
    redFlagAor: redFlagAnalysis.redFlags.aorDisclosure?.violated ?? false,
    redFlagCommission: redFlagAnalysis.redFlags.commissionDisclosure?.violated ?? false,
    redFlagHealthSherpa: redFlagAnalysis.redFlags.healthSherpaDisclosure?.violated ?? false,
    redFlagAgentCoaching: redFlagAnalysis.redFlags.agentCoaching?.violated ?? false,
    redFlagDncViolation: redFlagAnalysis.redFlags.dncViolation?.violated ?? false,
    hasRedFlag,
    openingScore: sectionScores.opening ?? 0,
    factFindingScore: sectionScores.factFinding ?? 0,
    eligibilityScore: sectionScores.eligibility ?? 0,
    presentationScore: sectionScores.presentation ?? 0,
    applicationScore: sectionScores.application ?? 0,
    closingScore: sectionScores.closing ?? 0,
    scoreDetails: { blocknote: null, markdown: scoreDetails },
    transcript: { blocknote: null, markdown: transcriptMarkdown },
    status: "COMPLETED",
    analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (redFlagDetails) {
    scorecardData.redFlagDetails = {
      blocknote: null,
      markdown: redFlagDetails
    };
  }
  if (recommendations) {
    scorecardData.recommendations = {
      blocknote: null,
      markdown: recommendations
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
      status: true
    }
  });
  const scorecardId = result.createQaScorecard?.id;
  if (scorecardId) {
    await linkRelations(scorecardId);
  }
  console.log(
    "[analyze] QA Scorecard created:",
    JSON.stringify({
      id: scorecardId,
      score: overallScore,
      result: scorecardAnalysis.overallResult,
      hasRedFlag,
      callType: redFlagAnalysis.callType
    })
  );
  return {
    scorecardId,
    overallScore,
    overallResult: scorecardAnalysis.overallResult,
    hasRedFlag,
    callType: redFlagAnalysis.callType,
    callQuality: "SCORABLE",
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
