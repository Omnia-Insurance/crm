# Compliance

Automated QA scoring for Convoso call recordings stored on the CRM `Call`
object.

`QA Scorecard` records keep relations to the source `Call`, `Lead`, `Agent
Profile`, assigned `QA Manager`, and follow-up `Task` instead of duplicating
those records as text IDs.

The scorecard model intentionally stays small: status, score, result, `Type`
(`qaType` internally because `type` is reserved), red flag, a technical unique
source-call key for idempotency, and the core relations including the source
Lead. The source-call key exists because app relation fields cannot be unique;
the visible relationship is still the source `Call`. Detailed QA output is
written to Notes on the scorecard:

- `Recommendations`
- `Red Flag Details`
- `Score Details`
- `Scoring Evidence`
- `Transcript`
- `Translated Transcript` when a Spanish transcript is translated before
  scoring
- `Transcript Language`
- `Processing Error`

The Files tab stores small scorecard attachments for the Amazon Transcribe JSON
artifact. The source recording stays on the linked Call and the copied S3 input
path to avoid pushing large call audio through CRM file upload limits.

Transcribe output is stored at a deterministic S3 key per Call and transcription
pipeline version. Retries check for an existing valid transcript JSON before
starting a new Amazon Transcribe job, so scoring/task failures can be retried
without paying to transcribe the same call again. The Amazon Transcribe job name
is also deterministic by Call ID so concurrent starts converge on the same job
instead of creating duplicate billable jobs.

Amazon Transcribe uses English/Spanish language identification. When Spanish is
detected, Compliance writes the source transcript to `Transcript`, translates
the Spanish/Spanglish transcript to English with a context-aware Bedrock
translation prompt, writes that English text to `Translated Transcript`, and
scores the translated transcript. Amazon Translate remains available as a
fallback for any segment the contextual translation does not return.

## Setup

1. Install the app.
2. Open `Quality Assurance > Managers` and create one active record per
   workspace member who should receive compliance follow-up tasks.
3. Configure required application variables:
   - `AWS_REGION`
   - `COMPLIANCE_QA_TRANSCRIBE_BUCKET`
   - `COMPLIANCE_QA_BEDROCK_MODEL_ID`
4. Configure optional eligibility filters:
   - `COMPLIANCE_QA_MIN_DURATION_SECONDS` defaults to `300`
   - `COMPLIANCE_QA_ENABLED_AFTER` skips Calls before a rollout timestamp
   - `COMPLIANCE_QA_ALLOWED_DIRECTIONS`
   - `COMPLIANCE_QA_ALLOWED_STATUSES`
   - `COMPLIANCE_QA_ALLOWED_STATUS_NAMES` defaults to sales dispositions:
     `Sale - ACA Only`, `Sale - ACA + Private`, and `Sale - Private Only`.
     Set it to `*` only when every status should be eligible for sales QA.
   - `COMPLIANCE_QA_ALLOWED_QUEUE_NAMES`
   - `COMPLIANCE_QA_ALLOWED_LEAD_SOURCE_IDS`
5. Configure AWS credentials through IAM role in production, or
   `AWS_PROFILE`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, and optional
   `AWS_SESSION_TOKEN` for local development.
   Production uses the `twenty-bedrock-runtime` pod role with the
   `ComplianceQaTranscribeS3Artifacts` inline policy for Transcribe, Amazon
   Translate, and the `compliance-qa/*` S3 prefixes.

No manual CRM Workflow setup is required. The app post-install hook creates and
activates a visible Workflow named `Compliance Call Pipeline`. It listens for
`call.upserted` events on the fields that affect QA eligibility/context,
including `leadId`, then runs the `Start Compliance QA` workflow action with
the triggering Call ID. Admins can
inspect, deactivate, or customize that workflow from the normal Workflows page.

Local app sync via `yarn twenty dev` does not run post-install hooks. For local
development, `yarn twenty exec --postInstall` can create a fresh workflow, but
it cannot upgrade an already-active workflow because manual CLI execution lacks
the user-workspace auth context required by Twenty's workflow draft endpoint.
Use the install/upgrade UI path for that case, or recreate the local app-managed
workflow before running the hook.

The installed workflow owns the async Transcribe wait. It runs delayed polling
steps with backoff, calls `complete-compliance-qa` for the specific scorecard,
branches on `shouldPollAgain`, and stops when the transcript is scored or the
final polling window expires. If Convoso publishes a recording URL before the
recording is actually available, the scorecard remains in `COPYING_RECORDING`
instead of failing; later workflow-triggered or batch completion runs can retry
the same URL and continue once it returns audio. Follow-up tasks are created for
an active QA Manager only when the result is `FAIL` and a red flag is present.
The task has one assignee, the QA Manager, and is linked through Task Targets to
the QA Scorecard, source Call, source Lead, and Agent Profile when those records
are available.

## Backfill

`backfill-compliance-qa` is dry-run by default. It only queues real work when
`confirm` is `true`, `dryRun` is not `true`, and `afterDate` is set. This is
intentional because backfill can create meaningful Amazon Transcribe costs.
