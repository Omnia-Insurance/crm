import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/roles/default-role';
import { defineApplication } from 'twenty-sdk/define';

const COMPLIANCE_APP_ABOUT_DESCRIPTION = [
  'Automate call compliance review from recording to manager follow-up.',
  '',
  '#### What this app does',
  '',
  'Compliance listens to eligible Call records, copies the recording to S3, transcribes it with Amazon Transcribe, and scores the conversation against insurance sales compliance criteria.',
  '',
  'It turns the result into native CRM work your team can act on:',
  '- Scorecards linked to the source Call, Lead, and Agent',
  '- Notes for recommendations, red flags, score details, evidence, and transcript text',
  '- Files for the copied audio and Amazon Transcribe JSON artifact',
  '- Follow-up Tasks assigned to configured QA Managers when a call fails or needs review',
  '',
  '#### How processing works',
  '',
  'On install, Compliance creates a visible CRM Workflow named **Compliance Call Pipeline**. The workflow listens for eligible Call create/update events and runs the Start Compliance QA action. The app uses deterministic S3 output paths and deterministic Transcribe job names, so retries reuse a successful transcript instead of paying to transcribe the same call again.',
  '',
  'Workflow-owned delayed completion steps poll Amazon Transcribe, score the transcript through Amazon Bedrock, write the audit trail back to the scorecard, and create one manager task when follow-up is required.',
  '',
  '#### Included objects',
  '- **Scorecards**: processing status, score, result, red flag, source Call, Lead, Agent, QA Manager, and follow-up Task',
  '- **Managers**: workspace members who can receive compliance follow-up tasks',
  '',
  '#### Operational controls',
  '- Minimum duration and rollout-date filters prevent accidental broad transcription',
  '- Direction, status, queue, and lead-source filters let teams scope which calls are reviewed',
  '- QA Manager assignment is required before follow-up tasks are created',
  '- Production AWS access uses IAM role credentials, not stored AWS keys',
].join('\n');

export default defineApplication({
  universalIdentifier: 'e8b3a1c5-6d47-4f29-9e8a-3c5b7d1f4e06',
  displayName: 'Compliance',
  description:
    'Automated call transcription, compliance scoring, and manager follow-up.',
  aboutDescription: COMPLIANCE_APP_ABOUT_DESCRIPTION,
  applicationVariables: {
    AWS_REGION: {
      universalIdentifier: '926ad61c-7ad6-4b89-ab13-b4984fd28b1a',
      description: 'AWS region used by Amazon Transcribe and S3.',
      isSecret: false,
    },
    COMPLIANCE_QA_TRANSCRIBE_BUCKET: {
      universalIdentifier: 'cae40270-079a-4603-beda-2a2710c0eb4e',
      description:
        'S3 bucket where Compliance QA copies recordings and stores Amazon Transcribe output.',
      isSecret: false,
    },
    COMPLIANCE_QA_TRANSCRIBE_INPUT_PREFIX: {
      universalIdentifier: '11e3587d-dd73-42c6-84d0-f4d66de44f2b',
      description: 'S3 key prefix for copied source recordings.',
      isSecret: false,
      value: 'compliance-qa/input',
    },
    COMPLIANCE_QA_TRANSCRIBE_OUTPUT_PREFIX: {
      universalIdentifier: 'eb6fde59-d378-4a99-af12-c388c5dc0d5e',
      description: 'S3 key prefix for Amazon Transcribe JSON output.',
      isSecret: false,
      value: 'compliance-qa/output',
    },
    COMPLIANCE_QA_BEDROCK_MODEL_ID: {
      universalIdentifier: '4a38331c-f95d-4a83-96f7-a681b6999490',
      description:
        'Amazon Bedrock model ID used for scoring Compliance QA transcripts.',
      isSecret: false,
      value: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    },
    COMPLIANCE_QA_MIN_DURATION_SECONDS: {
      universalIdentifier: '6c8f3f72-96ad-42f5-8df7-041cc6f6b6e5',
      description:
        'Minimum Call duration in seconds before a recording is eligible for Compliance QA.',
      isSecret: false,
      value: '300',
    },
    COMPLIANCE_QA_ENABLED_AFTER: {
      universalIdentifier: '5dc827e6-152b-48c3-b158-80d46967fb8a',
      description:
        'Optional ISO date. Calls before this timestamp are skipped by Compliance QA.',
      isSecret: false,
    },
    COMPLIANCE_QA_ALLOWED_DIRECTIONS: {
      universalIdentifier: 'd8566c1b-73d4-4f10-bd46-68185a22df61',
      description:
        'Optional comma-separated Call directions that are eligible for Compliance QA.',
      isSecret: false,
    },
    COMPLIANCE_QA_ALLOWED_STATUSES: {
      universalIdentifier: 'b29d6ad6-f72b-4891-80cd-265d8ff9c2f1',
      description:
        'Optional comma-separated Call status values that are eligible for Compliance QA.',
      isSecret: false,
    },
    COMPLIANCE_QA_ALLOWED_STATUS_NAMES: {
      universalIdentifier: '30bfae26-2a19-4a39-a053-9441e602da8d',
      description:
        'Optional comma-separated Call status names that are eligible for Compliance QA.',
      isSecret: false,
    },
    COMPLIANCE_QA_ALLOWED_QUEUE_NAMES: {
      universalIdentifier: 'd5d553d1-df06-41d6-b835-c0f9c0e329a7',
      description:
        'Optional comma-separated Call queue names that are eligible for Compliance QA.',
      isSecret: false,
    },
    COMPLIANCE_QA_ALLOWED_LEAD_SOURCE_IDS: {
      universalIdentifier: 'a4bce61e-d940-40f5-b183-7c31b8d82d3e',
      description:
        'Optional comma-separated Call leadSourceId values that are eligible for Compliance QA.',
      isSecret: false,
    },
    COMPLIANCE_DEFAULT_MANAGER_WORKSPACE_MEMBER_ID: {
      universalIdentifier: '62bdba7f-1fd0-48c0-aa54-370159930725',
      description:
        'Fallback workspaceMember ID for QA follow-up tasks when no active QA Manager records are configured.',
      isSecret: false,
    },
  },
  serverVariables: {
    AWS_ACCESS_KEY_ID: {
      description:
        'Optional AWS access key for local/self-hosted deployments. Prefer an IAM role in production.',
      isSecret: true,
      isRequired: false,
    },
    AWS_SECRET_ACCESS_KEY: {
      description:
        'Optional AWS secret key for local/self-hosted deployments. Prefer an IAM role in production.',
      isSecret: true,
      isRequired: false,
    },
    AWS_SESSION_TOKEN: {
      description:
        'Optional AWS session token for local/self-hosted deployments using temporary credentials.',
      isSecret: true,
      isRequired: false,
    },
  },
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
});
