import { defineObject, FieldType } from 'twenty-sdk';

// Object
export const QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER =
  'a3e5c7b1-8d46-4f2a-9e1c-5b3d7a9f1e02';

// Field identifiers
export const NAME_FIELD_ID = 'b4f6d8c2-9e57-4a3b-af2d-6c4e8b0a2f13';
export const OVERALL_SCORE_FIELD_ID = 'c5a7e9d3-0f68-4b4c-ba3e-7d5f9c1b3a24';
export const OVERALL_RESULT_FIELD_ID = 'd6b8f0e4-1a79-4c5d-cb4f-8e6a0d2c4b35';
export const CALL_TYPE_FIELD_ID = 'e7c9a1f5-2b80-4d6e-dc5a-9f7b1e3d5c46';

// Red flag fields
export const RED_FLAG_RECORDED_LINE_ID =
  'f8d0b2a6-3c91-4e7f-ed6b-0a8c2f4e6d57';
export const RED_FLAG_MARKETPLACE_ID =
  'a9e1c3b7-4d02-4f8a-fe7c-1b9d3a5f7e68';
export const RED_FLAG_AOR_ID = 'b0f2d4c8-5e13-4a9b-af8d-2c0e4b6a8f79';
export const RED_FLAG_COMMISSION_ID =
  'c1a3e5d9-6f24-4b0c-ba9e-3d1f5c7b9a80';
export const RED_FLAG_HEALTHSHERPA_ID =
  'd2b4f6e0-7a35-4c1d-cb0f-4e2a6d8c0b91';
export const RED_FLAG_AGENT_COACHING_ID =
  'e3c5a7f1-8b46-4d2e-dc1a-5f3b7e9d1c02';
export const RED_FLAG_DNC_VIOLATION_ID =
  'f4d6b8a2-9c57-4e3f-ed2b-6a4c8f0e2d13';
export const HAS_RED_FLAG_FIELD_ID = 'a5e7c9b3-0d68-4f4a-fe3c-7b5d9a1f3e24';

// Section score fields
export const OPENING_SCORE_FIELD_ID = 'b6f8d0c4-1e79-4a5b-af4d-8c6e0b2a4f35';
export const FACT_FINDING_SCORE_FIELD_ID =
  'c7a9e1d5-2f80-4b6c-ba5e-9d7f1c3b5a46';
export const ELIGIBILITY_SCORE_FIELD_ID =
  'd8b0f2e6-3a91-4c7d-cb6f-0e8a2d4c6b57';
export const PRESENTATION_SCORE_FIELD_ID =
  'e9c1a3f7-4b02-4d8e-dc7a-1f9b3e5d7c68';
export const APPLICATION_SCORE_FIELD_ID =
  'f0d2b4a8-5c13-4e9f-ed8b-2a0c4f6e8d79';
export const CLOSING_SCORE_FIELD_ID = 'a1e3c5b9-6d24-4f0a-fe9c-3b1d5a7f9e80';

// Rich text fields
export const SCORE_DETAILS_FIELD_ID = 'b2f4d6c0-7e35-4a1b-af0d-4c2e6b8a0f91';
export const RED_FLAG_DETAILS_FIELD_ID =
  'c3a5e7d1-8f46-4b2c-ba1e-5d3f7c9b1a02';
export const TRANSCRIPT_FIELD_ID = 'd4b6f8e2-9a57-4c3d-cb2f-6e4a8d0c2b13';
export const RECOMMENDATIONS_FIELD_ID =
  'e5c7a9f3-0b68-4d4e-dc3a-7f5b9e1d3c24';

// Status field
export const STATUS_FIELD_ID = 'f6d8b0a4-1c79-4e5f-ed4b-8a6c0f2e4d35';

// Analyzed at field
export const ANALYZED_AT_FIELD_ID = 'a7e9c1b5-2d80-4f6a-fe5c-9b7d1a3f5e46';

export default defineObject({
  universalIdentifier: QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'qaScorecard',
  namePlural: 'qaScorecards',
  labelSingular: 'QA Scorecard',
  labelPlural: 'QA Scorecards',
  description: 'Automated compliance QA scorecard for insurance sales calls',
  icon: 'IconClipboardCheck',
  labelIdentifierFieldMetadataUniversalIdentifier: NAME_FIELD_ID,
  fields: [
    // Name (auto-generated label like "QA - Agent Name - 2026-03-05")
    {
      universalIdentifier: NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description: 'Display name for this QA scorecard',
      icon: 'IconAbc',
    },

    // Overall score (0-100)
    {
      universalIdentifier: OVERALL_SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'overallScore',
      label: 'Overall Score',
      description: 'Overall compliance score from 0 to 100',
      icon: 'IconPercentage',
    },

    // Overall result (PASS / FAIL / NEEDS_REVIEW)
    {
      universalIdentifier: OVERALL_RESULT_FIELD_ID,
      type: FieldType.SELECT,
      name: 'overallResult',
      label: 'Result',
      description: 'Overall pass/fail result',
      icon: 'IconCircleCheck',
      options: [
        {
          id: 'a1b2c3d4-0001-4000-8000-000000000001',
          value: 'PASS',
          label: 'Pass',
          position: 0,
          color: 'green',
        },
        {
          id: 'a1b2c3d4-0001-4000-8000-000000000002',
          value: 'FAIL',
          label: 'Fail',
          position: 1,
          color: 'red',
        },
        {
          id: 'a1b2c3d4-0001-4000-8000-000000000003',
          value: 'NEEDS_REVIEW',
          label: 'Needs Review',
          position: 2,
          color: 'orange',
        },
      ],
    },

    // Call type
    {
      universalIdentifier: CALL_TYPE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'callType',
      label: 'Call Type',
      description: 'Type of insurance call',
      icon: 'IconPhoneCall',
      options: [
        {
          id: 'a1b2c3d4-0002-4000-8000-000000000001',
          value: 'ACA_SALE',
          label: 'ACA Sale',
          position: 0,
          color: 'blue',
        },
        {
          id: 'a1b2c3d4-0002-4000-8000-000000000002',
          value: 'ANCILLARY',
          label: 'Ancillary',
          position: 1,
          color: 'purple',
        },
        {
          id: 'a1b2c3d4-0002-4000-8000-000000000003',
          value: 'GENERAL',
          label: 'General',
          position: 2,
          color: 'gray',
        },
      ],
    },

    // === Red Flag Auto-Fail Fields ===
    {
      universalIdentifier: RED_FLAG_RECORDED_LINE_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlagRecordedLine',
      label: 'Red Flag: Recorded Line',
      description: 'Failed to disclose the call is being recorded',
      icon: 'IconAlertTriangle',
    },
    {
      universalIdentifier: RED_FLAG_MARKETPLACE_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlagMarketplace',
      label: 'Red Flag: Marketplace',
      description:
        'Failed to disclose not directly associated with the marketplace',
      icon: 'IconAlertTriangle',
    },
    {
      universalIdentifier: RED_FLAG_AOR_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlagAor',
      label: 'Red Flag: AOR',
      description: 'Failed to properly handle Agent of Record disclosure',
      icon: 'IconAlertTriangle',
    },
    {
      universalIdentifier: RED_FLAG_COMMISSION_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlagCommission',
      label: 'Red Flag: Commission',
      description: 'Failed to disclose commission-based compensation',
      icon: 'IconAlertTriangle',
    },
    {
      universalIdentifier: RED_FLAG_HEALTHSHERPA_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlagHealthSherpa',
      label: 'Red Flag: HealthSherpa',
      description: 'Failed to provide HealthSherpa disclosure',
      icon: 'IconAlertTriangle',
    },
    {
      universalIdentifier: RED_FLAG_AGENT_COACHING_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlagAgentCoaching',
      label: 'Red Flag: Agent Coaching',
      description: 'Agent coached the consumer on how to answer questions',
      icon: 'IconAlertTriangle',
    },
    {
      universalIdentifier: RED_FLAG_DNC_VIOLATION_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlagDncViolation',
      label: 'Red Flag: DNC Violation',
      description: 'Do Not Call list violation',
      icon: 'IconAlertTriangle',
    },

    // Has any red flag (computed)
    {
      universalIdentifier: HAS_RED_FLAG_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'hasRedFlag',
      label: 'Has Red Flag',
      description: 'Whether any red flag auto-fail was triggered',
      icon: 'IconFlag',
    },

    // === Section Scores (0-100 each) ===
    {
      universalIdentifier: OPENING_SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'openingScore',
      label: 'Opening Score',
      description: 'Score for the opening section (0-100)',
      icon: 'IconDoor',
    },
    {
      universalIdentifier: FACT_FINDING_SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'factFindingScore',
      label: 'Fact Finding Score',
      description: 'Score for the fact-finding section (0-100)',
      icon: 'IconSearch',
    },
    {
      universalIdentifier: ELIGIBILITY_SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'eligibilityScore',
      label: 'Eligibility Score',
      description: 'Score for the eligibility assessment section (0-100)',
      icon: 'IconChecklist',
    },
    {
      universalIdentifier: PRESENTATION_SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'presentationScore',
      label: 'Presentation Score',
      description: 'Score for the plan presentation section (0-100)',
      icon: 'IconPresentation',
    },
    {
      universalIdentifier: APPLICATION_SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'applicationScore',
      label: 'Application Score',
      description: 'Score for the application process section (0-100)',
      icon: 'IconFileText',
    },
    {
      universalIdentifier: CLOSING_SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'closingScore',
      label: 'Closing Score',
      description: 'Score for the closing section (0-100)',
      icon: 'IconCircleCheck',
    },

    // === Rich Text Detail Fields ===
    {
      universalIdentifier: SCORE_DETAILS_FIELD_ID,
      type: FieldType.RICH_TEXT_V2,
      name: 'scoreDetails',
      label: 'Score Details',
      description:
        'Full breakdown of scoring with evidence quotes from transcript',
      icon: 'IconListDetails',
    },
    {
      universalIdentifier: RED_FLAG_DETAILS_FIELD_ID,
      type: FieldType.RICH_TEXT_V2,
      name: 'redFlagDetails',
      label: 'Red Flag Details',
      description: 'Detailed explanations for any red flag violations',
      icon: 'IconAlertCircle',
    },
    {
      universalIdentifier: TRANSCRIPT_FIELD_ID,
      type: FieldType.RICH_TEXT_V2,
      name: 'transcript',
      label: 'Transcript',
      description: 'Full transcript used for analysis',
      icon: 'IconMessage',
    },
    {
      universalIdentifier: RECOMMENDATIONS_FIELD_ID,
      type: FieldType.RICH_TEXT_V2,
      name: 'recommendations',
      label: 'Recommendations',
      description: 'AI-generated coaching suggestions for the agent',
      icon: 'IconBulb',
    },

    // Status
    {
      universalIdentifier: STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      description: 'Processing status of this QA scorecard',
      icon: 'IconStatusChange',
      defaultValue: "'PENDING'",
      options: [
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000001',
          value: 'PENDING',
          label: 'Pending',
          position: 0,
          color: 'gray',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000002',
          value: 'TRANSCRIBING',
          label: 'Transcribing',
          position: 1,
          color: 'blue',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000003',
          value: 'ANALYZING',
          label: 'Analyzing',
          position: 2,
          color: 'blue',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000004',
          value: 'COMPLETED',
          label: 'Completed',
          position: 3,
          color: 'green',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000005',
          value: 'FAILED',
          label: 'Failed',
          position: 4,
          color: 'red',
        },
      ],
    },

    // Analyzed at
    {
      universalIdentifier: ANALYZED_AT_FIELD_ID,
      type: FieldType.DATE_TIME,
      name: 'analyzedAt',
      label: 'Analyzed At',
      description: 'When the compliance analysis was completed',
      icon: 'IconCalendar',
    },
  ],
});
