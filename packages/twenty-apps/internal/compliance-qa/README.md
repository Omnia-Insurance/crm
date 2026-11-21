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

The Files tab stores small scorecard attachments for the Deepgram transcript
JSON artifact. The source recording stays on the linked Call and the copied S3
input path to avoid pushing large call audio through CRM file upload limits.

Transcription uses Deepgram pre-recorded speech-to-text (`nova-3`,
`language=multi`, `diarize=true`). Every request sets `mip_opt_out=true` so
call audio stays out of Deepgram's model-improvement retention; the API key
must belong to the BAA-covered Deepgram Enterprise project because recordings
contain PHI. The call is synchronous (roughly 30 seconds per audio-hour), so
there is no transcription job to poll: the completion worker transcribes the
S3-archived recording, caches the JSON, and scores in one pass.

Transcript output is cached at a deterministic S3 key per Call and
transcription pipeline version (`dg-v1`). Retries check for an existing valid
transcript JSON before submitting a new Deepgram request, so scoring/task
failures can be retried without paying to transcribe the same call again.
Older `lid-v1` keys hold Amazon Transcribe JSON from the previous pipeline and
are never read by the Deepgram parser.

Deepgram tags each word with a language. When a meaningful share of the words
are Spanish (stray IVR prompts like "Para español" do not count), Compliance
writes the source transcript to `Transcript`, translates the Spanish/Spanglish
transcript to English with a context-aware Bedrock translation prompt, writes
that English text to `Translated Transcript`, and scores the translated
transcript. Amazon Translate remains available as a fallback for any segment
the contextual translation does not return.

## Setup

1. Install the app. On Twenty v2.58 that means 1.2.0 or later, through the
   deploy flow in [Running on Twenty v2.58](#running-on-twenty-v258); never
   reinstall 1.1.x there.
2. Open `Quality Assurance > Managers` and create one active record per
   workspace member who should receive compliance follow-up tasks.
3. Configure required application variables:
   - `AWS_REGION`
   - `COMPLIANCE_QA_TRANSCRIBE_BUCKET`
   - `COMPLIANCE_QA_BEDROCK_MODEL_ID`
   and the `DEEPGRAM_API_KEY` server variable (see (a) below).
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
5. AWS credentials: production uses the `twenty-bedrock-runtime` Pod Identity
   role, with the `ComplianceQaTranscribeS3Artifacts` inline policy for Amazon
   Translate and the `compliance-qa/*` S3 prefixes (see (b) below). For local
   development, set the optional `AWS_ACCESS_KEY_ID` /
   `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` server variables with
   short-lived keys. Leave them empty in production: when set they take
   precedence over the role.

Version 1.1.x creates and activates a visible Workflow named
`Compliance Call Pipeline` from its post-install hook. It listens for
`call.upserted` events on the fields that affect QA eligibility/context,
including `leadId`, then runs the `Start Compliance QA` workflow action with
the triggering Call ID. Admins can inspect, deactivate, or customize that
workflow from the normal Workflows page. On Twenty v2.58 that hook can no
longer run; see (c) and (d) below.

The installed workflow owns the delayed completion wait. It runs delayed
polling steps with backoff, calls `complete-compliance-qa` for the specific
scorecard (which transcribes synchronously with Deepgram and scores in one
pass), branches on `shouldPollAgain`, and stops when the transcript is scored
or the final polling window expires. If Convoso publishes a recording URL before the
recording is actually available, the scorecard remains in `COPYING_RECORDING`
instead of failing; later workflow-triggered or batch completion runs can retry
the same URL and continue once it returns audio. Follow-up tasks are created for
an active QA Manager only when the result is `FAIL` and a red flag is present.
The task has one assignee, the QA Manager, and is linked through Task Targets to
the QA Scorecard, source Call, source Lead, and Agent Profile when those records
are available.

## Running on Twenty v2.58

Production runs 1.1.3 on SDK 2.3.0. Twenty v2.58 changes how logic functions
get credentials and how apps deploy. The installed 1.1.3 functions and the
legacy workflow are meant to keep running on v2.58 when the steps below are
followed; the smoke test in (c) confirms it. 1.2.0 is the first release built
for v2.58.

### (a) Deepgram key

v2.58 starts logic functions with an environment allowlist, so pod environment
variables (the old `deepgram-credentials` secret) never reach the app. The key
is the encrypted `DEEPGRAM_API_KEY` registration server variable, set in
Settings > Developers > Apps > Compliance > Config (under Settings >
Applications before the upgrade), or on the app registration page of the admin
panel. It must belong to the BAA-covered Deepgram Enterprise project.

Before the cutover (P0), confirm the variable row exists and is set
(read-only):

```sql
SELECT v.key, v."encryptedValue" <> '' AS "isSet"
FROM core."applicationRegistrationVariable" v
JOIN core."applicationRegistration" r ON r.id = v."applicationRegistrationId"
WHERE r."universalIdentifier" = 'e8b3a1c5-6d47-4f29-9e8a-3c5b7d1f4e06'
  AND r."deletedAt" IS NULL
  AND v.key = 'DEEPGRAM_API_KEY';
```

`isSet` only means something before the upgrade: from 2.31 on, empty values
are encrypted too, so check the Config tab instead. If the row is unset, set it
before the window. If the row is missing, or the key cannot be set in time,
deactivate the `Compliance Call Pipeline` for the window, because every
transcription fails without the key. Calls made while it is off can be
processed later with `backfill-compliance-qa`.

### (b) AWS credentials

Bedrock, Amazon Translate and S3 use the pod's EKS Pod Identity role through
container credentials (`AWS_CONTAINER_CREDENTIALS_FULL_URI` and
`AWS_CONTAINER_AUTHORIZATION_TOKEN`). The server passes them only to logic
functions of registrations listed in the env-only setting
`LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS`
(comma-separated `applicationRegistration` ids, not universal identifiers). It
is set for the server and worker in `omnia-values.yaml` and ships empty, which
grants nothing. Look up the id the server compares (read-only):

```sql
SELECT a."applicationRegistrationId", r."workspaceId" AS "ownerWorkspaceId"
FROM core.application a
LEFT JOIN core."applicationRegistration" r
  ON r.id = a."applicationRegistrationId" AND r."deletedAt" IS NULL
WHERE a."universalIdentifier" = 'e8b3a1c5-6d47-4f29-9e8a-3c5b7d1f4e06'
  AND a."deletedAt" IS NULL;
```

`applicationRegistrationId` must be non-null and `ownerWorkspaceId` set (claim
ownership if it is null, see (f)). Never list the workspace custom
application's registration (user-authored workflow code runs under it), and
keep allowlisted registrations private: every workspace that installs one gets
the credentials.

- Pod access to the instance metadata service (IMDS, `169.254.169.254`) must
  be blocked: `HttpTokens: required` with hop limit 1 on the node launch
  template (the hop limit alone does not stop IMDSv1), or a NetworkPolicy
  that denies it and keeps the Pod Identity agent (`169.254.170.23`)
  reachable. The server also sets `AWS_EC2_METADATA_DISABLED=true` for app
  functions, but that only stops the AWS SDK, not raw HTTP calls. Without the
  block, code without container credentials can reach the node instance role.
- Keep the `AWS_REGION` application variable set (`us-east-1`). The server
  only fills `AWS_REGION` / `AWS_DEFAULT_REGION` when the app sets no region.
- Keep the static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
  `AWS_SESSION_TOKEN` server variables empty in production.

### (c) Do not reinstall or upgrade 1.1.x on v2.58

- Its post-install hook builds the workflow through the workspace `workflow`
  object, which 2.58 drops, so the hook fails.
- A sync of a 1.1.x manifest also fails (see (e)).
- Never uninstall the app: uninstalling deletes everything it owns, including
  QA Scorecards, Managers and their records.

The upgrade migrates the legacy `Compliance Call Pipeline` to a core workflow
with a new id. The 1.1.x id `32ef78c2-f7f2-4e07-96b0-8b35e57b2d13` survives
only in `core."workflow"."workspaceWorkflowId"`, so find the workflow with this
lookup (read-only):

```sql
SELECT id, "workspaceId", name, "applicationId"
FROM core."workflow"
WHERE "workspaceWorkflowId" = '32ef78c2-f7f2-4e07-96b0-8b35e57b2d13';
```

It belongs to the workspace custom application, not to Compliance, and it
keeps calling the 1.1.3 Start and Complete actions until the 1.2.0 cut-over
deactivates it. Smoke-test it right after the cutover (P2): an eligible Call
update starts a run, the scorecard reaches a final status, and the run shows no
Deepgram, S3 or Bedrock credential errors.

### (d) The 1.2.0 plan

- Declare the pipeline with `defineWorkflow` (new workflow id) and delete the
  post-install workflow builder.
- Add the kill switch `COMPLIANCE_QA_AUTOMATIC_PROCESSING_ENABLED`, default
  `false`, checked first by the eligibility filter and also used in the
  trigger `filter`.
- Cut-over order: install 1.2.0 with the switch off, deactivate (do not
  delete; it keeps the run history) the legacy core workflow from the lookup
  in (c), then switch on. Both workflows are named `Compliance Call Pipeline`;
  the 1.2.0 one belongs to the Compliance application, so check the
  `applicationId` before deactivating.
- `twenty-sdk` and `twenty-client-sdk` 2.58 as devDependencies.
- Role permission flags through `SystemPermissionFlag`.
- No `workflow` object permission (the object no longer exists).
- The app role keeps read on Call.

### (e) Before any v2.58 sync

- Rebuild with the v2.58 `twenty` CLI and SDK. A manifest built with the old
  SDK tooling re-declares the system fields (`id`, `createdAt`, `updatedAt`,
  `deletedAt`, `createdBy`, `updatedBy`, `position`), and v2.58 fails the sync
  with `NON_UPDATABLE_PROPERTY_DIVERGENCE` instead of ignoring the diff. The
  same applies to every internal app.
- Explicit system-field declarations in `src`, from
  `grep -rnE "name: '(id|createdAt|updatedAt|deletedAt|createdBy|updatedBy|position|searchVector)'" src`:
  none (2026-11-18). The 1.1.3 manifest gets these fields from the SDK 2.3.0
  build step, not from source. Other `position` matches are select-option
  order and workflow step coordinates.
- `twenty app plan --remote <non-prod>` must show zero system-field
  operations.

### (f) Deploying

- Use the global `twenty` CLI pinned to the server version:
  `npm install -g twenty@2.58.0`. Do not use `yarn twenty deploy`, `install`,
  `dev` or `exec --postInstall`: they run the CLI embedded in SDK 2.3.0, which
  v2.58 replaced.
- Always pass `--remote <name>`, and never make the prod remote the default
  (`twenty auth login --use`, or saving it first: the first saved remote
  becomes the default). Check `twenty auth status` before any command; switch a
  prod default away with `twenty remote use <non-prod>`. Saved remotes live in
  `~/.twenty/config.json`.
- Run `twenty app plan --remote <name>` first and read every action.
- Deploy to prod with `twenty app publish --private --remote <prod>`, then
  `twenty app install --remote <prod>`, and only after the same steps succeed
  on a prod clone (`scripts/replicate-db-to-local.sh`).
- Never run `twenty app apply` or `twenty app dev` against prod: both prune
  remote entities missing from source by default, and pruned objects and
  fields take their stored data with them.
- When the registration's `ownerWorkspaceId` is null, claim ownership in the
  admin panel (app registration > Danger zone > Claim ownership) before
  publishing.

## Backfill

`backfill-compliance-qa` is dry-run by default. It only queues real work when
`confirm` is `true`, `dryRun` is not `true`, and `afterDate` is set. This is
intentional because backfill can create meaningful transcription costs.
