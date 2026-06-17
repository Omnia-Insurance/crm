# Telephony Codex Handoff

Date: 2026-05-19

## Current State

This branch adds the first CRM-owned Telephony foundation:

- Internal app metadata in `packages/twenty-apps/internal/telephony`
- Server runtime in `packages/twenty-server/src/modules/telephony`
- Metadata GraphQL mutations for sessions, agent status, lead routing, lead
  release, outbound call start, disposition submit, and inbound transfer/end
- Public provider webhook route at `POST /webhooks/telephony/:workspaceId/:provider`
- Twilio/Plivo-compatible provider adapter boundary for access-token
  placeholders, outbound call instructions, shared-secret webhook validation,
  and lifecycle/recording event normalization
- Agent softphone front component for session start, ready state, preview lead
  routing, release, and outbound call start
- Typed routing service with DNC checks, lead-local calling-window enforcement,
  routing leases, audit Call Events, and disposition transitions
- Routing lock claim logic is extracted into
  `try-lock-campaign-lead.util.ts` and covered by focused in-memory
  compare-and-swap tests for fresh lead double assignment, expired-lock
  reclaim races, and missing previous-owner tokens.

Telephony depends on Brokerage. Brokerage remains the source of truth for
canonical Leads (`person`), final historical Calls (`call`), Agent Profiles,
and Lead Sources. Provider identifiers belong only on Telephony Call Sessions
and Call Events.

## Important Constraint

Do not introduce TypeScript assertion casts or type coercion in this system.

The Telephony service and front component were intentionally written with typed
workspace repositories and response/type guards instead of `as` assertions.
The provider and calling-window parsers use explicit digit parsing instead of
`Number(...)`, `String(...)`, `Boolean(...)`, `parseInt`, or `parseFloat`.

Before extending this work, rerun:

```bash
rg "\sas\s" packages/twenty-server/src/modules/telephony packages/twenty-apps/internal/telephony -g '*.ts' -g '*.tsx'
rg "\b(Number|String|Boolean)\s*\(|parseInt\s*\(|parseFloat\s*\(" packages/twenty-server/src/modules/telephony packages/twenty-apps/internal/telephony -g '*.ts' -g '*.tsx'
```

Only English prose in test names/descriptions should match the first command.
The second command should return no matches in Telephony source.

## Phase 1 Remaining Work

- Build the manager CSV/list upload flow:
  - normalize phone/email fields
  - merge canonical Leads by phone/email
  - create or update Campaign Lead queue memberships
  - preserve separate Campaign Lead history across campaigns
- Replace the placeholder provider token/call instruction with real CPaaS
  integration:
  - Twilio Voice access token/JWT or Plivo Browser SDK token
  - provider call creation or TwiML answer document
  - signature validation matching the selected provider
- Complete final Brokerage Call creation/linking after call completion and
  disposition.
- Add frontend tests for the softphone workflow, blocked-call messaging, and
  disposition-required behavior.

## Phase 2 Work

- Implement inbound browser offer routing:
  - map provider numbers to Inbound Queues/Campaigns
  - offer calls only to eligible `READY` agents with active browser sessions
  - create callback tasks/queue entries for missed or unanswered inbound calls
- Attach recording metadata/files to final Brokerage Calls.
- Build the live manager dashboard for:
  - agent states
  - campaign progress
  - calls in progress
  - due callbacks
  - blocked attempts
- Add Convoso cutover tooling and shadow-mode comparison reports.

## Phase 3 Work

- Rebuild QA scoring inputs from Telephony Call Events and attached recordings.
- Add transcript processing from the new provider recording path.
- Rebuild productivity/time-card dashboards from Agent Presence and Call Event
  state.
- Add historical comparison reports against preserved Convoso data.

## Validation Run Today

These passed after the no-cast/no-coercion cleanup:

```bash
npx nx typecheck twenty-server
npx jest packages/twenty-server/src/modules/telephony/providers/__tests__/twilio-compatible-telephony-provider.adapter.spec.ts packages/twenty-server/src/modules/telephony/utils/__tests__/local-calling-window.util.spec.ts --config=packages/twenty-server/jest.config.mjs
npx tsc --noEmit -p packages/twenty-apps/internal/telephony/tsconfig.json
yarn lint
./scripts/check-customizations.sh
```

The Jest run printed the repo's existing Watchman recrawl warning, but the
Telephony tests passed.

## Files To Start With

- `packages/twenty-server/src/modules/telephony/services/telephony.service.ts`
- `packages/twenty-server/src/modules/telephony/providers/twilio-compatible-telephony-provider.adapter.ts`
- `packages/twenty-server/src/modules/telephony/utils/local-calling-window.util.ts`
- `packages/twenty-apps/internal/telephony/src/front-components/agent-softphone-workspace.tsx`
- `packages/twenty-apps/internal/telephony/README.md`
