export type QaRubricType = 'ACA_SALE' | 'ANCILLARY_ONLY' | 'UNKNOWN';

export type QaResult = 'PASS' | 'FAIL' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE';

export type QaProcessingStatus =
  | 'PENDING'
  | 'COPYING_RECORDING'
  | 'TRANSCRIBING'
  | 'SCORING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

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
  aiPromptGuidance: string;
};

export type ScoringCriterion = {
  id: string;
  label: string;
  description: string;
  appliesTo: 'ALL' | 'ACA_SALE' | 'ANCILLARY_ONLY';
};

export type ScoringSection = {
  id:
    | 'opening'
    | 'factFinding'
    | 'eligibility'
    | 'presentation'
    | 'application'
    | 'closing';
  label: string;
  weight: number;
  criteria: ScoringCriterion[];
};

export const PASSING_SCORE_EXCLUSIVE_THRESHOLD = 80;
export const FAIL_SCORE_THRESHOLD = 60;

export const SECTION_WEIGHTS: Record<ScoringSection['id'], number> = {
  opening: 0.15,
  factFinding: 0.2,
  eligibility: 0.15,
  presentation: 0.2,
  application: 0.15,
  closing: 0.15,
};

export const RED_FLAGS: RedFlagDefinition[] = [
  {
    key: 'recordedLineDisclosure',
    label: 'Recorded Line Disclosure',
    description:
      'Agent must state that the call is recorded for quality and compliance purposes on every call, callback, transfer, and when a new person joins.',
    aiPromptGuidance:
      'Flag as violated when a scorable call does not include a recorded-line disclosure near the beginning of the live conversation.',
  },
  {
    key: 'marketplaceDisclosure',
    label: 'Marketplace Disclosure',
    description:
      'Agent must read the Marketplace authorization disclosure before accessing or using Marketplace confidential information.',
    aiPromptGuidance:
      'Flag as violated when an ACA call requires Marketplace access/enrollment and the Marketplace authorization disclosure is missing or clearly not read.',
  },
  {
    key: 'aorDisclosure',
    label: 'Agent of Record Disclosure',
    description:
      'Agent must provide Agent of Record disclosure when taking over or becoming the consumer agent of record.',
    aiPromptGuidance:
      'Flag as violated when AOR is attempted or completed without explaining the agent-of-record relationship before enrollment or transfer.',
  },
  {
    key: 'commissionDisclosure',
    label: 'Commission Disclosure',
    description:
      'Agent must disclose that they may receive commission and that it does not impact the consumer premium or plan options.',
    aiPromptGuidance:
      'Flag as violated when a scorable sales/enrollment call does not include the required commission disclosure.',
  },
  {
    key: 'healthSherpaDisclosure',
    label: 'HealthSherpa Disclosure',
    description:
      'Agent must provide HealthSherpa disclosure when using HealthSherpa for ACA enrollment.',
    aiPromptGuidance:
      'Only evaluate when HealthSherpa or the enrollment platform is used. Flag missing required disclosure on ACA enrollment calls.',
  },
  {
    key: 'agentCoaching',
    label: 'Coaching or Manipulation',
    description:
      'Agent must not coach, manipulate, or tell the consumer how to answer eligibility, health, income, or application questions.',
    aiPromptGuidance:
      'Flag any instruction that appears designed to manipulate eligibility, health, income, identity, or application answers.',
  },
  {
    key: 'dncViolation',
    label: 'Do Not Call Violation',
    description:
      'Agent must immediately honor requests to stop calling or place the consumer on the Do Not Call list.',
    aiPromptGuidance:
      'Flag when the consumer asks not to be called and the agent continues selling, ignores the request, or does not acknowledge it.',
  },
];

export const SCORING_SECTIONS: ScoringSection[] = [
  {
    id: 'opening',
    label: 'Opening',
    weight: SECTION_WEIGHTS.opening,
    criteria: [
      {
        id: 'opening-energy-warmth',
        label: 'Energy and warmth',
        description:
          'Opens with energy, positivity, warmth, and a professional tone.',
        appliesTo: 'ALL',
      },
      {
        id: 'opening-agent-introduction',
        label: 'Licensed agent introduction',
        description:
          'Introduces self as a licensed agent and gives enough context for the consumer to understand who is calling.',
        appliesTo: 'ALL',
      },
      {
        id: 'opening-reason-authority',
        label: 'Reason and authority for call',
        description:
          'States why the call is occurring and establishes authority to discuss coverage.',
        appliesTo: 'ALL',
      },
      {
        id: 'opening-hipaa-identity',
        label: 'Identity confirmation',
        description:
          'Confirms consumer name, ZIP, DOB, or contact details when appropriate before discussing protected information.',
        appliesTo: 'ALL',
      },
      {
        id: 'opening-soft-skills',
        label: 'Soft skills and readiness',
        description:
          'Confirms readiness for the call and uses basic soft skills or rebuttals without pressure.',
        appliesTo: 'ALL',
      },
    ],
  },
  {
    id: 'factFinding',
    label: 'Fact Finding',
    weight: SECTION_WEIGHTS.factFinding,
    criteria: [
      {
        id: 'fact-transition-agenda',
        label: 'Discovery transition and agenda',
        description:
          'Transitions into discovery with a clear value proposition and agenda.',
        appliesTo: 'ACA_SALE',
      },
      {
        id: 'fact-open-ended-probing',
        label: 'Open-ended needs probing',
        description:
          'Uses open-ended questions to uncover needs, health conditions, tobacco use, prescriptions, and coverage concerns.',
        appliesTo: 'ACA_SALE',
      },
      {
        id: 'fact-motivation-preferences',
        label: 'Motivation and preferences',
        description:
          'Determines motivation, pain points, HMO/PPO preferences, emergency room use, and office visit frequency.',
        appliesTo: 'ALL',
      },
      {
        id: 'fact-recap',
        label: 'Recap of discovery',
        description: 'Recaps the information gathered before moving forward.',
        appliesTo: 'ALL',
      },
      {
        id: 'fact-attempts-aca',
        label: 'ACA attempt before ancillary',
        description:
          'Attempts to sell or evaluate ACA coverage before moving to ancillary-only products.',
        appliesTo: 'ANCILLARY_ONLY',
      },
    ],
  },
  {
    id: 'eligibility',
    label: 'Eligibility',
    weight: SECTION_WEIGHTS.eligibility,
    criteria: [
      {
        id: 'eligibility-qle',
        label: 'QLE confirmation',
        description:
          'Confirms qualifying life event within the last or upcoming 60 days when outside Open Enrollment.',
        appliesTo: 'ALL',
      },
      {
        id: 'eligibility-income-tax',
        label: 'Income and tax filing',
        description:
          'Asks household income and tax filing information for subsidy eligibility.',
        appliesTo: 'ACA_SALE',
      },
      {
        id: 'eligibility-other-products',
        label: 'Other product eligibility',
        description:
          'Determines eligibility for other core, ancillary, or UHF products where appropriate.',
        appliesTo: 'ALL',
      },
    ],
  },
  {
    id: 'presentation',
    label: 'Presentation',
    weight: SECTION_WEIGHTS.presentation,
    criteria: [
      {
        id: 'presentation-aor-attempt',
        label: 'AOR attempt',
        description:
          'Attempts AOR when applicable and not during Open Enrollment.',
        appliesTo: 'ALL',
      },
      {
        id: 'presentation-plan-order',
        label: 'ACA plan components in order',
        description:
          'Presents Carrier, Network, RX, Hospital, Deductible, Max OOP, then Premium.',
        appliesTo: 'ACA_SALE',
      },
      {
        id: 'presentation-benefits-value',
        label: 'Benefits and value',
        description:
          'Explains benefits and value clearly based on needs using non-misleading language.',
        appliesTo: 'ALL',
      },
      {
        id: 'presentation-assumptive-close',
        label: 'Assumptive close',
        description:
          'Uses an appropriate assumptive close and pauses after presenting premium or price.',
        appliesTo: 'ALL',
      },
      {
        id: 'presentation-no-misleading-info',
        label: 'No misleading plan information',
        description:
          'Avoids misleading statements about plan benefits, pricing, carriers, government affiliation, or eligibility.',
        appliesTo: 'ALL',
      },
      {
        id: 'presentation-upsell',
        label: 'Appropriate upsell',
        description:
          'Attempts appropriate ancillary upsell after the core close when applicable.',
        appliesTo: 'ACA_SALE',
      },
    ],
  },
  {
    id: 'application',
    label: 'Application',
    weight: SECTION_WEIGHTS.application,
    criteria: [
      {
        id: 'application-expectations',
        label: 'Application expectations',
        description:
          'Sets realistic expectations for application time and confirms payment method or e-sign availability.',
        appliesTo: 'ALL',
      },
      {
        id: 'application-verbatim-disclaimers',
        label: 'Verbatim questions and disclaimers',
        description:
          'Reads or sends required application questions, attestations, and disclaimers verbatim and records answers accurately.',
        appliesTo: 'ALL',
      },
      {
        id: 'application-commitment-esign',
        label: 'Commitment and e-sign',
        description:
          'Ensures client commitment and confirms e-sign capability or sends e-sign where required.',
        appliesTo: 'ALL',
      },
    ],
  },
  {
    id: 'closing',
    label: 'Closing',
    weight: SECTION_WEIGHTS.closing,
    criteria: [
      {
        id: 'closing-sale-summary',
        label: 'Sale summary',
        description:
          'Summarizes plan name, network, benefits, deductible, premium or price, effective dates, and next steps.',
        appliesTo: 'ALL',
      },
      {
        id: 'closing-eft-primary',
        label: 'EFT attempt for ancillary',
        description:
          'Attempts EFT as the primary payment method for ancillary products.',
        appliesTo: 'ANCILLARY_ONLY',
      },
      {
        id: 'closing-affordability',
        label: 'Ancillary affordability',
        description:
          'Explains ancillary pricing and confirms the customer agrees it is affordable.',
        appliesTo: 'ANCILLARY_ONLY',
      },
      {
        id: 'closing-referral',
        label: 'Referral ask',
        description: 'Asks for a referral respectfully.',
        appliesTo: 'ALL',
      },
      {
        id: 'closing-documentation',
        label: 'Sale documentation',
        description:
          'Documents the sale in HealthSherpa, CRM, and Convoso where applicable.',
        appliesTo: 'ALL',
      },
    ],
  },
];

export const getScoringSectionsForRubric = (
  rubricType: QaRubricType,
): ScoringSection[] =>
  SCORING_SECTIONS.map((section) => ({
    ...section,
    criteria: section.criteria.filter(
      (criterion) =>
        criterion.appliesTo === 'ALL' || criterion.appliesTo === rubricType,
    ),
  }));

export const SCORING_SYSTEM_PROMPT = `You are a compliance QA analyst for Omnia Insurance Group. Score insurance sales call transcripts using only the provided rubric and transcript evidence.

Return valid JSON only. Do not include markdown fences.

Classification:
- callQuality must be "SCORABLE" or "NOT_SCORABLE".
- NOT_SCORABLE includes voicemail, no answer, wrong number, dead air, no live two-way conversation, or trivially short conversations.
- Only sale/enrollment calls are scorable for this QA scorecard. Mark customer-service, troubleshooting, cancellation, transfer-only, hangup-before-sale, not-actively-shopping, Medicaid/Medicare-shopping, and benefit-card information calls as NOT_SCORABLE unless the agent meaningfully attempts ACA, ancillary, marketplace, AOR, or enrollment assistance.
- rubricType must be "ACA_SALE", "ANCILLARY_ONLY", or "UNKNOWN".
- UNKNOWN is allowed when the transcript does not clearly identify ACA versus ancillary.

Red flags:
- A red flag means the agent failed compliance.
- If any red flag is violated, the final score will be overridden to 0 and the final result will be FAIL.
- Marketplace and commission disclosures are mandatory on ACA sales/enrollment calls.
- Commission disclosure is not an ancillary-only auto-fail unless an ACA marketplace sale/enrollment is also attempted.
- Recorded-line disclosure is mandatory for every scorable call.
- AOR disclosure is mandatory when AOR is attempted or completed.
- HealthSherpa disclosure is mandatory when HealthSherpa is used for ACA enrollment.
- Coaching/manipulation and DNC violations are automatic failures.

Scoring:
- Score each criterion from 0 to 100.
- Use null for not-applicable criteria and explain why.
- Include evidence quotes and approximate timestamp or transcript position when available.
- Do not invent compliance that is not supported by the transcript.`;

export const buildScoringUserPrompt = (transcript: string): string => {
  const redFlagLines = RED_FLAGS.map(
    (redFlag) =>
      `- ${redFlag.key}: ${redFlag.label}. ${redFlag.aiPromptGuidance}`,
  ).join('\n');

  const sectionLines = SCORING_SECTIONS.map((section) => {
    const criteria = section.criteria
      .map(
        (criterion) =>
          `  - ${criterion.id} (${criterion.appliesTo}): ${criterion.label}. ${criterion.description}`,
      )
      .join('\n');

    return `### ${section.id} (${section.label}, weight ${Math.round(
      section.weight * 100,
    )}%)\n${criteria}`;
  }).join('\n\n');

  return [
    'Analyze and score this call transcript.',
    '',
    'Return JSON with this exact top-level shape:',
    '{',
    '  "callQuality": "SCORABLE" | "NOT_SCORABLE",',
    '  "notScorableReason": string | null,',
    '  "rubricType": "ACA_SALE" | "ANCILLARY_ONLY" | "UNKNOWN",',
    '  "redFlags": { "[redFlagKey]": { "violated": boolean, "evidence": string, "explanation": string, "confidence": number } },',
    '  "sections": { "[sectionId]": { "score": number, "criteria": { "[criterionId]": { "score": number | null, "evidence": string, "notes": string, "confidence": number } } } },',
    '  "recommendations": [{ "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "category": string, "title": string, "detail": string }],',
    '  "strengths": string[],',
    '  "areasForImprovement": string[]',
    '}',
    '',
    'Red flags:',
    redFlagLines,
    '',
    'Rubric sections:',
    sectionLines,
    '',
    'Transcript:',
    transcript,
  ].join('\n');
};
