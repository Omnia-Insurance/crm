# Omnia CRM Customizations

This document tracks all modifications made on top of upstream [twentyhq/twenty](https://github.com/twentyhq/twenty). **Check this file after every upstream merge** to verify nothing was overwritten.

Use `OMNIA-CUSTOM` markers in code to tag custom sections. After merging upstream, run:

```bash
./scripts/check-customizations.sh
```

---

## Critical Files (Repeatedly Wiped by Upstream Merges)

These files have been overwritten by upstream merges multiple times. **Always verify after merge.**

| File                                                                                                                                                                                      | What We Changed                                                                                                                                            | Why                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts`                                                                                           | Write-scoped dynamic relation resolution for `policy.agent -> agentProfile.workspaceMember`                                                                | `Policy / Write only / Agent is Me` breaks create/edit without resolving the intermediate agent-profile id                                                     |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/hooks/useFilteredSelectOptionsFromRLSPredicates.ts`                                                           | Select-option RLS filtering only uses `ALL + WRITE` predicates                                                                                             | Read-only rules must not leak into editable pickers/selects after the scoped RLS rollout                                                                       |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectForm.tsx`                      | Removed Organization plan gate on RLS                                                                                                                      | Self-hosted, no billing — RLS must always be available                                                                                                         |
| `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawer.tsx`                                                                                                        | Sidebar: Settings at top, Documentation removed, Search item retained in sidebar                                                                           | UX preferences                                                                                                                                                 |
| `packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/NavigationDrawerHeader.tsx`                                                                                 | Removed inline search icon next to workspace name                                                                                                          | Search should only live in the sidebar                                                                                                                         |
| `packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx`                                | Removed nested three-dots dropdown; inlined Log out directly; removed Create Workspace and Invite user                                                     | Simplify workspace dropdown — single-workspace deployment doesn't need workspace creation or inline invite                                                     |
| `packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts`                                                                                                            | Default landing page uses workspace sidebar nav items as source of truth; admin last-visited validated against sidebar; members land on first sidebar item | Prevents landing on objects active in metadata but absent from sidebar (e.g. Companies)                                                                        |
| `packages/twenty-front/src/modules/navigation-menu-item/components/WorkspaceNavigationMenuItemsDispatcher.tsx`                                                                            | Members bypass the editable workspace tree and use a fixed Omnia workspace section (Leads, Calls, Policies, Notes, Tasks)                                  | Prevents admin-only folders like Carriers from leaking back into member sidebars after upstream nav changes                                                    |
| `packages/twenty-front/src/modules/command-menu/components/CommandMenuButton.tsx`                                                                                                         | Pinned create CTA supports explicit button variant/accent so Policies/Leads pages keep a filled blue "Create ..." button                                   | Upstream hardcodes secondary buttons here and will revert to blue outline / generic CTA                                                                        |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts`                                                        | Pin Delete single/multiple record actions as header buttons                                                                                                | Upstream `isPinned: false` hides Delete in the dropdown; we want it visible like the legacy path                                                               |
| `packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker.tsx`                                                                | Restores shared `additionalFilter` support for multi-select relation pickers                                                                               | Lead → Policy picker relies on this to hide policies already linked to other leads across typing/load-more                                                     |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx` | Record-level permissions are split into Read + write / Read only / Write only sections                                                                     | Omnia policy access depends on action-scoped RLS, not one shared predicate tree                                                                                |
| `packages/twenty-front/src/locales/*.po` and `src/locales/generated/*.ts`                                                                                                                 | Custom Lingui translations                                                                                                                                 | Must re-run `lingui extract && lingui compile` after upstream merge                                                                                            |
| `packages/twenty-server/src/app.module.ts`                                                                                                                                                | Excludes `/assets/*` and `/images/*` from SPA fallback and sets HTML vs asset cache headers                                                                | Prevents Cloudflare from caching `index.html` at stale JS/CSS URLs during rolling deploys                                                                      |
| `packages/twenty-server/nest-cli.json`                                                                                                                                                | Expanded `watchOptions.ignored` to exclude Yarn/PnP caches, coverage, and large static seed/sample directories                                              | Prevents Nest/chokidar watch mode from exhausting file descriptors (`EMFILE`) on large monorepo workspaces                                                     |
| `packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts`                                                                                                                  | Added `editWindowMinutes` column                                                                                                                           | Configurable edit window per role                                                                                                                              |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts`                                                                                        | Added `editWindowMinutes` column                                                                                                                           | Per-object edit window override                                                                                                                                |
| `packages/twenty-server/src/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts`                                                                           | Resolves `editWindowMinutes` in cache                                                                                                                      | Edit window enforcement depends on this                                                                                                                        |
| `packages/twenty-shared/src/types/ObjectPermissions.ts`                                                                                                                                   | Added `editWindowMinutes` to shared type                                                                                                                   | Both server + frontend depend on this                                                                                                                          |
| `packages/twenty-server/src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts`                                                                                     | RLS predicates are action-scoped (`ALL` / `READ` / `WRITE`) and relation-based `Me` predicates resolve through linked records                              | Policies must stay globally visible while only write-restricted for non-owners; `policy.agent = Me` must resolve via AgentProfile, not raw `workspaceMemberId` |
| `packages/twenty-server/src/engine/twenty-orm/entity-manager/workspace-entity-manager.ts`                                                                                                 | Seeds a request-scoped RLS computation cache into the ORM workspace context                                                                                | GraphQL requests become painfully slow if the same role/object filter is rebuilt repeatedly per resolver                                                       |
| `packages/twenty-server/src/engine/api/graphql/metadata.module-factory.ts`                                                                                                                | Metadata response cache must include `FindAllRecordPageLayouts`, `FindFieldsWidgetCoreViews`, and `FindManyLogicFunctions`                                 | App boot loads these metadata queries on every login; without cache they hit the backend every time                                                            |
| `packages/twenty-server/src/engine/core-modules/observability/utils/slow-path-observer.util.ts`                                                                                           | Shared slow-path observer utility provides thresholded timing warnings for cache misses, cache resolution, and schema builds                               | We need cheap, consistent timing logs across services without re-implementing `performance.now()` plumbing in every hotspot                                    |
| `packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts`                                                                                               | Core-view metadata cache keys must stay user-scoped and slow metadata cache misses must log with workspace/operation context                               | Core view visibility is user-dependent; when metadata gets slow again we need proof of which cache-miss operations regressed                                   |
| `packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts`                                                                                                   | Slow Redis hash checks, Redis fetches, provider recomputes, and full workspace-cache resolutions now warn with affected keys                               | Metadata/page-layout slowness in prod often comes from cache misses or Redis latency, not from the resolver itself                                             |
| `packages/twenty-server/src/engine/api/graphql/graphql-config/graphql-config.service.ts`                                                                                                  | Slow core `/graphql` schema resolution now logs module-resolution vs workspace-schema timing                                                               | If core GraphQL slows down again we need to know whether request-scoped DI/context setup or schema construction is the expensive step                          |
| `packages/twenty-server/src/engine/api/graphql/workspace-schema.factory.ts`                                                                                                               | Slow workspace schema builds now log per-stage timings (flat maps, schema artifact cache, generation, resolver creation, makeExecutableSchema)             | Core GraphQL latency is hard to debug without knowing whether the bottleneck is cache fetch, schema artifact miss, or executable schema assembly               |
| `packages/twenty-front/src/modules/object-record/record-table/hooks/useCreateNewIndexRecord.ts`                                                                                           | Replaced with `openDraftInSidePanel` — creates draft in local Jotai store via shared `useDraftRecordDefaults` hook (metadata defaults + Agent prefill + RLS-resolved values), opens side panel, record NOT persisted until user clicks Create | Insurance agents leave required fields blank; draft approach prevents empty records in DB                                                                      |
| `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/usePersistField.ts`                                                                                                | Added draft guard — skips GraphQL mutations for draft records, updates local store only                                                                    | Field edits on draft records must not hit the backend until "Create" is clicked                                                                                |
| `packages/twenty-front/src/modules/object-record/record-show/components/RecordShowEffect.tsx`                                                                                             | Skips `useFindOneRecord` fetch for draft records (`skip: isDraft`)                                                                                         | Draft records don't exist on server; fetching would fail and overwrite local store                                                                             |
| `packages/twenty-front/src/modules/object-record/record-show/components/PageLayoutRecordPageRenderer.tsx`                                                                                 | Conditionally renders "Create" button for drafts vs "Open" button for existing records in side panel footer                                                | Draft records need a Create action, not Open                                                                                                                   |
| `packages/twenty-front/src/modules/command-menu/hooks/useCommandMenuCloseWithValidation.ts`                                                                                               | Discards draft records on close/back — removes from store and draft tracking, no validation modal                                                          | Closing a draft should silently discard it, not prompt for required fields                                                                                     |
| `packages/twenty-front/src/modules/command-menu-item/record/no-selection/components/CreateNewIndexRecordNoSelectionRecordCommand.tsx`                                                     | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes index-page create button through draft creation                                                                                                         |
| `packages/twenty-front/src/modules/command-menu-item/engine-command/record/no-selection/components/CreateNewIndexRecordNoSelectionRecordCommand.tsx`                                      | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Engine-command version of create button must also route through draft creation                                                                                 |
| `packages/twenty-front/src/modules/object-record/record-table/components/RecordTableNoRecordGroupAddNew.tsx`                                                                              | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes "Add New" row through draft creation                                                                                                                    |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-section/components/RecordTableRecordGroupSectionAddNew.tsx`                                                    | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes grouped "Add New" row through draft creation                                                                                                            |
| `packages/twenty-front/src/modules/object-record/record-board/record-board-column/components/RecordBoardColumnNewRecordButton.tsx`                                                        | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes Kanban column "+ New" button through draft creation                                                                                                     |
| `packages/twenty-front/src/modules/object-record/record-board/record-board-column/components/RecordBoardColumnHeader.tsx`                                                                 | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes Kanban column header create through draft creation                                                                                                      |
| `packages/twenty-front/src/modules/object-record/record-calendar/components/RecordCalendarAddNew.tsx`                                                                                     | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes calendar "+" button through draft creation                                                                                                              |
| `packages/twenty-front/src/modules/object-record/record-table/empty-state/components/RecordTableEmptyStateNoGroupNoRecordAtAll.tsx`                                                       | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes empty state create through draft creation                                                                                                               |
| `packages/twenty-front/src/modules/object-record/record-table/empty-state/components/RecordTableEmptyStateNoRecordFoundForFilter.tsx`                                                     | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes empty state create through draft creation                                                                                                               |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderLabelIdentifierCellPlusButton.tsx`                                          | Calls `openDraftInSidePanel` instead of `createNewIndexRecord`                                                                                             | Routes header "+" button through draft creation                                                                                                                |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenSidePanel.ts`                                                               | Creates draft in store with FK prefills instead of immediately creating related record; uses shared `useDraftRecordDefaults` hook for metadata defaults + Agent prefill + RLS-resolved values                                    | Routes relation "+" button through draft creation; shares one source of truth with `useCreateNewIndexRecord` so both paths prefill the same fields for member-role agents |
| `packages/twenty-front/src/modules/command-menu-item/record/single-record/components/CreateRelatedRecordCommand.tsx`                                                                      | Creates draft in store instead of immediately creating related record                                                                                      | Routes command palette "Create related" through draft creation                                                                                                 |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationManyToOneFieldInput.tsx`                                                             | `handleCreateNew` no longer awaits record ID return (draft is async)                                                                                       | Adapted for draft-based creation flow                                                                                                                          |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationOneToManyFieldInput.tsx`                                                             | `handleCreateNew` no longer awaits record ID return (draft is async)                                                                                       | Adapted for draft-based creation flow                                                                                                                          |

## Custom Frontend (Draft Record Creation)

| File                                                                                                       | Purpose                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/twenty-front/src/modules/object-record/record-side-panel/states/draftRecordIdsState.ts`          | Jotai atom tracking draft record IDs with metadata (object type, hidden fields, post-creation callback)                                                                                                                                                                                                      |
| `packages/twenty-front/src/modules/command-menu-item/components/RecordShowSidePanelCreateRecordButton.tsx` | "Create" button for side panel footer — persists draft to DB, validates required fields, runs post-creation callbacks                                                                                                                                                                                        |
| `packages/twenty-front/src/modules/object-record/hooks/useDraftRecordDefaults.ts`                          | Shared hook that produces seed values for a fresh draft record (metadata defaults + system fields + direct Agent prefill + RLS-resolved values). Consumed by both `useCreateNewIndexRecord` and `useAddNewRecordAndOpenSidePanel` so index-page and relation-section draft creation prefill the same fields. |

## Relation Sub-Field Table Columns

Allows users to add columns like "Lead / Date of Birth" or "Agent / NPN" directly in table views by setting `subFieldName` on ViewField entries.

| File                                                                                                                      | What We Changed                                                  | Why                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `packages/twenty-server/src/engine/metadata-modules/view-field/entities/view-field.entity.ts`                             | Added `subFieldName` column and updated unique index             | Stores which sub-field of a relation to display |
| `packages/twenty-server/src/engine/metadata-modules/view-field/dtos/inputs/create-view-field.input.ts`                    | Added `subFieldName` to DTO                                      | Allow creating sub-field ViewFields via GraphQL |
| `packages/twenty-server/src/engine/metadata-modules/view-field/dtos/view-field.dto.ts`                                    | Exposed `subFieldName` in GraphQL type                           | Frontend needs to read it                       |
| `packages/twenty-front/src/modules/views/types/ViewField.ts`                                                              | Added `subFieldName` to type                                     | Frontend type                                   |
| `packages/twenty-front/src/modules/object-record/record-field/types/RecordField.ts`                                       | Added `subFieldName` to type                                     | Frontend type                                   |
| `packages/twenty-front/src/modules/views/graphql/fragments/viewFieldFragment.ts`                                          | Added `subFieldName` to fragment                                 | Fetch sub-field info                            |
| `packages/twenty-front/src/modules/views/utils/mapViewFieldsToColumnDefinitions.ts`                                       | Handle sub-field ViewFields by building custom ColumnDefinitions | Core column resolution                          |
| `packages/twenty-front/src/modules/views/components/ViewFieldsHiddenDropdownSection.tsx`                                  | Added relation sub-field expansion in column picker              | UX for adding sub-field columns                 |
| `packages/twenty-front/src/modules/object-record/record-field/ui/components/FieldDisplay.tsx`                             | Routes sub-field columns to RelationSubFieldDisplay              | Cell rendering                                  |
| `packages/twenty-front/src/modules/command-menu-item/record/multiple-records/components/ExportMultipleRecordsCommand.tsx` | Merges sub-field columns into export relation configs            | Export integration                              |

## Custom Server Modules (Entirely New)

These directories are 100% Omnia code. Upstream won't touch them, but verify they're still registered in their parent modules.

### `packages/twenty-server/src/modules/agent-profile/`

- `agent-profile.module.ts` — Module registration
- `services/agent-profile-resolver.service.ts` — Resolves AgentProfile ID from WorkspaceMember ID for RLS and pre-query hooks

### `packages/twenty-server/src/modules/policy/`

- `query-hooks/policy-create-one.pre-query.hook.ts` — Auto-assigns agentId + derives name before insert (required for RLS)
- `query-hooks/policy-create-many.pre-query.hook.ts` — Same for bulk create
- `query-hooks/policy-create-one.post-query.hook.ts` — Sets submittedDate, LTV after insert
- `query-hooks/policy-create-many.post-query.hook.ts` — Same for bulk
- `query-hooks/policy-update-one.pre-query.hook.ts` — Re-derives name on carrier/product change + **configurable edit window enforcement** (reads `editWindowMinutes` from `rolesPermissions` cache per role/object, null = no restriction; admins always bypass)
- `query-hooks/policy-update-many.pre-query.hook.ts` — Same for bulk update + same edit window enforcement
- `utils/format-duration.util.ts` — Human-readable duration formatting for edit window error messages
- `query-hooks/policy-update-one.post-query.hook.ts` — Recalculates LTV on update
- `query-hooks/policy-update-many.post-query.hook.ts` — Same for bulk
- `query-hooks/policy-query-hook.module.ts` — Module registration (imports `WorkspaceCacheModule` for role checks)
- `utils/build-policy-display-name.util.ts` — "Carrier - Product" name derivation
- `utils/enrich-policy-after-save.util.ts` — Post-save enrichment (LTV, dates)
- `utils/get-today-for-member.util.ts` — `getNowUtc()` helper (returns UTC ISO string for submittedDate)
- `utils/lookup-carrier-product-commission.util.ts` — LTV lookup from CarrierProduct

### `packages/twenty-server/src/modules/call/`

- `query-hooks/call-create-one.pre-query.hook.ts` — Auto-assigns agentId on call create
- `query-hooks/call-create-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/call-create-one.post-query.hook.ts` — Post-create enrichment
- `query-hooks/call-create-many.post-query.hook.ts` — Same for bulk
- `query-hooks/call-query-hook.module.ts` — Module registration

### `packages/twenty-apps/internal/call-recording/src/compliance/`

Omnia compliance QA — sourced from internal compliance docs (Mandatory Disclosures, Recorded Line Disclosure, Compliance Training, ACA & Ancillary QA Checklists). Lives inside the upstream `call-recording` app since scoring extends `callRecording` rather than introducing a new object. Schema is versioned (`Scorecard.version`) — bump when rules or weights change so historical scores remain interpretable.

- `types.ts` — schema for both rule definitions (Scorecard, Criterion, AutoFail, Rule union including LlmJudge / Keyword / Verbatim / Sequence / Composite / **Conditional** / **Timeband** / ManualOnly) and engine output contract (RuleResult, CriterionResult, AutoFailResult, CallScorability, ScorecardResult, Recommendation, PhaseSegment)
- `canonical-scripts.ts` — verbatim Marketplace + AOR disclosures, recorded-line keywords, presentation-order components, DNC keywords + false-positive guards, HealthSherpa keywords, attribution note (transferred marketplace.gov rep ≠ Omnia compliance), default placeholder pattern for verbatim wildcards
- `scorecards/aca.ts` — ACA-only scorecard (23 criteria + 6 auto-fails)
- `scorecards/ancillary.ts` — Ancillaries-only scorecard (22 criteria + 6 auto-fails; HealthSherpa instead of Commission auto-fail)
- `scorecards/index.ts` — barrel + `SCORECARDS` registry by track

#### `call-recording` data model — compliance extensions

Extended `callRecording` with seven new fields (compliance scoring) and added three new child objects to render scoring results without resorting to JSON blobs.

**Modified:** `src/objects/call-recording.ts` — adds `complianceTrack` (SELECT), `complianceScore` (NUMBER), `complianceStatus` (SELECT), `autoFails` (MULTI_SELECT), `callQualityClassification` (SELECT), `notScorableReason` (TEXT), `disciplinaryDraft` (RICH_TEXT).

**New child objects** (each linked back to `callRecording` via MANY_TO_ONE):
- `src/objects/compliance-violation.ts` — one record per triggered auto-fail (type, startSeconds, endSeconds, quote)
- `src/objects/compliance-criterion-result.ts` — one record per scorecard criterion (criterionId, criterionLabel, phase, result, weight, pointsAwarded, pointsPossible, rationale, quote, startSeconds, requiresManualReview)
- `src/objects/call-phase-segment.ts` — one record per detected call phase (phase, startSeconds, endSeconds)

**New relation field files:**
- `src/fields/compliance-violations-on-call-recording.field.ts` + `src/fields/call-recording-on-compliance-violation.field.ts`
- `src/fields/compliance-criterion-results-on-call-recording.field.ts` + `src/fields/call-recording-on-compliance-criterion-result.field.ts`
- `src/fields/call-phase-segments-on-call-recording.field.ts` + `src/fields/call-recording-on-call-phase-segment.field.ts`

#### Compliance scoring engine

Pure-function scorer that consumes a transcript + scorecard and produces a `ScorecardResult`. Reused for both post-call batch scoring and the live `twenty-companion` flow. Adapted from the deleted compliance-qa app's two-pass pattern (git ref `0fdb6cf111`), restructured around the rule union from `src/compliance/types.ts`.

**Utils (ported from compliance-qa@0fdb6cf111):**
- `src/utils/transcribe-recording.ts` — Deepgram Nova-3 batch transcription with diarization → speaker-labeled `TranscriptSegment[]`
- `src/utils/call-ai.ts` — provider-pluggable LLM wrapper (`callAi`, `parseAiJson`, `callAiJson`). Selects between Twenty's `/rest/ai/generate-text` (production, when `TWENTY_API_URL` + token are set) and direct Anthropic Messages API (dev/CLI, when `ANTHROPIC_API_KEY` is set). Anthropic model overridable via `COMPLIANCE_LLM_MODEL`; default `claude-haiku-4-5-20251001`.

**Scorer (`src/compliance/scorer/`):**
- `transcript.ts` — normalized `Transcript` type + helpers (`sliceByTime`, `filterBySpeaker`, `flattenText`, `renderForLlm`)
- `context.ts` — `ScoringContext` threaded through evaluators
- `evaluators/keyword.ts` — word-boundary matching with `excludePhrases` guards
- `evaluators/verbatim.ts` — Levenshtein / token-Jaccard with placeholder-pattern wildcards
- `evaluators/sequence.ts` — first-mention detection of canonical components, order-violation reporting
- `evaluators/manual-only.ts` — always returns `indeterminate` + `requiresManualReview: true`
- `evaluators/llm-judge.ts` — strict-JSON output via `callAiJson`, falls back to indeterminate on parse failure
- `evaluators/composite.ts` — `mode: 'all' | 'any'` aggregation with verdict ranking
- `evaluators/conditional.ts` — `if`-pass-then-evaluate-`then`; otherwise `not_applicable`
- `evaluators/timeband.ts` — slices transcript to time window before evaluating inner rule
- `evaluators/index.ts` — recursive dispatcher
- `score-criterion.ts` — wraps a `Criterion` → `CriterionResult` (pointsAwarded/possible from `partialCreditValues`)
- `score-auto-fail.ts` — wraps an `AutoFail` → `AutoFailResult`
- `aggregate.ts` — weighted score, status (auto-fail override / pending-review / pass / fail), recommendations / strengths / areasForImprovement
- `index.ts` — top-level `scoreCall(input) → ScorecardResult` entry; supports `mode: 'live' | 'post_call'` filtering by criterion `realtime` flag
- `speaker-resolution.ts` — pre-pass that picks the agent speaker_id from Deepgram diarization (LLM-first via `callAiJson`, deterministic cue-phrase heuristic fallback). `relabelTranscript` rewrites segment speakers from raw diarization ids to `'agent' | 'customer' | 'unknown'` before scoring runs.
- `evaluators/speaker-change-triggered.ts` — for each NEW speaker entering after t=0, evaluates an inner rule on a narrow window starting at the new speaker's first utterance. Aggregates composite-all. Used to enforce re-disclosure on new-party joins deterministically from diarization signal (replaces brittle LLM-judge-on-text approach in `recorded_line_disclosure` auto-fail).
- `scorability.ts` — Pass 0 classifier. Returns `CallScorability` (scorable + reason union from `types.ts`). Heuristic gate first (duration < 15s → too_short; single speaker → no_two_way_conversation), then LLM judge for borderline cases. Fails open to scorable so downstream criteria still run on edge cases (and produce indeterminate routes-to-manual instead of silently rejecting calls).
- `track-detection.ts` — Pass 1 classifier. Returns `TrackDetection` with `aca | ancillary | mixed | unknown`. Heuristic keyword counts first (ACA cues: marketplace / subsidy / QLE / etc; ancillary cues: dental / vision / accident / supplemental / UHF / etc) — when one side dominates by ≥3 hits we trust the heuristic; otherwise the LLM judge confirms with the heuristic counts in context.

Pass 2 (phase segmentation) still TBD; phase scoping degrades gracefully when segments are absent.

**Harness:** `scripts/score-call.ts` — CLI that transcribes an mp3, resolves agent speaker (with `--agent-name` hint), runs the scorer, prints the result. Used for ground-truth iteration.

### `packages/twenty-apps/community/telephony/`

Omnia telephony app — click-to-call, browser softphone, SMS and recording inside Twenty, with a provider-agnostic adapter layer so the same workspace can use Twilio (default) and fail over outbound traffic to Vonage / RingCentral / Aircall when a provider is unhealthy. Inbound stays single-provider per number; routing is outbound-only.

- `src/application-config.ts` — App entry; declares workspace `applicationVariables` for Twilio + Vonage credentials, router policy (`weighted` / `priority` / `cost`), per-provider weights, circuit-breaker thresholds, and feature toggles (recording, AI summary)
- `src/default-role.ts` — Default function role granting CRUD on the app's objects
- `src/modules/shared/universal-identifiers.ts` — All app-level UUIDs (app, role, applicationVariable identifiers) in one place
- `src/modules/core/adapter/types.ts` — Normalized event shape (`TelephonyEvent`), `ProviderId`, `CallStatus`, `SmsStatus` so logic functions don't branch per provider
- `src/modules/core/adapter/telephony-adapter.ts` — `TelephonyAdapter` interface every provider implements (initiateCall / hangup / sendSms / parseWebhook / generateBrowserAccessToken / probe / classifyError)
- `src/modules/core/adapter/circuit-breaker.ts` — Per-provider rolling-window breaker (closed → open → half-open) keyed on error rate + cooldown
- `src/modules/core/adapter/provider-router.ts` — Outbound-only `ProviderRouter` with weighted / priority / cost selection, circuit-breaker filtering, single retry on the next-best provider for transient errors
- `src/modules/twilio/adapter.ts` — Twilio implementation: REST methods (`initiateCall`, `hangup`, `sendSms`), browser AccessToken minting, webhook event parsing, REST probe (`/Accounts/{sid}.json`), error classification by HTTP status + Twilio error code (permanent codes like 21211 short-circuit retries)
- `src/modules/twilio/access-token.ts` — Mints Twilio Voice JS SDK AccessToken JWTs inline (HMAC-SHA256 over the API Key Secret) without pulling in the `twilio` npm package, keeping the app's logic-function bundle minimal
- `src/modules/twilio/webhook-signature.ts` — `X-Twilio-Signature` (HMAC-SHA1) verification + form-body parsing
- `src/modules/twilio/build-adapter.ts` — Constructs a configured `TwilioAdapter` from the workspace's applicationVariables (injected as `process.env` in logic-function processes); fast-fails on missing required credentials.
- `src/modules/core/logic-functions/twilio-webhook.logic-function.ts` — `POST /twilio/webhook`. Reconstructs the canonical URL from `WEBHOOK_PUBLIC_URL` for signature verification, normalizes via the adapter, dispatches per event kind. Call lifecycle handlers (initiated/answered/completed/recording.completed) upsert by `providerCallSid`; SMS handlers (`sms.received`, `sms.delivered`) upsert by `providerMessageSid` and write through the standard `message`/`messageParticipant`/`messageThread`/`messageChannelMessageAssociation` objects via the helpers below.
- `src/modules/core/messaging/helpers.ts` — Centralizes the GraphQL shape for SMS work: `findPersonByPhone`, `findPhoneNumberByE164`, `findActiveAssignmentForNumber`, `resolveAgentForDialedNumber` (two-step lookup since the SDK filter shape is FK-based), `findMessageChannelByHandle`, `findMessageBySid`, `createMessageThread`, `createSmsMessage`, `createMessageParticipant`, `createChannelAssociation`, `updateMessageStatus`. Used by `twilio-webhook` and `twiml-app`.
- `src/modules/core/front-components/Softphone.front-component.tsx` + `src/modules/core/components/Softphone/` — Browser softphone backed by `@twilio/voice-sdk`. Registered as a GLOBAL command (Cmd+K → "Softphone") that opens in a side panel. Handles outbound dialing via the Voice SDK's WebRTC channel, inbound calls via Twilio's `<Dial><Client>{workspaceMemberId}</Client></Dial>`, accept/reject/mute/hangup, DTMF during calls, and AccessToken refresh on the SDK's `tokenWillExpire` event. The `useCurrentWorkspaceMemberId` hook bridges Twenty's `useUserId()` to the workspaceMember id used by TwiML and PhoneAssignment. The hook also listens for a `telephony:dial` window event so the upstream cell action can trigger calls without importing app code.

### Click-to-call cell action (touches upstream)

| File | Modification |
| ---- | ------------ |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/hooks/useGetSecondaryRecordTableCellButton.ts` | Adds an `IconPhoneCall` secondary cell button for phone fields that calls `useDialFromPhoneField().dial(e164)`. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/hooks/useDialFromPhoneField.ts` | New hook that orchestrates click-to-call with auto-open. Writes `{ phoneNumber, ts }` to `localStorage['__omnia_telephony_pending_dial']`, opens the softphone front-component in the side panel via `useOpenFrontComponentInSidePanel` (looking it up by `universalIdentifier` from Apollo cache), and dispatches a `telephony:dial` window event. The softphone hook handles the direct event when already mounted, and reads localStorage on its `ready` transition when newly mounting. Returns `canDial` (true when the softphone front-component is in Apollo cache, i.e. the Telephony app is installed) so detail-page consumers can fall through to the upstream `tel:`/copy behavior when telephony isn't installed. Hardcoded contracts shared with the Telephony app: `TELEPHONY_SOFTPHONE_UNIVERSAL_IDENTIFIER` (= `31069075-0ea1-4f05-a753-758f3eb2fd80`), `TELEPHONY_PENDING_DIAL_STORAGE_KEY`, `TELEPHONY_DIAL_EVENT_NAME`. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/PhonesFieldDisplay.tsx` | When the Telephony app is installed (`canDial === true`), phone clicks on detail pages preventDefault the underlying `tel:` link and route to the softphone via `useDialFromPhoneField().dial(phoneNumber)`. The existing `COPY` click action takes precedence and is unchanged; non-COPY clicks fall through to the upstream `tel:` behavior when telephony isn't installed. |
- `src/modules/core/logic-functions/initiate-call.logic-function.ts` — `POST /initiate-call`: server-initiated outbound voice via the configured provider; the Call workspace row is created by the webhook handler, not here.
- `src/modules/core/logic-functions/send-sms.logic-function.ts` — `POST /send-sms`: outbound SMS / MMS; the message row is created by the delivery-callback webhook keyed on `providerMessageSid`.
- `src/modules/core/logic-functions/generate-access-token.logic-function.ts` — `POST /twilio/access-token`: returns a short-lived Voice JS SDK AccessToken for the agent's browser softphone identity.
- `src/modules/core/logic-functions/twiml-app.logic-function.ts` — `POST /twilio/twiml`: dynamic TwiML returned to Twilio. For inbound, looks up the agent assignment by dialed E.164 (active `phoneAssignment` with `webrtcEnabled = true`) and dials `<Client>{memberId}</Client>`; for outbound, dials the destination, optionally bridged to an agent client passed via `?agent=` query.
- `src/modules/core/logic-functions/{search,buy,release,assign,release-assignment}-numbers.logic-function.ts` — Five endpoints under `/numbers/*` powering the CSO settings UI: search available numbers at the provider, buy (provisions + writes `phoneNumber` row + provisions matching SMS `messageChannel` + optional initial assignment, sets VoiceUrl/SmsUrl on the new IncomingPhoneNumber so inbound traffic routes from the moment of purchase), release (provider release + soft-delete `phoneNumber` + soft-delete active assignments), assign (append-only with optional `replaceExisting` for the reassign flow), release-assignment (soft-delete only). All mutations preserve historic call/SMS attribution via `onDelete: SET_NULL` on the relations.
- `src/modules/core/front-components/NumberManagement.front-component.tsx` + `src/modules/core/components/NumberManagement/` — CSO-facing settings UI. Mounted as a GLOBAL command (Cmd+K → "Manage telephony numbers") that opens in a side panel. Three flows: list existing numbers with their active assignment + Reassign / Unassign / Release inline actions; buy a new number via area-code / contains search → pick from results → optionally assign on purchase; reassign via member dropdown. All mutations dispatch through the `/numbers/*` logic-function endpoints so business rules stay server-side.
- `src/modules/core/objects/call.ts` — `Call` workspace object: name, direction, status, from/to, started/answered/ended timestamps, duration, recording URL, transcript, summary, provider, provider call SID, cost (CURRENCY composite)
- `src/modules/core/objects/phone-number.ts` — `PhoneNumber` workspace object: workspace-owned numbers (E.164, friendly name, provider, providerNumberSid, voice/sms/mms capabilities, monthly price as CURRENCY). The CSO buys these from the provider; agency owns them, not agents.
- `src/modules/core/objects/phone-assignment.ts` — `PhoneAssignment` join object linking a `PhoneNumber` to a `WorkspaceMember`. Append-only with platform soft-delete: reassignment is `softDelete(old) + create(new)` so historic calls/SMS keep their original member attribution. Fields: name, isDefault, outboundCallerId, webrtcEnabled, forwardToPersonalNumber.
- `src/modules/core/fields/` — Five RELATION pairs (10 files), each defining both sides with `onDelete: SET_NULL` so history survives parent removal: `phoneAssignment ↔ phoneNumber`, `phoneAssignment ↔ workspaceMember`, `call ↔ person`, `call ↔ workspaceMember` (agent attribution), `call ↔ phoneNumber` (which workspace DID was used).
- `src/modules/core/fields/{status,provider,provider-message-sid,cost}-on-message.field.ts` — SMS reuses Twenty's standard `message` / `messageParticipant` / `messageChannel` objects (channel `type: SMS` is already a first-class enum upstream). These four scalar fields are added to the standard `message` object via app-level `defineField` rather than editing upstream code, so the SMS lifecycle (status, provider attribution, provider SID for callback dedup, cost as CURRENCY) lands on real columns of the `message` table without any upstream-file changes. Email rows leave them null. MMS attachments use the existing `attachment` standard object via `targetMessage`.

### `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/`

Full ingestion pipeline engine — configurable pull/push data pipelines with field mappings, preprocessors, scheduling, and logging.

- `ingestion-pipeline.module.ts` — Module registration
- `entities/ingestion-pipeline.entity.ts` — Pipeline entity (mode, schedule, source config, auth, pagination, dedup)
- `entities/ingestion-field-mapping.entity.ts` — Per-field mapping entity (source path → target field, transforms)
- `entities/ingestion-log.entity.ts` — Ingestion run log (status, counts, errors, incoming payload)
- `services/ingestion-pipeline.service.ts` — CRUD + test execution for pipelines
- `services/ingestion-pull-scheduler.service.ts` — Cron-based pull scheduling on server startup
- `services/ingestion-record-processor.service.ts` — Processes ingested rows: maps fields, resolves relations, upserts records (atomic dedup via unique index + unique_violation catch)
- `services/ingestion-relation-resolver.service.ts` — Resolves relation fields by lookup during ingestion
- `services/ingestion-field-mapping.service.ts` — CRUD for field mappings
- `services/ingestion-log.service.ts` — Log queries and creation
- `controllers/ingestion-pipeline-webhook.controller.ts` — Push-mode webhook endpoint (receives external payloads)
- `jobs/ingestion-pull.job.ts` — BullMQ job: fetches data from source URL, processes records
- `jobs/ingestion-push-process.job.ts` — BullMQ job: processes pushed webhook payloads
- `jobs/ingestion-job.module.ts` — Job module registration
- `resolvers/ingestion-pipeline.resolver.ts` — GraphQL CRUD + test mutation
- `resolvers/ingestion-field-mapping.resolver.ts` — GraphQL CRUD for field mappings
- `resolvers/ingestion-log.resolver.ts` — GraphQL log queries
- `preprocessors/ingestion-preprocessor.registry.ts` — Registry for pipeline-specific preprocessors
- `preprocessors/old-crm-policy.preprocessor.ts` — Old CRM policy ingestion: person resolution, carrier/product creation, `parseDateTimeAsEastern()` for `submittedDate` (Eastern → UTC)
- `preprocessors/healthsherpa-policy.preprocessor.ts` — HealthSherpa policy ingestion preprocessor
- `preprocessors/convoso-call.preprocessor.ts` — Convoso call ingestion preprocessor; inbound calls routed to the System agent (no human handled them) are forced non-billable
- `preprocessors/convoso-lead.preprocessor.ts` — Convoso lead ingestion preprocessor
- `utils/build-record-from-mappings.util.ts` — Builds record from field mappings + source data
- `utils/apply-field-transform.util.ts` — Field value transforms (date, number, etc.)
- `utils/extract-value-by-path.util.ts` — Dot-path value extraction from nested objects
- `database/typeorm/core/migrations/common/1771284860000-add-ingestion-pipeline-entities.ts` — **Migration** creating `ingestionPipeline`, `ingestionFieldMapping`, `ingestionLog` tables
- `database/typeorm/core/migrations/common/1771400000000-add-ingestion-log-incoming-payload.ts` — **Migration** adding `incomingPayload` column to `ingestionLog`
- `database/typeorm/core/migrations/common/1775300000000-dedup-calls-and-add-unique-index.ts` — **Migration** deduplicates existing call records by `convosoCallId` and adds a unique partial index

### `packages/twenty-server/src/modules/lead/`

- `query-hooks/lead-create-one.pre-query.hook.ts` — Lead pre-processing
- `query-hooks/lead-create-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/person-create-one.pre-query.hook.ts` — Person/Lead creation hooks
- `query-hooks/person-create-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/lead-query-hook.module.ts` — Module registration

## Modified Upstream Frontend Files

### Signed-Out Auth Background

| File                                                                                                                                                        | Modification                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockContainer.tsx`                                                    | Keeps the real `ViewBar` + `RecordTableWithWrappers` path, targets the people/leads mock object, and waits for auth view state before mounting the toolbar |
| `packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockContainerEffect.tsx`                                              | Seeds only the auth-background table/view-bar atoms from lead-shaped person metadata and forces the drawer open on desktop                                 |
| `packages/twenty-front/src/modules/sign-in-background-mock/components/SignInAppNavigationDrawerMock.tsx`                                                    | Signed-out sidebar preserves the real nav shell but pins auth-background labels/order to Leads, Policies, Notes, Tasks                                     |
| `packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockPage.tsx`                                                         | Signed-out page header now reads the lead label from auth-only metadata while keeping the underlying person icon                                           |
| `packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockConfig.ts`                                                         | Shared auth-background config switches the mock object from `company/companies` to `person/people`                                                         |
| `packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockColumnDefinitions.ts`                                              | Signed-out auth table now mirrors the lead shell columns: Name, Status, Emails, Phones, Lead Source, Assigned Agent, Policies, Address                     |
| `packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockRecords.ts`                                                        | Mock people/leads records now include lead status, lead source, assigned agent, policies, and address data                                                 |
| `packages/twenty-front/src/modules/sign-in-background-mock/utils/signInBackgroundMockMetadata.ts`                                                           | Adds auth-only person field metadata plus lightweight lead-source/policy objects so the signed-out table can use native chips/selects                      |
| `packages/twenty-front/src/modules/context-store/components/MainContextStoreProvider.tsx`                                                                   | Main context store now follows the shared auth-background object config instead of hardcoded companies                                                     |
| `packages/twenty-front/src/modules/context-store/components/MainContextStoreProviderEffect.tsx`                                                             | Signed-out auth modal now owns the main context-store table view type so logout cannot loop between auth and route-level context initializers              |
| `packages/twenty-front/src/modules/metadata-store/utils/preloadMockedMetadata.ts`                                                                           | Signed-out mocked metadata is extended so person labels/views read as Lead/Leads and expose auth-only lead fields                                          |
| `packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexTableQuery.ts`                                                            | Auth-modal mock record injection is scoped to the sign-in record table so it does not leak into other views                                                |
| `packages/twenty-front/src/modules/object-record/record-table/virtualization/hooks/useTriggerInitialRecordTableDataLoad.ts`                                 | Initial record-table loading injects mock people/leads only for the auth background table                                                                  |
| `packages/twenty-front/src/modules/views/hooks/internal/useGetRecordIndexTotalCount.ts`                                                                     | Signed-out `ViewBar` uses the local auth-background mock count instead of firing aggregate GraphQL requests                                                |
| `packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownClickableComponent.tsx` | Drawer header falls back to public workspace data so the signed-out shell still shows the workspace name/logo                                              |
| `packages/twenty-front/src/modules/auth/hooks/useAuth.ts`                                                                                                   | Logout navigates to `SignInUp` before swapping to mocked metadata so protected routes do not crash during sign-out                                         |

### Spreadsheet Import (CSV Import/Export)

| File                                                                                                   | Modification                                                                          |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `spreadsheet-import/types/SpreadsheetImportField.ts`                                                   | Added `isRelationUpdateField` and `targetFieldMetadataItem` properties                |
| `object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields.ts`                            | Added relation update fields to import dropdown                                       |
| `object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts`                | Execute relation updates after parent upsert; show import results summary dialog      |
| `object-record/hooks/useBatchCreateManyRecords.ts`                                                     | Handle IMPORT_PARTIAL_SUCCESS per-batch, collect warnings, continue remaining batches |
| `object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow.ts`                       | Explicit `isRelationConnectField` filter                                              |
| `object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV.ts`                         | Added `skipRelationFieldNames` param for sub-field export                             |
| `command-menu-item/record/multiple-records/components/ExportMultipleRecordsCommand.tsx`                | Derives relation export configs from view sub-field columns                           |
| `command-menu-item/engine-command/record/multiple-records/components/ExportMultipleRecordsCommand.tsx` | Derives relation export configs from view sub-field columns                           |
| `spreadsheet-import/utils/dataMutations.ts`                                                            | Trim whitespace before validation                                                     |
| `spreadsheet-import/utils/normalizeTableData.ts`                                                       | Trim whitespace on matched column values                                              |
| `spreadsheet-import/utils/setColumn.ts`                                                                | Widened `field` param to accept `ReadonlyDeep<SpreadsheetImportField>` (read-only)    |
| `spreadsheet-import/utils/getMatchedColumnsWithFuse.ts`                                                | Added optional `precomputedMatches` param for carrier-config-driven pre-fill          |

### New Spreadsheet Import Utilities

| File                                                                                        | Purpose                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldKey.ts`   | Key format for update fields                                      |
| `object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldLabel.ts` | Label format for update fields                                    |
| `spreadsheet-import/components/ImportResultsSummary.tsx`                                    | Post-import summary dialog with issue list and CSV download       |
| `spreadsheet-import/utils/generateProblemRowsCsv.ts`                                        | Generate downloadable CSV of problem rows for re-import           |
| `spreadsheet-import/utils/scoreLeadMatch.ts`                                                | Fuzzy Lead matching: 100-point scoring (email/name/phone/address) |
| `spreadsheet-import/utils/findLeadCandidates.ts`                                            | Search for candidate Leads by email/name via GraphQL ILIKE        |
| `spreadsheet-import/utils/applyLeadResolutions.ts`                                          | Execute fuzzy match decisions: update/reassign/create Lead        |

### Server-Side Export Worker

Moves CSV export from browser-only to a BullMQ background job. The server fetches records, generates CSV with relation expansion, stores via FileStorageService, and the frontend polls for completion then auto-downloads.

**New server module: `packages/twenty-server/src/engine/core-modules/export-job/`**

| File                                    | Purpose                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `enums/export-job-status.enum.ts`       | PENDING/PROCESSING/COMPLETED/FAILED/CANCELLED status enum              |
| `entities/export-job.entity.ts`         | TypeORM entity for `core.exportJob` table                              |
| `dtos/export-job.dto.ts`                | GraphQL DTOs for export job state                                      |
| `export-job.service.ts`                 | Creates jobs, queues to BullMQ, publishes progress via subscriptions   |
| `export-job.resolver.ts`                | GraphQL mutations (start/cancel), query, subscription                  |
| `export-job.module.ts`                  | NestJS module                                                          |
| `jobs/export-job.processor.ts`          | BullMQ processor: batched fetch, filter parsing, CSV gen, file storage |
| `jobs/export-job-processor.module.ts`   | Processor module registration                                          |
| `utils/process-records-for-csv.util.ts` | Server-side CSV transformation (CURRENCY, RELATION, composite)         |

**New migration:**

| File                                                                             | Purpose                        |
| -------------------------------------------------------------------------------- | ------------------------------ |
| `database/typeorm/core/migrations/common/1774400000000-add-export-job-entity.ts` | Creates `core.exportJob` table |

**New frontend files:**

| File (under `packages/twenty-front/src/modules/`)                          | Purpose                                      |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| `object-record/record-index/export/graphql/mutations/startExportJob.ts`    | GraphQL mutation to start server-side export |
| `object-record/record-index/export/graphql/mutations/cancelExportJob.ts`   | GraphQL mutation to cancel export            |
| `object-record/record-index/export/graphql/queries/exportJob.ts`           | GraphQL query to poll export status          |
| `object-record/record-index/export/states/activeExportJobState.ts`         | Jotai atom for active export tracking        |
| `object-record/record-index/export/hooks/useExportJobProgress.ts`          | Poller, recovery, tracking hooks             |
| `object-record/record-index/export/components/ExportJobRecoveryEffect.tsx` | Mounts recovery+poller in app root           |

**Modified upstream files:**

| File                                                                                                      | Modification                                                  |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/twenty-shared/src/types/FileFolder.ts`                                                          | Added `Export = 'export'`                                     |
| `packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts`                 | Added `exportQueue` and `reconciliationQueue` (Reconciliation v2) |
| `packages/twenty-server/src/engine/core-modules/message-queue/message-queue-priority.constant.ts`         | Added export queue + reconciliation queue priorities          |
| `packages/twenty-server/src/engine/core-modules/message-queue/message-queue-concurrency.constant.ts`      | Added export queue concurrency                                |
| `packages/twenty-server/src/engine/subscriptions/enums/subscription-channel.enum.ts`                      | Added `EXPORT_JOB_PROGRESS`                                   |
| `packages/twenty-server/src/engine/core-modules/message-queue/jobs.module.ts`                             | Registered `ExportJobProcessorModule`                         |
| `packages/twenty-server/src/engine/core-modules/core-engine.module.ts`                                    | Registered `ExportJobModule`                                  |
| `packages/twenty-server/src/engine/core-modules/file/guards/file-by-id.guard.ts`                          | Added `FileFolder.Export` to `SUPPORTED_FILE_FOLDERS`         |
| `packages/twenty-server/src/engine/core-modules/file/interfaces/file-folder.interface.ts`                 | Added `Export` folder config                                  |
| `packages/twenty-front/src/modules/app/components/AppRouterProviders.tsx`                                 | Mounted `ExportJobRecoveryEffect`                             |
| `packages/twenty-front/src/modules/command-menu-item/record/.../ExportMultipleRecordsCommand.tsx`         | Rewired to call server mutation instead of browser-side fetch |
| `packages/twenty-front/src/modules/command-menu-item/engine-command/.../ExportMultipleRecordsCommand.tsx` | Rewired to call server mutation instead of browser-side fetch |
| `packages/twenty-front/src/modules/ui/feedback/background-job-indicator/states/backgroundJobState.ts`     | Added optional `downloadUrl` to `BackgroundJobData`           |
| `packages/twenty-front/src/modules/ui/feedback/background-job-indicator/.../BackgroundJobIndicator.tsx`   | Added auto-dismiss on success (5s)                            |

### Server-Side Import: Upsert Relation Connect Tolerance

| File                                                                                    | Modification                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `engine/twenty-orm/field-operations/relation-nested-queries/relation-nested-queries.ts` | Skip failed connects on upsert; auto-create missing records; collect `ImportRecordWarning`s            |
| `engine/twenty-orm/repository/workspace-insert-query-builder.ts`                        | Pass `isUpsert` flag; throw `IMPORT_PARTIAL_SUCCESS` with warnings after data committed                |
| `engine/twenty-orm/repository/workspace-update-query-builder.ts`                        | Pass `isUpsert: true`; throw `IMPORT_PARTIAL_SUCCESS` with warnings after data committed               |
| `engine/twenty-orm/utils/compute-relation-connect-query-configs.util.ts`                | When `id` is in connect where clause, use only `id` for matching (ignore stale email/other fields)     |
| `engine/twenty-orm/exceptions/twenty-orm.exception.ts`                                  | Added `IMPORT_PARTIAL_SUCCESS` exception code                                                          |
| `engine/twenty-orm/utils/twenty-orm-graphql-api-exception-handler.util.ts`              | Handle `IMPORT_PARTIAL_SUCCESS` — return `importWarnings` and `savedRecordCount` in GraphQL extensions |

### RLS and Permissions

| File                                                                  | Modification                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `object-record/hooks/useBuildRecordInputFromRLSPredicates.ts`         | **CRITICAL** — Indirect relation resolution for Agent → WorkspaceMember |
| `settings/roles/.../SettingsRolePermissionsObjectLevelObjectForm.tsx` | Removed Organization plan billing gate                                  |

### Action-Scoped RLS (Read vs Write)

| File                                                                                                                                     | Modification                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `settings/roles/.../record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx`                        | Splits record-level permissions into three builders: `Read + write`, `Read only`, `Write only`                   |
| `settings/roles/.../record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilder.tsx`        | Builder instance ids are scope-specific so per-scope drafts do not bleed into each other                         |
| `settings/roles/.../record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilderContent.tsx` | Threads scope through initialization and draft sync                                                              |
| `settings/roles/.../record-level-permissions/hooks/useRecordLevelPermissionFilterInitialization.ts`                                      | Hydrates only predicates/groups for the selected object + scope                                                  |
| `settings/roles/.../record-level-permissions/hooks/useRecordLevelPermissionSyncToDraftRole.ts`                                           | Replaces only the selected object + scope slice when editing                                                     |
| `settings/roles/.../record-level-permissions/utils/recordLevelPermissionPredicateConversion.ts`                                          | Converts draft filters/groups into scoped predicates/groups                                                      |
| `settings/roles/role/hooks/useSaveDraftRoleToDB.ts`                                                                                      | Persists predicate/group `scope` back to GraphQL                                                                 |
| `generated-metadata/graphql.ts`                                                                                                          | Regenerated metadata GraphQL types include `RowLevelPermissionPredicateScope` and predicate/group `scope` fields |

**Omnia policy configuration target:**

- Member role should have no Policy `ALL` or `READ` row-level predicates.
- Member role should keep a `WRITE`-scoped Policy predicate matching policy ownership (`policy.agent`) to the current workspace member/agent chain.
- Result: agents can search and view all policies, but create/update/delete/restore is restricted to their own policies.

**Regression hit on March 11, 2026:**

- Symptom: `Member -> Policy -> Write only -> Agent is Me` looked correct in Settings, but policy create/edit still failed with `Record does not satisfy security constraints`.
- Root cause: the scoped RLS rollout correctly split `READ` vs `WRITE`, but relation-based dynamic `Me` predicates were still treating `workspaceMember.id` as if it matched `policy.agentId` directly. For policies, the real path is `policy.agentId -> agentProfile.id -> agentProfile.workspaceMemberId -> workspaceMember.id`.
- Frontend fix: `useBuildRecordInputFromRLSPredicates.ts` now only uses `ALL + WRITE` predicates for record creation and pre-resolves the intermediate relation record ID before prefilling `agentId`. `useFilteredSelectOptionsFromRLSPredicates.ts` also limits editable option filtering to `ALL + WRITE`.
- Backend fix: `build-row-level-permission-record-filter.util.ts` now resolves relation-based `Me` predicates through the relation target object's link back to `workspaceMember`, then builds the final filter against the resolved related record IDs.
- Why pre-query hooks were not enough: Omnia's policy pre-query hooks still auto-assign `agentId`, but backend `WRITE`-scope RLS validation runs independently and must also understand the `workspaceMember -> agentProfile -> policy.agent` chain.
- Regression coverage: `packages/twenty-server/src/engine/twenty-orm/utils/__tests__/build-row-level-permission-record-filter.util.spec.ts` covers the exact `policy.agent = Me` relation-resolution case.

**Performance regression hit on March 11, 2026:**

- Symptom: production GraphQL requests became extremely slow after the scoped RLS rollout even though server pods were healthy and under low CPU load.
- Root cause: the new relation-aware RLS builder was recomputing the same role/object/scope filter and re-resolving the same linked-record IDs many times within a single GraphQL request as resolvers fanned out.
- Backend fix: `workspace-entity-manager.ts` now seeds a request-scoped RLS computation cache into the AsyncLocal ORM workspace context, and `build-row-level-permission-record-filter.util.ts` memoizes both resolved relation values and final record filters per request. `apply-row-level-permission-predicates.util.ts` and `validate-rls-predicates-for-records.util.ts` both reuse that same cache.
- Files that matter: `engine/twenty-orm/types/workspace-rls-computation-cache.type.ts`, `engine/twenty-orm/storage/orm-workspace-context.storage.ts`, `engine/twenty-orm/interfaces/workspace-internal-context.interface.ts`, `engine/twenty-orm/entity-manager/workspace-entity-manager.ts`, and `engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts`.
- Regression coverage: `packages/twenty-server/src/engine/twenty-orm/utils/__tests__/build-row-level-permission-record-filter.util.spec.ts` now verifies identical relation-based RLS computations are reused within one request context instead of hitting the database repeatedly.

**Metadata endpoint audit on March 11, 2026:**

- Finding: the latest scoped-RLS hotfix does not materially affect `FindAllRecordPageLayouts`, because page layouts are served from `PageLayoutService` via workspace flat-entity caches, not the ORM RLS query builder.
- Finding: `ObjectMetadataItems` is forced through `network-only` on app boot, but is protected by the metadata response cache. `FindAllRecordPageLayouts`, `FindFieldsWidgetCoreViews`, and `FindManyLogicFunctions` are also part of the boot metadata load path and were not cached server-side.
- Backend fix: `metadata.module-factory.ts` now caches those boot metadata operations, and `use-cached-metadata.ts` treats `FindFieldsWidgetCoreViews` like `FindAllCoreViews` by keeping the cache key user-scoped.
- Files that matter: `engine/api/graphql/metadata.module-factory.ts`, `engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts`, `modules/users/components/LazyMetadataLoadEffect.tsx`, and `modules/metadata-store/effect-components/ObjectMetadataProviderInitialEffect.tsx`.

**GraphQL / metadata observability pass on March 11, 2026:**

- Goal: capture the next prod slowdown without adding per-request log spam or meaningful runtime overhead.
- Shared helper: `slow-path-observer.util.ts` centralizes thresholded timing warnings so future audits can instrument hot paths without hand-rolling timers or logging every request.
- Metadata instrumentation: `use-cached-metadata.ts` now records timing only for cache misses and warns when a miss crosses the slow threshold via the shared helper.
- Cache instrumentation: `workspace-cache.service.ts` now warns separately for slow Redis hash validation, slow Redis data fetches, slow provider recomputes, and slow overall workspace-cache resolution via the shared helper.
- Core GraphQL instrumentation: `graphql-config.service.ts` now warns when schema resolution is slow, splitting `moduleRef.resolve()` from `WorkspaceSchemaFactory.createGraphQLSchema()` via the shared helper.
- Schema build instrumentation: `workspace-schema.factory.ts` now warns with stage timings for data-source lookup, flat-map fetch, metadata-version fetch, schema-artifact cache lookup, schema generation, resolver creation, and `makeExecutableSchema()` via the shared helper.
- Why this matters: local remained fast while prod was slow, so we need cheap evidence to distinguish edge/network issues from Redis/cache misses versus core schema construction.

### Relation Picker Filtering (Policy Assignment)

| File                                                                                                 | Modification                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record-field-list/.../RecordDetailRelationSectionDropdownToOne.tsx`                                 | Junction bridge filter fix + resolves dependency filter to id-based via `useFindManyRecords` (search API can't filter by object-specific fields like `carrierId`) |
| `record-field-list/.../RecordDetailRelationSectionDropdownToMany.tsx`                                | Allowlists only eligible policies (`leadId` is null or the current lead) in the lead detail sidebar policy picker                                                 |
| `record-picker/single-record-picker/components/SingleRecordPicker.tsx`                               | Passes `additionalFilter` through to `SingleRecordPickerMenuItemsWithSearch` (was silently dropped)                                                               |
| `record-picker/multiple-record-picker/components/MultipleRecordPicker.tsx`                           | Restores shared `additionalFilter` prop/state sync for multi-select relation pickers                                                                              |
| `record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts`                 | Combines `additionalFilter` with selected/excluded ID filters so lead policy allowlists persist across typing/load-more                                           |
| `record-picker/multiple-record-picker/states/multipleRecordPickerExcludedRecordIdsComponentState.ts` | **NEW** — Atom for persisting excluded record IDs across picker searches                                                                                          |
| `record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter.ts`                                   | **NEW** — Central helper building the lead → policy allowlist filter (`leadId` null or current lead only)                                                         |
| `record-field/ui/meta-types/input/components/RelationOneToManyFieldInput.tsx`                        | Reuses the same lead-policy allowlist filter for inline/table-cell policy pickers and waits for it before showing results                                         |
| `record-field/ui/meta-types/input/hooks/useOpenRelationFromManyFieldInput.tsx`                       | Removed `performSearch` — initial search moved to `RelationOneToManyFieldInput` so the lead-policy allowlist is ready before any picker results show              |
| `record-field/ui/hooks/useOpenFieldInputEditMode.ts`                                                 | Removed unused `excludedRecordIds` param                                                                                                                          |

### Required Fields (Per-Field Validation with Conditional Rules)

| File                                                                                                        | Modification                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm.tsx`                        | **NEW** — Required toggle + conditional rule builder (Always / When [field] is [empty/not empty])                                                                                      |
| `settings/data-model/fields/forms/components/SettingsDataModelFieldSettingsFormCard.tsx`                    | Added `requiredCondition` to all field type form schemas + renders Required form                                                                                                       |
| `settings/data-model/fields/forms/number/components/SettingsDataModelFieldNumberSettingsFormCard.tsx`       | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/components/text/SettingsDataModelFieldTextSettingsFormCard.tsx`           | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/date/components/SettingsDataModelFieldDateSettingsFormCard.tsx`           | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/phones/components/SettingsDataModelFieldPhonesSettingsFormCard.tsx`       | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/address/components/SettingsDataModelFieldAddressSettingsFormCard.tsx`     | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/boolean/components/SettingsDataModelFieldBooleanSettingsFormCard.tsx`     | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/currency/components/SettingsDataModelFieldCurrencySettingsFormCard.tsx`   | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/select/components/SettingsDataModelFieldSelectSettingsFormCard.tsx`       | Added Required form                                                                                                                                                                    |
| `settings/data-model/fields/forms/morph-relation/components/SettingsDataModelFieldRelationFormCard.tsx`     | Added Required form                                                                                                                                                                    |
| `object-metadata/utils/formatFieldMetadataItemInput.ts`                                                     | Added `requiredCondition` to field update payload                                                                                                                                      |
| `object-metadata/hooks/useUpdateOneFieldMetadataItem.ts`                                                    | Added `requiredCondition` to mutation payload type                                                                                                                                     |
| `object-metadata/graphql/fragment.ts`                                                                       | Added `requiredCondition` to `fieldsList` GraphQL fragment                                                                                                                             |
| `object-metadata/utils/formatFieldMetadataItemAsFieldDefinition.ts`                                         | Passes `requiredCondition` into `FieldDefinition`                                                                                                                                      |
| `object-record/record-field/ui/types/FieldDefinition.ts`                                                    | Added `RequiredCondition` type and `requiredCondition` field                                                                                                                           |
| `object-record/record-inline-cell/components/RecordInlineCellDisplayMode.tsx`                               | Removed `useIsFieldRequired` from table cells (perf: 900+ jotai subs); required indicators only in sidebar detail view                                                                 |
| `object-record/record-field/ui/hooks/useIsFieldRequired.ts`                                                 | **NEW** — Hook evaluating `requiredCondition` against current field/record state                                                                                                       |
| `object-record/record-field-list/record-detail-section/components/RecordDetailSectionContainer.tsx`         | Red title label when `isRequired` prop is true (non-widget layout path)                                                                                                                |
| `object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSection.tsx` | Passes `isRequired` from `useIsFieldRequired` to section container                                                                                                                     |
| `page-layout/widgets/field/components/FieldWidget.tsx`                                                      | Computes `isRequiredEmpty` for relation widgets, sets widget-level state for red title; setter removed from useEffect deps (perf: prevents ~20 spurious state updates per record load) |
| `page-layout/widgets/widget-card/components/WidgetCardHeader.tsx`                                           | Added `isRequiredEmpty` prop — turns title red when relation is required and empty                                                                                                     |
| `page-layout/widgets/components/WidgetRenderer.tsx`                                                         | Reads `widgetCardRequiredEmptyComponentFamilyState` and passes to `WidgetCardHeader`                                                                                                   |
| `page-layout/widgets/states/widgetCardRequiredEmptyComponentFamilyState.ts`                                 | **NEW** — Jotai family state for per-widget required-empty status                                                                                                                      |
| `generated-metadata/graphql.ts`                                                                             | Added `requiredCondition` to Field type, CreateFieldInput, UpdateFieldInput, and all query fragments                                                                                   |
| `object-record/record-field/ui/hooks/useRecordRequiredFieldViolations.ts`                                   | **NEW** — Batch validation: returns all required-field violations for a record (used by close validation)                                                                              |
| `object-record/record-side-panel/states/newlyCreatedRecordIdsState.ts`                                      | **NEW** — Jotai atom tracking record IDs created via the side panel (was `record-right-drawer/`)                                                                                       |
| `side-panel/hooks/useOpenRecordInSidePanel.ts`                                                              | Adds record ID to `newlyCreatedRecordIdsState` when `isNewRecord: true` (was `command-menu/hooks/useOpenRecordInCommandMenu.ts`)                                                       |
| `command-menu/hooks/useCommandMenuCloseWithValidation.ts`                                                   | **NEW** — Wraps close/back with required-field validation; skips soft-deleted new records so delete can close cleanly                                                                  |
| `command-menu/states/requiredFieldsValidationState.ts`                                                      | **NEW** — Jotai atom for pending validation modal data                                                                                                                                 |
| `command-menu/components/RequiredFieldsValidationModal.tsx`                                                 | **NEW** — Confirmation modal: "Delete Record" or "Go Back" when required fields are empty                                                                                              |
| `side-panel/components/SidePanelTopBar.tsx`                                                                 | X button uses `closeWithValidation` instead of `closeSidePanelMenu` (was `CommandMenuTopBar.tsx`)                                                                                      |
| `command-menu/components/CommandMenuOpenContainer.tsx`                                                      | Click-outside uses `closeWithValidation` instead of `closeSidePanelMenu`                                                                                                               |
| `side-panel/components/SidePanelBackButton.tsx`                                                             | Back button uses `goBackWithValidation` instead of `goBackFromSidePanel` (was `CommandMenuBackButton.tsx`)                                                                             |
| `command-menu/hooks/useCommandMenuHotKeys.ts`                                                               | Escape/Backspace/Delete use `goBackWithValidation` instead of `goBackFromSidePanel`                                                                                                    |
| `side-panel/components/SidePanelForDesktop.tsx`                                                             | Collapse uses `closeWithValidation`; renders `RequiredFieldsValidationModal`; cleanup + beforeunload hooks (was `CommandMenuSidePanelForDesktop.tsx`)                                  |
| `command-menu/hooks/useBeforeUnloadRequiredFieldsCheck.ts`                                                  | **NEW** — Blocks browser refresh/close when non-deleted newly created records have required field violations                                                                           |
| `command-menu/hooks/useCleanupNewlyCreatedRecordIds.ts`                                                     | **NEW** — Prunes stale or deleted record IDs from sessionStorage on app startup                                                                                                        |
| `command-menu/hooks/__tests__/useCommandMenuCloseWithValidation.test.tsx`                                   | **NEW** — Regression test: deleted new records bypass required-fields close/back modal                                                                                                 |
| `object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenRightDrawer.ts`                 | Added `isNewRecord: true` so "Add new" from relation fields is tracked for validation                                                                                                  |

### Timeline Relation Field Diffs

| File                                                                                         | Modification                                                                                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `engine/core-modules/event-emitter/utils/object-record-changed-values.ts`                    | Maps relation FK join column changes (e.g., `agentId`) to relation field names (e.g., `agent`) in timeline diffs |
| `activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx`              | Branches RELATION/MORPH_RELATION fields to dedicated relation value renderer instead of synthetic record store   |
| `activities/timeline-activities/rows/main-object/components/EventFieldDiffRelationValue.tsx` | **NEW** — Fetches related record by FK UUID via `useFindOneRecord` and renders `RecordChip`                      |

### Other Frontend

| File                                                                                                                               | Modification                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/twenty-front/src/modules/command-menu/components/CommandMenuButton.tsx`                                                  | Pinned command buttons honor per-command `buttonVariant` / `accent` so object index pages can render a filled primary CTA               |
| `packages/twenty-front/src/modules/command-menu-item/utils/resolveCreateRecordActionLabels.ts`                                     | **NEW** — Rewrites generic create-record action into `Create Policy`, `Create Lead`, etc. using object metadata                         |
| `packages/twenty-front/src/modules/command-menu-item/utils/resolveGoToActionLabels.ts`                                             | **NEW** — Resolves "Go to" labels from object metadata (`labelPlural`) and filters deactivated objects                                  |
| `packages/twenty-front/src/modules/command-menu-item/contexts/CommandMenuContextProviderContent.tsx`                               | Applies object-aware create/go-to labels, deactivated object filtering, and LAYOUTS permission gate on layout editing                   |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts` | Pin Delete single/multiple record actions so they appear as header buttons (upstream has `isPinned: false`, hiding them in dropdown)    |
| `packages/twenty-front/src/modules/navigation-menu-item/components/WorkspaceNavigationMenuItemsDispatcher.tsx`                     | Restores admin/member split: only `LAYOUTS` users get editable workspace navigation; members use the fixed Omnia workspace list         |
| `packages/twenty-front/src/modules/navigation-menu-item/components/WorkspaceNavigationMenuItems.tsx`                               | Re-gates workspace sidebar editing behind `PermissionFlagType.LAYOUTS`                                                                  |
| `packages/twenty-front/src/modules/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems.tsx`        | **NEW** — Permission-driven workspace sidebar for non-layout users; renders objects filtered by `showInSidebar` per role                |
| `packages/twenty-front/src/modules/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection.tsx`             | Deduplicates "Opened" section using `showInSidebar` permission instead of hardcoded list                                                |
| `packages/twenty-front/src/modules/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems.tsx`                   | Supports preserving caller-provided ordering and `ignoreShowInSidebar` bypass for curated sections                                      |
| `packages/twenty-ui/src/navigation/link/components/AudioLink.tsx`                                                                  | **NEW** — Audio player component for call recordings (inline pill with `<audio>` controls)                                              |
| `packages/twenty-front/src/modules/auth/components/Logo.tsx`                                                                       | When workspace logo exists and no custom primary logo set, show workspace logo as primary instead of Twenty "20" icon overlay           |
| `packages/twenty-front/src/pages/auth/SignInUp.tsx`                                                                                | Show just the workspace name instead of "Welcome, X." on sign-in page                                                                   |
| `packages/twenty-front/src/modules/metadata-store/states/metadataStoreState.ts`                                                    | Use lz-string compressed localStorage adapter — upstream raw JSON exceeds Safari's 5MB quota                                            |
| `packages/twenty-front/src/modules/ui/utilities/state/jotai/utils/createAtomFamilyState.ts`                                        | Added `customStringStorage` option to support compressed localStorage adapter                                                           |
| `packages/twenty-front/src/modules/ui/utilities/state/jotai/utils/createCompressedLocalStorage.ts`                                 | **NEW** — lz-string compressed `SyncStringStorage` adapter for Jotai `atomWithStorage`                                                  |
| `packages/twenty-front/src/modules/metadata-store/hooks/useLoadMinimalMetadata.ts`                                                 | Treat missing collection hashes as stale when local store is empty — fixes nav items lost after Redis flush                             |
| `packages/twenty-server/src/engine/metadata-modules/minimal-metadata/minimal-metadata.service.ts`                                  | Fire-and-forget cache priming for entity keys missing from Redis — ensures hashes exist for subsequent requests                         |
| `packages/twenty-front/src/modules/app/components/App.tsx`                                                                         | Mounts `<Agentation />` annotation toolbar in development only (gated on `process.env.NODE_ENV === 'development'`)                      |

### Frontend Performance

| File                                                                                                          | Modification                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/twenty-front/src/modules/apollo/components/ApolloProvider.tsx`                                      | Removed `apollo3-cache-persist` — it blocked initial render with no timeout; metadata is small and re-fetched quickly                                                |
| `packages/twenty-front/src/modules/object-record/hooks/useObjectPermissions.ts`                               | Memoized `.reduce()` with `useMemo` — was called 300+ times per table render creating new objects each time                                                          |
| `packages/twenty-front/src/modules/sse-db-event/hooks/useDispatchObjectRecordEventsFromSseToBrowserEvents.ts` | Use `store.get()` snapshot instead of `useObjectMetadataItems()` hook — prevents SSE re-subscription on every metadata change                                        |
| `packages/twenty-front/src/modules/object-record/hooks/useLazyFindManyRecordsWithOffset.ts`                   | `fetchPolicy: 'no-cache'` — record table reads from jotai, not Apollo cache; Apollo 3 has no cache GC, so caching here causes unbounded memory growth → OOM          |
| `packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexTableFetchMore.ts`          | `fetchPolicy: 'no-cache'` — same reason: prevents Apollo 3 double-storing records that are already in jotai                                                          |
| `packages/twenty-front/src/modules/apollo/components/ApolloProvider.tsx`                                      | `connectToDevTools` gated to development only — was hardcoded `true`, wasting memory on production Apollo DevTools instrumentation                                   |
| `record-table/record-table-cell/components/RecordTableCellFieldContextGeneric.tsx`                            | Memoized `FieldContext.Provider` value — rendered per cell (O(rows × fields)), prevents cascading re-renders from new object refs                                    |
| `record-table/record-table-cell/components/RecordTableCellFieldContextLabelIdentifier.tsx`                    | Memoized `FieldContext.Provider` value + `useCallback` for chip click handler                                                                                        |
| `record-table/record-table-cell/components/RecordTableCellBaseContainer.tsx`                                  | `useCallback` for click handler — created per cell, prevents re-render from new function ref                                                                         |
| `record-table/components/RecordTableScrollAndZIndexEffect.tsx`                                                | Rewrote scroll handler to use `store.get()`/`store.set()` — original used reactive hooks in deps, causing listener teardown/reattach loop that crashed mobile Safari |
| `record-table/record-table-cell/components/RecordTableCellWrapper.tsx`                                        | Memoized `RecordTableCellContext.Provider` value — inline object literal caused all cell context consumers to re-render on every parent re-render                    |
| `record-table/record-table-row/components/RecordTableTr.tsx`                                                  | Memoized `RecordTableRowContextProvider` value — inline object literal caused all row context consumers to re-render on every parent re-render                       |

## Modified Upstream Server Files

### Application Deployment

| File                                                                            | Modification                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `engine/core-modules/application/resolvers/application-development.resolver.ts` | Removed `DevelopmentGuard` — allows `app:dev` deployment on self-hosted production server |
| `.github/workflows/deploy-eks.yaml`                                             | Added `APP_VERSION=1.20.0` build arg so upgrade migrations run on deploy                  |

### Cloudflare / Asset Caching

| File                                                   | Modification                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/twenty-server/src/app.module.ts`             | Excludes `/assets/*` and `/images/*` from the SPA fallback so missing hashed assets return real 404s, and sets `no-store` on HTML                   |
| `packages/twenty-docker/helm/twenty/omnia-values.yaml` | Nginx ingress adds `immutable` cache headers for successful JS/CSS/fonts/images only, and `no-cache, no-store, must-revalidate` for HTML/app routes |

### GraphQL Metadata Response Caching

| File                                                                                        | Modification                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/twenty-server/src/engine/api/graphql/metadata.module-factory.ts`                  | Metadata response cache includes `ObjectMetadataItems`, `FindAllCoreViews`, `FindFieldsWidgetCoreViews`, `FindAllRecordPageLayouts`, and `FindManyLogicFunctions` |
| `packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts` | Core-view operations `FindAllCoreViews` and `FindFieldsWidgetCoreViews` stay user-scoped in the cache key                                                         |

### RLS / Permissions Engine

| File                                                                                                        | Modification                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts`                                  | Indirect relation support, deny-by-default when predicates can't resolve, action-scoped predicate filtering, and request-scoped memoization |
| `engine/twenty-orm/utils/apply-row-level-permission-predicates.util.ts`                                     | Applies `READ` predicates to queries and `WRITE` predicates to update/delete/restore query builders                                         |
| `engine/twenty-orm/utils/validate-rls-predicates-for-records.util.ts`                                       | RLS validation on create/update now always enforces `WRITE`-scoped predicates                                                               |
| `engine/twenty-orm/utils/__tests__/build-row-level-permission-record-filter.util.spec.ts`                   | Regression test covering relation-based `policy.agent = Me` resolution through the linked AgentProfile record                               |
| `engine/workspace-event-emitter/workspace-event-emitter.service.ts`                                         | Event-stream subscriptions use `READ`-scoped predicates                                                                                     |
| `engine/api/common/common-select-fields/utils/filter-restricted-fields-from-select.util.ts`                 | **NEW** — Strip restricted fields instead of rejecting queries                                                                              |
| `engine/metadata-modules/row-level-permission-predicate/services/row-level-permission-predicate.service.ts` | Rejects mixed-scope predicate trees so groups/predicates stay internally consistent                                                         |
| `database/typeorm/core/migrations/common/1773079000000-add-scope-to-row-level-permission-predicates.ts`     | **NEW** migration adding `scope` to predicates and predicate groups, defaulting existing rows to `ALL`                                      |
| `engine/twenty-orm/types/workspace-rls-computation-cache.type.ts`                                           | **NEW** request-scoped cache for computed RLS filters and resolved linked-record ids                                                        |
| `engine/twenty-orm/storage/orm-workspace-context.storage.ts`                                                | AsyncLocal workspace context now carries the request-scoped RLS cache                                                                       |
| `engine/twenty-orm/interfaces/workspace-internal-context.interface.ts`                                      | Internal ORM context exposes the request-scoped RLS cache to all query builders                                                             |
| `engine/twenty-orm/entity-manager/workspace-entity-manager.ts`                                              | Initializes one RLS cache per request so GraphQL resolvers reuse the same filter/link-resolution work                                       |

### Shared Types: Action-Scoped RLS

| File                                                                                                                                            | Modification                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/twenty-shared/src/types/RowLevelPermissionPredicateScope.ts`                                                                          | **NEW** shared enum defining `ALL`, `READ`, and `WRITE` predicate scopes |
| `packages/twenty-shared/src/types/RowLevelPermissionPredicate.ts`                                                                               | Added `scope` to shared predicate type                                   |
| `packages/twenty-shared/src/types/RowLevelPermissionPredicateGroup.ts`                                                                          | Added `scope` to shared predicate-group type                             |
| `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity.ts`           | Added persisted predicate `scope` column                                 |
| `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity.ts`     | Added persisted predicate-group `scope` column                           |
| `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/row-level-permission-predicate.dto.ts`                  | Exposes predicate `scope` over GraphQL                                   |
| `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/row-level-permission-predicate-group.dto.ts`            | Exposes predicate-group `scope` over GraphQL                             |
| `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/inputs/upsert-row-level-permission-predicates.input.ts` | Allows scope-aware predicate/group upserts                               |

### Global Search / Custom Object Search Coverage

| File                                                                                                                     | Modification                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engine/core-modules/search/services/search.service.ts`                                                                  | Custom objects get an all-searchable-field fallback query in addition to the normal `searchVector` full-text path                                |
| `engine/metadata-modules/search-field-metadata/utils/build-custom-object-search-vector-field-settings.util.ts`           | **NEW** — Central helper that builds custom-object `searchVector` expressions from all active searchable custom fields                           |
| `engine/metadata-modules/object-metadata/utils/build-default-flat-field-metadatas-for-custom-object.util.ts`             | Default custom-object `searchVector` now uses the shared helper instead of hardcoding label-only behavior                                        |
| `engine/metadata-modules/field-metadata/services/field-metadata.service.ts`                                              | Recomputes custom-object `searchVector` on field create/delete so new fields like `policyNumber` become searchable without manual metadata fixes |
| `engine/metadata-modules/flat-field-metadata/utils/handle-flat-field-metadata-update-side-effect.util.ts`                | Field update side effects now trigger generic custom-object `searchVector` recomputation, not just label-identifier changes                      |
| `engine/metadata-modules/flat-field-metadata/utils/handle-search-vector-changes-during-field-update.util.ts`             | **NEW** — Rebuilds custom-object `searchVector` when a field name/type/active/system flag changes                                                |
| `engine/metadata-modules/flat-object-metadata/utils/recompute-search-vector-field-after-label-identifier-update.util.ts` | Label-identifier changes preserve all searchable custom fields in `searchVector` instead of collapsing back to one field                         |
| `engine/workspace-manager/utils/get-ts-vector-column-expression.util.ts`                                                 | Exported per-field searchable column expansion helper so both `searchVector` generation and runtime fallback search share the same field logic   |
| `database/typeorm/core/migrations/common/1771600000000-add-policy-number-and-rename.ts`                                  | Policy `policyNumber` is stored as `TEXT`; search must continue indexing/searching it even though `name` is repurposed as a display label        |
| `modules/policy/query-hooks/policy-create-one.pre-query.hook.ts`                                                         | Policy `name` is auto-derived from carrier/product, so policy-number search depends on the custom search coverage above                          |
| `modules/policy/query-hooks/policy-update-one.pre-query.hook.ts`                                                         | Same on update — policy display name stays derived, not policy-number-based                                                                      |

### Configurable Edit Window (Per-Role, Per-Object)

| File                                                                                            | Modification                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `engine/metadata-modules/role/role.entity.ts`                                                   | Added `editWindowMinutes` column (nullable integer) — global default per role                                                       |
| `engine/metadata-modules/object-permission/object-permission.entity.ts`                         | Added `editWindowMinutes` column (nullable integer) — per-object override                                                           |
| `engine/metadata-modules/role/dtos/role.dto.ts`                                                 | Added `editWindowMinutes` GraphQL field                                                                                             |
| `engine/metadata-modules/role/dtos/update-role.input.ts`                                        | Added `editWindowMinutes` input field                                                                                               |
| `engine/metadata-modules/role/dtos/create-role.input.ts`                                        | Added `editWindowMinutes` input field                                                                                               |
| `engine/metadata-modules/object-permission/dtos/object-permission.dto.ts`                       | Added `editWindowMinutes` GraphQL field                                                                                             |
| `engine/metadata-modules/object-permission/dtos/upsert-object-permissions.input.ts`             | Added `editWindowMinutes` input field                                                                                               |
| `engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts`            | Resolves `editWindowMinutes`: object override → role default → null (no restriction)                                                |
| `engine/metadata-modules/role/utils/fromRoleEntityToRoleDto.util.ts`                            | Maps `editWindowMinutes` to DTO                                                                                                     |
| `engine/metadata-modules/flat-role/utils/from-create-role-input-to-flat-role-to-create.util.ts` | Includes `editWindowMinutes` in role creation                                                                                       |
| `engine/metadata-modules/flat-role/utils/from-role-entity-to-flat-role.util.ts`                 | Includes `editWindowMinutes` in flat role                                                                                           |
| `engine/core-modules/application/utils/from-role-manifest-to-universal-flat-role.util.ts`       | Defaults `editWindowMinutes: null`                                                                                                  |
| `engine/workspace-manager/.../create-standard-role-flat-metadata.util.ts`                       | Defaults `editWindowMinutes: null` for standard roles                                                                               |
| `engine/twenty-orm/utils/compute-permission-intersection.util.ts`                               | Includes `editWindowMinutes: null` in permission intersection                                                                       |
| `database/typeorm/core/migrations/common/1772591146793-add-edit-window-minutes.ts`              | **NEW** migration adding column to `role` and `objectPermission` tables                                                             |
| `database/typeorm/core/migrations/common/1772600000000-change-submitted-date-to-datetime.ts`    | **NEW** migration changing policy `submittedDate` from DATE to DATE_TIME (timestamptz), converts existing dates as Eastern midnight |

**Frontend — Edit Window UI:**
| File | Modification |
|------|-------------|
| `settings/roles/.../SettingsRolePermissionsObjectLevelEditWindowRow.tsx` | **NEW** — Duration selector row (No limit, 5min–7 days) in object permissions form |
| `settings/roles/.../SettingsRolePermissionsObjectLevelObjectFormObjectLevel.tsx` | Added `EditWindowRow` below existing permission checkboxes |
| `settings/roles/graphql/fragments/roleFragment.ts` | Added `editWindowMinutes` to query |
| `settings/roles/graphql/fragments/objectPermissionFragment.ts` | Added `editWindowMinutes` and `showInSidebar` to query |
| `settings/roles/role/hooks/useSaveDraftRoleToDB.ts` | Includes `editWindowMinutes` in create/update role + object permission upsert payloads |

**Shared types:**
| File | Modification |
|------|-------------|
| `packages/twenty-shared/src/types/ObjectPermissions.ts` | Added `editWindowMinutes: number \| null` |

### Required Fields (Field Metadata Extension)

| File                                                                                                                   | Modification                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------ | ------------------------------------ |
| `engine/metadata-modules/field-metadata/field-metadata.entity.ts`                                                      | Added `requiredCondition` JSONB column (`{type: 'always'              | 'fieldEmpty' | 'fieldNotEmpty', fieldId?: string}`) |
| `engine/metadata-modules/field-metadata/dtos/field-metadata.dto.ts`                                                    | Added `requiredCondition` GraphQL field                               |
| `engine/metadata-modules/flat-field-metadata/utils/from-flat-field-metadata-to-field-metadata-dto.util.ts`             | Added `requiredCondition` to DTO mapping (read path)                  |
| `engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-editable-properties.constant.ts`            | Added `requiredCondition` to custom + standard editable properties    |
| `engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-relation-properties-to-compare.constant.ts` | Added `requiredCondition` to relation field editable properties       |
| `engine/metadata-modules/flat-entity/constant/all-entity-properties-configuration-by-metadata-name.constant.ts`        | Added `requiredCondition` property config                             |
| `database/typeorm/core/migrations/common/1773069763255-add-field-metadata-required.ts`                                 | **NEW** migration adding `requiredCondition` to `fieldMetadata` table |

### Standard Object Index (Unique Constraints)

| File                                                                               | Modification                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `engine/workspace-manager/.../compute-person-standard-flat-field-metadata.util.ts` | Emails `isUnique: false`, Phones `isUnique: true` (upstream default is reversed) |
| `engine/workspace-manager/.../compute-person-standard-flat-index-metadata.util.ts` | Phone is unique (not email)                                                      |

### Invitation Email Branding

| File                                                                                | Modification                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| `engine/core-modules/workspace-invitation/services/workspace-invitation.service.ts` | Removed "(via Twenty)" from invitation email sender |

## Fragile Import Dependencies (Check After Upstream Renames)

Our custom files import from upstream modules that may be renamed/moved. After merging, grep for broken imports:

```bash
npx nx typecheck twenty-front  # Catches TS2307 "Cannot find module" errors
npx nx typecheck twenty-ui     # AudioLink etc.
```

| Our Custom File                                           | Imports From (upstream)                                                                                  | Previously Was                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `command-menu/hooks/useCommandMenuCloseWithValidation.ts` | `@/side-panel/hooks/useSidePanelMenu`, `@/side-panel/hooks/useSidePanelHistory`, `@/side-panel/states/*` | `@/command-menu/hooks/useCommandMenu`, `@/command-menu/hooks/useCommandMenuHistory` |
| `command-menu/hooks/useCommandMenuHotKeys.ts`             | `@/side-panel/hooks/useSidePanelMenu`, `@/side-panel/constants/*`                                        | `@/command-menu/hooks/useCommandMenu`                                               |
| `command-menu/components/CommandMenuOpenContainer.tsx`    | `@/side-panel/types/*`, `@/side-panel/constants/*`                                                       | `@/command-menu/types/*`                                                            |
| `navigation/components/MainNavigationDrawer.tsx`          | `@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel`                                                 | `@/command-menu/hooks/useOpenRecordsSearchPageInCommandMenu`                        |
| `side-panel/hooks/useOpenRecordInSidePanel.ts`            | `@/object-record/record-side-panel/states/newlyCreatedRecordIdsState`                                    | `@/object-record/record-right-drawer/states/...`                                    |
| `packages/twenty-ui/.../AudioLink.tsx`                    | `@ui/theme-constants` (for `ThemeContext`)                                                               | Was `@ui/theme`                                                                     |
| `settings/.../EditWindowRow.tsx`                          | `twenty-ui/theme-constants` (for `ThemeContext`)                                                         | Was `twenty-ui/theme`                                                               |

## Mock Data (Deactivated Objects)

Mock metadata loaded during sign-out (`useLoadMockedMinimalMetadata`) must match Omnia's workspace state. Company and Opportunity are deactivated in Omnia but active in upstream Twenty.

| File                                                                    | Modification                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `testing/mock-data/generated/metadata/objects/mock-objects-metadata.ts` | Set `isActive: false` for Company and Opportunity objects                       |
| `testing/mock-data/generated/metadata/minimal/mock-minimal-metadata.ts` | Set `isActive: false` for Company and Opportunity objects                       |
| `testing/mock-data/generated/metadata/views/mock-views-data.ts`         | Removed Company TABLE view, Opportunity TABLE view, and Opportunity KANBAN view |

## Post-Merge Checklist

After every upstream merge:

1. **Run the check script**: `./scripts/check-customizations.sh`
2. **Run typecheck**: `npx nx typecheck twenty-front && npx nx typecheck twenty-ui` — catches broken imports from upstream renames
3. **Re-extract Lingui**: `npx nx run twenty-front:lingui:extract && npx nx run twenty-front:lingui:compile`
4. **Verify policy create under write-only RLS**: Settings → Roles → Member → Permissions → Policy → Record-level should be `Write only: Agent is Me`; then log in as a member and create a policy from Policies page without hitting `Record does not satisfy security constraints`
5. **Verify sidebar/header**: Settings at top, no Documentation link, Search in sidebar, no inline search icon beside workspace name
6. **Verify member login redirect**: Log in as member — should land on People (Leads), not alphabetical first object
7. **Verify RLS settings UI**: No "Upgrade to access" gate on Record-level permissions
8. **Verify scoped RLS UI**: Settings → Roles → Member → Permissions → Policy → Record-level shows `Read + write`, `Read only`, and `Write only`
9. **Verify policy scoped RLS behavior**: Member can open/search all policies, create policies for themselves, and only edit/delete/restore policies they own; Policy `WRITE` rule persists while `ALL`/`READ` scopes stay empty
10. **Verify edit window**: Settings → Roles → Member → Permissions → Policy → "Edit window" dropdown present, saves correctly
11. **Verify required fields**: Settings → Data Model → Policy → any field → "Required" toggle present with condition options
12. **Verify uniqueness flags**: Emails `isUnique: false`, Phones `isUnique: true` in `compute-person-standard-flat-field-metadata.util.ts`
13. **Verify create CTA**: Policies/Leads/etc. index page shows a filled blue `Create Policy` / `Create Lead` header button, not outlined `New record`
    13a. **Verify command menu labels**: Cmd+K menu shows `Go to Leads` (not `Go to People`), deactivated objects don't appear, and `Edit navigation sidebar` is hidden for members
14. **Verify member workspace sidebar**: Member role cannot edit workspace items; workspace section shows Leads, Calls, Policies, Notes, Tasks; Carriers folder is absent
15. **Run lint**: `npx nx lint:diff-with-main twenty-front`
16. **Run migrations**: `npx nx run twenty-server:database:migrate:prod`
17. **Flush Redis after deploy**: `cache:flat-cache-invalidate --all-metadata`

## Payment Reconciliation v2

Fresh-start rewrite on `feature/reconciliation-v2`. The v1 review UI and twenty-apps backend have been **superseded** and are not being ported. New architecture uses native twenty-server NestJS module, two custom workspace objects (`reconciliation`, `carrierConfig`), and `@pierre/diffs` for the review UI. See `memory/project-reconciliation-v2.md` for full architecture.

| File                                                                                     | What We Changed                                                    | Why                                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `packages/twenty-server/src/database/commands/custom/seed-reconciliation-objects.command.ts` | New NestJS command                                                 | Creates the `reconciliation` + `carrierConfig` custom workspace objects idempotently |
| `packages/twenty-server/src/database/commands/database-command.module.ts`                | Registered `SeedReconciliationObjectsCommand` in providers         | Required for nest-commander to discover the custom command                          |
| `packages/twenty-front/package.json`                                                     | Added `@pierre/diffs@^1.1.12`                                      | Unified-diff rendering for the review UI (planned for next session)                 |
| `packages/twenty-front/src/modules/views/components/ViewBarFilterDropdownAdvancedFilterButton.tsx` | Hide button when no current view; extracted inner component       | Lets the reconciliation review page reuse the native filter UI without a saved view (advanced filter groups require a view to persist) |
| `packages/twenty-front/src/modules/object-record/object-filter-dropdown/hooks/useOptionsForSelect.ts` | Read object metadata from `RecordIndexContext` instead of `useParams().objectNamePlural` | The reconciliation review page lives on a custom route that doesn't expose `:objectNamePlural`. RecordIndexContext is always present where this hook is used. |
| `packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx` | Diff-aware relation chip: inline name diff annotation (composite `lead.name.firstName/lastName` + single `agent.name`) with accept/undo. Non-name diffs surface only on the expanded RecordFieldList. Reads `ReconciliationDiffsContext`. | Lets the reconciliation review page show name mismatches on any relation chip — both Person-style composite names and TEXT names. |
| `packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContainer.tsx` | Inline diff overlay (oldValue → newValue [Accept/Undo]) for fields whose `FieldContext.fieldDiff` is set, with row highlighting; primary phone/email accepts route through `promotePrimary{Phone,Email}ToAdditional` so old primary is preserved in `additionalPhones`/`additionalEmails`. Renders an `<AppTooltip>` over the diff display when `fieldDiff.note` is set (e.g. status-change reason). | Renders reconciliation diffs inline on the policy/lead show page; non-destructive accept keeps both contact values reachable; tooltip surfaces explanation next to the changed value. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/contexts/FieldContext.ts`            | `FieldDiffOverlay` carries `note?: string \| null` so per-field diff explanations (e.g. `statusChangeReason`) ride alongside the value change. | Lets the reconciliation review page colocate the *why* with the *what* via tooltip on the inline diff. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor.tsx` | Draft guard in `persistBodyDebounced` — when `recordId` is in `draftRecordIdsState`, skip `updateOneRecord` (the body is already in the local record store; `RecordShowSidePanelCreateRecordButton` includes it in the Create mutation). Mirrors `usePersistField`'s existing draft path. | Body editor for non-activity rich-text fields (e.g. RICH_TEXT_V2 on a custom object draft) would otherwise throw RECORD_NOT_FOUND. |
| `packages/twenty-front/src/modules/activities/components/ActivityRichTextEditor.tsx` | Draft guard in `handlePersistBody` — Tasks/Notes route through `useUpsertActivity`, which only knows about the inline activity-create-mode flow and not the side-panel draft flow. When `activityId` is in `draftRecordIdsState`, skip the upsert. | Without this, editing the body of a draft audit task (from the reconciliation review UI) hits the server's `updateTask` and toasts "This record does not exist or has been deleted". |
| `packages/twenty-front/src/modules/page-layout/widgets/field/components/FieldWidgetRichTextEditor.tsx` | Skip the `<LoadingSkeleton />` when the record is a draft (`draftRecordIdsState.has(recordId)`). The skeleton is intended for "fetched record, body not yet hydrated"; a draft has no server fetch and the body field is undefined until the user types — showing a skeleton there is misleading. | Without this, the bottom "Task" body widget on a draft audit task shows a persistent skeleton bar until the user types AND closes the inline body editor. |
| `packages/twenty-shared/src/types/SidePanelPages.ts` | Adds `ReviewItemComments = 'review-item-comments'` to the `SidePanelPages` enum. | Hosts the stacked-card audit-comments view in Twenty's standard side panel. |
| `packages/twenty-front/src/modules/side-panel/constants/SidePanelPagesConfig.tsx` | Registers `<SidePanelReviewItemCommentsPage />` against `SidePanelPages.ReviewItemComments` in `SIDE_PANEL_PAGES_CONFIG`. | Wiring for the side panel page above. |
| `packages/twenty-front/src/modules/views/components/ViewBarFilterDropdown.tsx` | Accepts an optional `dropdownId` prop (defaults to `ViewBarFilterDropdownIds.MAIN`). | Lets two filter dropdowns coexist on the same page (the page-level filter and the audit-comments side-panel filter) without sharing open/close state. |
| `packages/twenty-front/src/modules/views/components/ViewBarDetailsAddFilterButton.tsx` | Accepts an optional `dropdownId` prop (defaults to `ViewBarFilterDropdownIds.MAIN`); used by both `useResetFilterDropdown` and `toggleDropdown`. | The inline "+ Add filter" button inside `<ViewBarDetails>` would otherwise always toggle the page-level dropdown, even when used in a scoped filter UI. |
| `packages/twenty-front/src/modules/views/components/ViewBarDetails.tsx` | Adds optional `addFilterDropdownId` prop and forwards it to `<ViewBarDetailsAddFilterButton>`. | Forwarding for the parameterization above. |
| `packages/twenty-front/src/modules/object-record/record-field-list/components/RecordFieldList.tsx`    | Pipes `FieldDiff.note` through to the `FieldContext.fieldDiff.note` overlay. | Required for the inline diff tooltip described above. |
| `packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewPageContent.tsx`     | (1) Sets `contextStoreCurrentPageType = ContextStorePageType.Record` so standard pinned command-menu items pass their `pageType == "RECORD_PAGE"` gate (`MainContextStoreProvider` skips this route since the URL has no `:objectNameSingular` segment). (2) Mounts `<SidePanelToggleButton />` next to `<RecordShowCommandMenu />` in the page header — this is the literal ⌘K-hotkey button that the standard `RecordShowPage` ships. | Restores the cmd+k entry point and the standard pinned-action header on the reconciliation review page. |
| `packages/twenty-shared/src/utils/composite/promotePrimaryToAdditional.ts` (new) + barrel re-export | New shared helpers `promotePrimaryPhoneToAdditional` / `promotePrimaryEmailToAdditional` used by both frontend (`RecordInlineCellContainer`, `MatchedDiffView`) and backend (`orchestrator.runApplyInline`). Identical merge logic in both paths. | Avoids client/server divergence on a behavior that affects user-visible data integrity. |
