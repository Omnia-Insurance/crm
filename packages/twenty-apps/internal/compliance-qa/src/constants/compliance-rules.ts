// Omnia Insurance Group — Compliance QA Rules
// All scripts, disclosures, scoring criteria, and red flag definitions
// for automated QA scoring of insurance sales calls.

// ============================================================
// Red Flag Auto-Fail Definitions
// ============================================================

export type RedFlagKey =
  | 'recordedLineDisclosure'
  | 'marketplaceDisclosure'
  | 'aorDisclosure'
  | 'commissionDisclosure'
  | 'healthSherpaDisclosure'
  | 'agentCoaching'
  | 'dncViolation';

export type RedFlagDefinition = {
  key: RedFlagKey;
  label: string;
  description: string;
  scorecardField: string;
  keywords: string[];
  aiPromptGuidance: string;
};

export const RED_FLAGS: RedFlagDefinition[] = [
  {
    key: 'recordedLineDisclosure',
    label: 'Recorded Line Disclosure',
    description:
      'Agent must disclose the call is being recorded within the first 30 seconds',
    scorecardField: 'redFlagRecordedLine',
    keywords: [
      'recorded line',
      'being recorded',
      'call is recorded',
      'call may be recorded',
      'monitored and recorded',
      'quality assurance',
    ],
    aiPromptGuidance:
      'Check if the agent clearly informed the consumer that the call is being recorded. This must happen within approximately the first 30 seconds of the call. Look for phrases like "this call is being recorded" or "you are on a recorded line".',
  },
  {
    key: 'marketplaceDisclosure',
    label: 'Marketplace Disclosure',
    description:
      'Agent must disclose they are not directly associated with the Health Insurance Marketplace or any government agency',
    scorecardField: 'redFlagMarketplace',
    keywords: [
      'not the marketplace',
      'not directly associated',
      'not a government',
      'private insurance agency',
      'licensed insurance agency',
      'not affiliated with',
    ],
    aiPromptGuidance:
      'Check if the agent clearly stated they are NOT directly associated with the Health Insurance Marketplace, healthcare.gov, or any government agency. The agent should identify themselves as a private/licensed insurance agency.',
  },
  {
    key: 'aorDisclosure',
    label: 'Agent of Record (AOR) Disclosure',
    description:
      'Agent must properly handle the Agent of Record disclosure — inform consumer they will become their agent and what that means',
    scorecardField: 'redFlagAor',
    keywords: [
      'agent of record',
      'your agent',
      'assigned agent',
      'broker of record',
      'represent you',
    ],
    aiPromptGuidance:
      'Check if the agent explained the Agent of Record (AOR) relationship. The agent should inform the consumer that by proceeding, the agent will become their designated agent/broker of record for their health insurance plan. If this is a transfer/re-enrollment, the agent must explain the AOR change.',
  },
  {
    key: 'commissionDisclosure',
    label: 'Commission Disclosure',
    description:
      'Agent must disclose that they are compensated via commission at no additional cost to the consumer',
    scorecardField: 'redFlagCommission',
    keywords: [
      'commission',
      'compensated',
      'no cost to you',
      'no additional cost',
      'free service',
      'no charge',
      'paid by the insurance',
    ],
    aiPromptGuidance:
      'Check if the agent disclosed that their services are commission-based and that there is no additional cost to the consumer. The agent should explain they are compensated by the insurance carrier, not the consumer.',
  },
  {
    key: 'healthSherpaDisclosure',
    label: 'HealthSherpa Disclosure',
    description:
      'When using HealthSherpa for enrollment, agent must provide the HealthSherpa-required disclosure',
    scorecardField: 'redFlagHealthSherpa',
    keywords: [
      'healthsherpa',
      'health sherpa',
      'enrollment platform',
      'third-party platform',
      'secure website',
    ],
    aiPromptGuidance:
      'Check if the agent mentioned HealthSherpa or the enrollment platform when completing the application. If HealthSherpa was used for enrollment, the agent must have disclosed they are using a third-party enrollment platform. Only flag this if the call involves an ACA enrollment.',
  },
  {
    key: 'agentCoaching',
    label: 'Agent Coaching',
    description:
      'Agent must NOT coach consumers on how to answer health or eligibility questions to manipulate outcomes',
    scorecardField: 'redFlagAgentCoaching',
    keywords: [
      'just say',
      'tell them',
      "don't mention",
      'leave that out',
      "don't tell",
      'say you',
    ],
    aiPromptGuidance:
      'Check if the agent coached or instructed the consumer on how to answer health questions, income questions, or eligibility questions in a way that would manipulate the outcome. Examples: telling a consumer to say they dont have a condition, instructing them to report different income, or coaching them to answer verification questions incorrectly. This is a CRITICAL violation.',
  },
  {
    key: 'dncViolation',
    label: 'DNC Violation',
    description:
      'If the consumer requests to be placed on the Do Not Call list, the agent must comply immediately',
    scorecardField: 'redFlagDncViolation',
    keywords: [
      'do not call',
      'stop calling',
      'remove my number',
      'take me off',
      'dont call me',
      "don't call me",
      'dnc',
    ],
    aiPromptGuidance:
      'Check if the consumer requested to be placed on the Do Not Call list or asked to stop receiving calls. If so, verify the agent acknowledged the request and did not attempt to continue the sales pitch. The agent must comply immediately and not try to talk the consumer out of it.',
  },
];

// ============================================================
// Required Scripts and Openers
// ============================================================

export type ScriptType = 'OUTBOUND' | 'INBOUND' | 'CALLBACK';

export type RequiredScript = {
  type: ScriptType;
  label: string;
  template: string;
  requiredElements: string[];
};

export const REQUIRED_SCRIPTS: RequiredScript[] = [
  {
    type: 'OUTBOUND',
    label: 'Outbound Call Opener',
    template: `Hi, this is [Agent Name] with [Agency Name], a licensed insurance agency. This call is being recorded for quality assurance. I'm calling because you recently inquired about health insurance options. I want to let you know that we are not directly associated with the Health Insurance Marketplace or any government agency. We are a private licensed insurance agency. Our services are at no additional cost to you — we are compensated by the insurance carriers. Is this a good time to talk about your health insurance needs?`,
    requiredElements: [
      'Agent identifies themselves by name',
      'Agency name mentioned',
      'Licensed insurance agency',
      'Recorded line disclosure',
      'Not associated with marketplace/government',
      'Commission/no cost disclosure',
      'Permission to continue',
    ],
  },
  {
    type: 'INBOUND',
    label: 'Inbound Call Opener',
    template: `Thank you for calling [Agency Name], a licensed insurance agency. My name is [Agent Name]. This call is being recorded for quality assurance. Before we get started, I want to let you know that we are not directly associated with the Health Insurance Marketplace or any government agency. We are a private licensed insurance agency, and our services come at no additional cost to you. How can I help you today?`,
    requiredElements: [
      'Thank the caller',
      'Agency name mentioned',
      'Agent identifies themselves by name',
      'Recorded line disclosure',
      'Not associated with marketplace/government',
      'Commission/no cost disclosure',
    ],
  },
  {
    type: 'CALLBACK',
    label: 'Callback Opener',
    template: `Hi, this is [Agent Name] with [Agency Name] calling you back. This call is being recorded for quality assurance. We spoke previously about your health insurance options. I wanted to follow up on our conversation. As a reminder, we are a licensed insurance agency, not directly associated with the marketplace, and our services are at no cost to you. Do you have a few minutes to continue?`,
    requiredElements: [
      'Agent identifies themselves by name',
      'Reference to previous conversation',
      'Recorded line disclosure',
      'Not associated with marketplace (reminder)',
      'No cost reminder',
      'Permission to continue',
    ],
  },
];

// ============================================================
// QA Scorecard Section Criteria
// ============================================================

export type ScoringCriterion = {
  id: string;
  label: string;
  description: string;
  maxPoints: number;
  acaOnly?: boolean;
  ancillaryOnly?: boolean;
};

export type ScoringSection = {
  id: string;
  label: string;
  description: string;
  criteria: ScoringCriterion[];
};

export const SCORING_SECTIONS: ScoringSection[] = [
  {
    id: 'opening',
    label: 'Opening',
    description:
      'How the agent opens the call — introductions, disclosures, and setting expectations',
    criteria: [
      {
        id: 'opening-greeting',
        label: 'Professional Greeting',
        description:
          'Agent greets the consumer professionally, states their name and agency',
        maxPoints: 15,
      },
      {
        id: 'opening-recorded-line',
        label: 'Recorded Line Disclosure',
        description:
          'Agent discloses the call is being recorded (within first 30 seconds)',
        maxPoints: 20,
      },
      {
        id: 'opening-marketplace-disclosure',
        label: 'Marketplace/Government Disclosure',
        description:
          'Agent states they are not associated with the marketplace or government',
        maxPoints: 20,
      },
      {
        id: 'opening-commission-disclosure',
        label: 'Commission/No Cost Disclosure',
        description:
          'Agent discloses services are commission-based at no cost to consumer',
        maxPoints: 15,
      },
      {
        id: 'opening-permission',
        label: 'Permission to Proceed',
        description:
          'Agent asks if the consumer has time or is ready to proceed',
        maxPoints: 10,
      },
      {
        id: 'opening-rapport',
        label: 'Rapport Building',
        description:
          'Agent builds rapport — friendly, professional tone, engages the consumer',
        maxPoints: 20,
      },
    ],
  },
  {
    id: 'factFinding',
    label: 'Fact Finding',
    description:
      'How thoroughly the agent gathers information about the consumer',
    criteria: [
      {
        id: 'ff-household',
        label: 'Household Information',
        description:
          'Agent asks about household size, dependents, and who needs coverage',
        maxPoints: 20,
      },
      {
        id: 'ff-income',
        label: 'Income Verification',
        description:
          'Agent asks about income to determine subsidy eligibility (ACA)',
        maxPoints: 20,
        acaOnly: true,
      },
      {
        id: 'ff-current-coverage',
        label: 'Current Coverage',
        description:
          'Agent asks about current insurance status and any existing coverage',
        maxPoints: 15,
      },
      {
        id: 'ff-health-needs',
        label: 'Health Needs Assessment',
        description:
          'Agent asks about medical needs, doctors, prescriptions, conditions',
        maxPoints: 25,
      },
      {
        id: 'ff-budget',
        label: 'Budget Discussion',
        description:
          'Agent discusses budget expectations and premium affordability',
        maxPoints: 20,
      },
    ],
  },
  {
    id: 'eligibility',
    label: 'Eligibility',
    description:
      'How the agent determines and explains plan eligibility (ACA-specific)',
    criteria: [
      {
        id: 'elig-sep-qle',
        label: 'SEP/QLE Verification',
        description:
          'Agent verifies if there is a qualifying life event for Special Enrollment Period',
        maxPoints: 25,
        acaOnly: true,
      },
      {
        id: 'elig-subsidy',
        label: 'Subsidy Explanation',
        description:
          'Agent explains premium tax credits and how subsidies work',
        maxPoints: 25,
        acaOnly: true,
      },
      {
        id: 'elig-medicaid',
        label: 'Medicaid/CHIP Screening',
        description:
          'Agent screens for Medicaid/CHIP eligibility before ACA plans',
        maxPoints: 25,
        acaOnly: true,
      },
      {
        id: 'elig-documentation',
        label: 'Documentation Requirements',
        description:
          'Agent explains what documents may be needed for enrollment',
        maxPoints: 25,
      },
    ],
  },
  {
    id: 'presentation',
    label: 'Presentation',
    description: 'How the agent presents plan options to the consumer',
    criteria: [
      {
        id: 'pres-options',
        label: 'Multiple Plan Options',
        description:
          'Agent presents multiple plan options for comparison, not just one',
        maxPoints: 20,
      },
      {
        id: 'pres-benefits',
        label: 'Benefits Explanation',
        description:
          'Agent clearly explains plan benefits, deductibles, copays, and max out-of-pocket',
        maxPoints: 25,
      },
      {
        id: 'pres-network',
        label: 'Network/Provider Discussion',
        description:
          'Agent discusses provider networks and whether consumer doctors are in-network',
        maxPoints: 20,
      },
      {
        id: 'pres-prescription',
        label: 'Prescription Coverage',
        description:
          'Agent addresses prescription drug coverage and formulary',
        maxPoints: 15,
      },
      {
        id: 'pres-recommendation',
        label: 'Clear Recommendation',
        description:
          'Agent provides a clear recommendation based on the consumer needs discussed',
        maxPoints: 20,
      },
    ],
  },
  {
    id: 'application',
    label: 'Application',
    description: 'How the agent handles the enrollment/application process',
    criteria: [
      {
        id: 'app-aor',
        label: 'AOR Disclosure',
        description:
          'Agent explains the Agent of Record relationship before enrollment',
        maxPoints: 25,
      },
      {
        id: 'app-healthsherpa',
        label: 'HealthSherpa Disclosure',
        description:
          'Agent provides required HealthSherpa disclosure when using the platform',
        maxPoints: 25,
        acaOnly: true,
      },
      {
        id: 'app-accuracy',
        label: 'Information Accuracy',
        description:
          'Agent verifies consumer information for accuracy during application',
        maxPoints: 25,
      },
      {
        id: 'app-consent',
        label: 'Consumer Consent',
        description:
          'Agent obtains clear verbal consent before submitting the application',
        maxPoints: 25,
      },
    ],
  },
  {
    id: 'closing',
    label: 'Closing',
    description: 'How the agent closes the call and sets expectations',
    criteria: [
      {
        id: 'close-recap',
        label: 'Enrollment Recap',
        description:
          'Agent recaps the selected plan, effective date, and monthly premium',
        maxPoints: 25,
      },
      {
        id: 'close-next-steps',
        label: 'Next Steps',
        description:
          'Agent explains next steps (welcome packet, ID cards, first payment)',
        maxPoints: 25,
      },
      {
        id: 'close-contact',
        label: 'Contact Information',
        description:
          'Agent provides contact information for future questions or changes',
        maxPoints: 25,
      },
      {
        id: 'close-satisfaction',
        label: 'Satisfaction Check',
        description:
          'Agent asks if the consumer has any remaining questions or concerns',
        maxPoints: 25,
      },
    ],
  },
];

// ============================================================
// Call Type Detection Hints
// ============================================================

export const CALL_TYPE_HINTS = {
  ACA_SALE: [
    'marketplace',
    'obamacare',
    'affordable care act',
    'aca',
    'health insurance marketplace',
    'healthcare.gov',
    'subsidy',
    'premium tax credit',
    'open enrollment',
    'special enrollment',
    'qualifying life event',
  ],
  ANCILLARY: [
    'dental',
    'vision',
    'life insurance',
    'accident',
    'critical illness',
    'hospital indemnity',
    'supplemental',
    'gap coverage',
    'short-term',
    'short term',
  ],
};

// ============================================================
// AI System Prompts
// ============================================================

export const RED_FLAG_SYSTEM_PROMPT = `You are a compliance QA analyst for an insurance agency. Your job is to analyze call transcripts and detect critical compliance violations (red flags) that result in automatic failure.

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
- Set evidence/explanation to a brief reason (e.g. "Voicemail — no live conversation")
- Return immediately without further analysis

If the call is SCORABLE, set "callQuality" to "SCORABLE" and proceed to Step 2.

## Step 2: Red Flag Analysis (SCORABLE calls only)

You MUST be thorough and conservative — when in doubt about whether a disclosure was made, flag it. Missing a red flag is worse than a false positive.

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
- For disclosure flags (recordedLine, marketplace, commission, aor, healthSherpa): only flag as violated if the call progressed past the opening — the agent had a real conversation with the consumer. A 10-second call where the consumer hangs up immediately should NOT trigger missing disclosure flags.`;

export const FULL_SCORECARD_SYSTEM_PROMPT = `You are a compliance QA analyst for an insurance agency. You are scoring a call transcript against a detailed scorecard with 6 sections.

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
- Be specific with evidence — quote the transcript
- Recommendations must be structured objects with priority, category, title, and detail — NOT plain strings`;

export const SECTION_WEIGHTS: Record<string, number> = {
  opening: 0.15,
  factFinding: 0.2,
  eligibility: 0.15,
  presentation: 0.2,
  application: 0.15,
  closing: 0.15,
};
