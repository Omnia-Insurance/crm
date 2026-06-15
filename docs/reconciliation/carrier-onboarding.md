# Carrier Onboarding Playbook

How to onboard a new carrier (UHO, BCBS, …) onto the reconciliation pipeline **with the
code as it exists today** on `feature/reconciliation-remediation`. This is the honest
version: each step says whether an operator can do it from the app or an engineer is
required. The gaps catalogued in the
[readiness audit](../audits/multi-carrier-readiness-audit-2026-06-11.md) (2026-06-11)
were closed by six waves of work on this branch — that doc is a point-in-time snapshot;
this one is current. Status-engine authoring has its own playbook:
[status-engine-authoring.md](status-engine-authoring.md).

The architecture in one paragraph: every reconciliation run reads one **carrierConfig**
workspace record through the validated `parseCarrierPipelineConfig` boundary
(`types/carrier-config.ts`). The config now controls parsing (columnMapping,
transformRules with an 8-token date grammar, computed fields with 7 methods + params,
parseSettings for header row / row filters / footers), matching (tier selection,
per-tier confidences and tier-6 weights via `tierTuning`, thresholds, startDate,
policyNumberPattern with capture-group canonicalization, identifier roles +
normalization, dedup and narrowing strategies, two-way reconciliation and discovery),
status derivation (engineId + fieldMapping + extraRoles + engineParams), diff
suppression (`diffConfig`), and the CRM status vocabulary. What still lives in code —
deliberately: the **status-engine implementations** themselves (carrier billing
semantics), the **tier ORDER** of the matching cascade (tiers can be disabled and
re-scored, not reordered), the **diff data-safety guard mechanics** (the lead-identity
safety net can be re-pointed via `leadIdentityFields` but never disabled wholesale),
and the **fuzzy-name similarity functions** (Jaro-Winkler weighting, company-suffix
stripping — the thresholds are config, the scorers are not).

---

## Decision tree: is the new carrier UHO-class or BCBS-class?

**UHO-class** — policy-number-style identifier in the file, ACA-like billing
(effective/paid-through/term dates, an eligibility or status flag): onboarding is
pure config, plus one new status engine only if billing semantics differ from
Ambetter's. Follow the steps below.

**BCBS-class** — member-ID/subscriber-ID/group-number identity, member-level rows
(several rows per policy): **now config + careful setup**, no longer blocked. The
identity model supports it: `matchingConfig.identifierRoles` maps
memberId/subscriberId/groupNumber onto the identifier-bearing CRM policy fields
(`applicationId`, `planIdentifier`, `externalPolicyId`), the `IDENTIFIER_EXACT` tier
matches on the canonicalized value, `identifierNormalization` + a capture group in
`policyNumberPattern` handle prefixes/suffixes/leading zeros, and
`dedupStrategy: "keepAll"` keeps member-level rows as separate review items. The
honest caveats: member-level files **must** set `keepAll` (the default
keep-newest-per-policy dedup would silently collapse dependents), and carriers that
deliver a period as several files still hit the single-attachment wall (item 1 in
"The walls" below) — keep `enableMissingFromBob` off for those.

---

## Step-by-step

### 1. Create the carrier record — operator ✅
Standard Twenty record creation for the `carrier` object. Note the record id (or just
the exact name — the seed command resolves either).

### 2. Create the carrierConfig record — ✅ definition file + validated CLI
Write a JSON definition file and run the generic seed command (still CLI, but it
refuses to write anything the pipeline would reject at run time):

```bash
npx nx run twenty-server:command -- workspace:seed-carrier-config \
  --file path/to/carrier-config.json [--validate-only] [--dry-run] [-w <workspace-id>]
```

Pre-flight refusals (`seed-carrier-config.command.ts`) target the silent-Ambetter-trap
class of bug: `statusConfig.engineId` must be **explicit** (omitting it falls back to
the Ambetter engine at run time), `matchingConfig.startDate` must be an **explicit
key** (null allowed; omitting it inherits Ambetter's `2025-07-09` cutoff),
`statusConfig.fieldMapping` must be non-empty (an empty mapping blanket-derives
statuses), the carrier record must resolve, and the assembled record must pass the
full run-time boundary — every warning printed, every problem a refusal. Re-running
against an existing record MERGEs with existing-data-wins semantics (user-captured
mappings are never overwritten). Working example: the UHO fixture at
`packages/twenty-server/src/database/commands/custom/__tests__/fixtures/uho-carrier-config.json`.

**Failure model**: *FAIL* below means `CarrierConfigValidationError` — the seed refuses,
`validateCarrierConfig` reports it, and a run dies fast at PARSE/MATCH. *Warn* means
collected via `onWarning`: printed by the seed, returned by `validateCarrierConfig`,
and persisted per run into `stats.warnings`. Unknown keys warn **at every object
level** (misspelled knobs no longer fall back silently).

| Field | Required | Guidance | Bad input |
| --- | --- | --- | --- |
| `name` | yes | Join key for learned rules and match overrides — a server-side hook blocks renames while any rule/review item references it (§7). | — |
| `carrierName` / `carrierId` | yes | Step-1 record. Null carrierId hard-fails at match time (prevents cross-carrier matching). | seed refuses unresolvable carrier |
| `statusConfig.engineId` | yes — explicit | Registered engine id (`STATUS_ENGINES`, only `ambetter-bob-v1` today). See step 5. | unknown id FAILS, error lists registered ids |
| `statusConfig.fieldMapping` | yes — non-empty | Role → file header (or computed outputKey). Known roles: `effectiveDate`, `paidThroughDate`, `termDate`, `eligibleForCommission`, `brokerEffectiveDate`/`policyEffectiveDate` (audit only — unmapped = opt-out). Keys outside the vocabulary reach the engine via `StatusInput.extraRoles` (see the [authoring doc](status-engine-authoring.md) §2b). | missing/unresolved **required** role FAILS (per-engine `requiredRoles`); unresolved optional roles warn |
| `statusConfig.engineParams` | no | Engine-specific knobs, validated against the engine's **strict** `paramsSchema` at parse and match. Ambetter: `{ placedThresholdDays?: number }`. | typo'd param key FAILS |
| `statusConfig.placedThresholdDays` | no (30) | Legacy placement fallback; `engineParams.placedThresholdDays` overrides it. (`paymentErrorAgeDays` was removed — stored non-default values warn and are ignored.) | — |
| `matchingConfig.startDate` | yes — explicit key | Effective-date cutoff; `null` = none. Skips counted in `stats.skippedBeforeStartDate`. | omission warns: "inheriting the Ambetter/Omnia onboarding default 2025-07-09" |
| `matchingConfig.enabledTiers` | no | Subtractive tier toggle, validated against canonical `MATCH_TIER_IDS` (9 tiers incl. `IDENTIFIER_EXACT`). | typo FAILS with the valid-ids list (no more silent disable) |
| `matchingConfig` thresholds | no | `autoMatchThreshold` (85), `autoRejectThreshold` (30), `dateToleranceDays` (30), `nameMatchThreshold` (0.88), `agentNameThreshold` (0.85), tier-7 bands/scores. | wrong type FAILS |
| `matchingConfig.tierTuning` | no | Formerly hardcoded internals: `tierConfidences` (the 6 flat-confidence tiers), `tier6Weights` (date ×40, agent +30, name ×20, DOB +10, cap 70), `dateProximityBands` + `dateProximityFloor`. Unset keys keep today's constants. | bad shape FAILS; unknown keys warn |
| `matchingConfig.identifierRoles` | BCBS-class | `memberId`/`subscriberId`/`groupNumber` → one of `applicationId`, `planIdentifier`, `externalPolicyId` (the identifier-bearing CrmPolicy fields). Configuring any role activates the `IDENTIFIER_EXACT` tier; `{}` keeps matching policy-number-only, bit-for-bit. | unknown CRM path FAILS |
| `matchingConfig.identifierNormalization` | no | Applied after trim+uppercase on both sides: `stripPrefix`, `stripSuffixPattern` (regex — `'-\\d+$'` for BCBS member suffixes), `stripLeadingZeros`. | uncompilable regex FAILS |
| `matchingConfig.dedupStrategy` | no | `keepNewestEffectiveDate` (default — today's behavior), `keepAll` (member-level rows; review-item identity suffixed `#ROW<n>`), `keepFirst`. | unknown strategy FAILS |
| `matchingConfig.narrowingStrategies` | no | Ordered subset of `activeStatus`, `activeTerm`, `mostRecentEffectiveDate` (default = today's chain); `[]` disables narrowing. | unknown strategy FAILS |
| `matchingConfig.enableMissingFromBob` | no (false) | Two-way reconciliation — see the subsection below. Keep OFF for multi-file carriers. | — |
| `matchingConfig.enableDiscovery` (+ `discoveryNameThreshold` 0.95, `discoveryAutoThreshold` 0.98) | no (false) | Policy-number discovery — see below. Thresholds are 0–1 Jaro-Winkler scores. | value outside 0–1 FAILS (confidence-scale mixup guard); auto < suggest warns |
| `policyNumberPattern` | recommended | Case-insensitive gate (Ambetter `^U`); failing rows skipped + counted. **New**: a capture group additionally extracts the canonical identifier ("compare on the digits after the plan prefix") — gate semantics unchanged. | uncompilable regex FAILS |
| `transformRules` | recommended | `dateFormats` from the 8-token grammar — `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `YYYY/MM/DD`, `MM-DD-YYYY`, `DD-MM-YYYY`, plus written months `MMM D YYYY` / `D MMM YYYY` ('Jan 5, 2026', '05-JAN-2026'); tried in order. Also `booleanTrue`/`booleanFalse` token lists, `twoDigitYearPivot`, `currencyStrip`. | unknown token FAILS |
| `fieldConfig` (computed fields) | as needed | `{outputKey, method, inputs, params?, type, crmField?}`. Methods: `maxDate`, `minDate`, `coalesce`, `firstNonEmpty`, `concat` (`params.separator`), `conditional` (`params.{if,then,else}` with the row-filter op vocabulary), `arithmetic` (`params.expr` over `$n` input refs). | unknown method FAILS (no more silent skip); malformed params FAIL |
| `parseSettings` | as needed | `headerRow` (1-based — header-below-row-1 files no longer need hand-massaging), `rowFilters` (`{column, op, value?, action: 'skip'}` — footer/junk rows), `skipFooterRows`. | unknown op FAILS; uncompilable `matches` regex FAILS |
| `diffConfig` | rarely | Per-carrier diff suppression, defaults = the previously hardcoded guards: `suppressAgentFields`, `suppressPremiumDiffs`, `suppressBackwardsEffectiveDate`, `suppressAcaRolloverEffectiveDate`, `leadIdentityFields`, `suppressNegativeToNegativeStatus`. | bad shape FAILS; empty `leadIdentityFields` FAILS (the safety net has no off-switch) |
| `statusVocabulary` | rarely | `negativeTerminalStatuses` / `activeStatuses` (defaults = the Omnia ACA sets in `types/policy-statuses.ts`). `activeStatuses` scopes the missing-from-BOB corpus; `negativeTerminalStatuses` reaches diff suppression, flags, and narrowing. | statuses outside the known CRM vocabulary **warn** (workspace-added SELECT options are legitimate); empty list FAILS |
| `productMapping` | as needed | Case-insensitive substring → productId for the unmatched-create flow. | bad shape FAILS |
| `columnMapping` | optional prefill | Captured properly in step 4; a prefill in live shape (`header → {crmField, fieldType, fieldKey}`) pre-selects the import dialog. | legacy alias-list shape warns + is ignored |

### 3. First file upload — operator ✅ (the wizard wall is fixed)
The run wizard loads all carrierConfig records and routes
(`useOpenReconciliationWizard.ts`): exactly one config → the import dialog opens
directly (single-carrier workspaces keep the zero-click flow); two or more → a
carrier picker modal; zero → the picker in an empty state with seeding guidance
instead of a run that would die at PARSE. The chosen config drives the run and its
columnMapping prefill/write-back.

### 4. Capture columnMapping — operator ✅
The import dialog captures header → CRM-field mapping and snapshots it per run
(`reconciliation.columnMapping`), with the carrierConfig copy used as prefill next
time. Caveats: the dialog's header-row click is still discarded server-side, but
`parseSettings.headerRow` now covers header-below-row-1 files properly. Matching is
fed by crmFields in `MATCHING_ROLE_BY_CRM_FIELD` (policyNumber, effective date,
names, NPN, DOB) **plus** whatever paths `matchingConfig.identifierRoles` configures
— so a "Member ID" column mapped to e.g. `applicationId` does feed identity matching
for BCBS-class carriers.

### 5. Pick or build the status engine — ⚠️ engineer only if billing semantics differ
This is the one remaining engineer-required step, and only for carriers whose
billing semantics genuinely differ. Registry: `STATUS_ENGINES` in
`engines/status.ts` — still exactly one entry, `ambetter-bob-v1`. Decide:

- **Carrier's billing matches Ambetter's** (paid-through < end of current month ⇒
  payment error; eligibleForCommission=No ⇒ canceled; placement = effective month
  paid or `placedThresholdDays`): reuse `ambetter-bob-v1`. Map the roles, tune
  `engineParams.placedThresholdDays`. The Oscar e2e proves this is pure config.
- **Anything else** (explicit status column, premium-paid amounts, grace periods):
  a new engine is a small TS change — and the contract that used to be folklore is
  now real: self-describing descriptors (`requiredRoles`/`knownRoles`/strict
  `paramsSchema`), the `extraRoles` channel for non-date/boolean inputs, per-engine
  `engineParams`, and the exported generic ACA mechanics to compose instead of
  copy-pasting. Full walkthrough, reuse table, and registration checklist:
  **[status-engine-authoring.md](status-engine-authoring.md)**.

The engine id is fail-fast validated at parse and match — an unknown id stops the
run with the registered-ids list, so a typo can't silently run Ambetter.

### 6. Validate — ✅ `validateCarrierConfig` (server-side; UI button pending)
The `validateCarrierConfig(carrierConfigId)` GraphQL query (ReconciliationResolver,
same RECONCILIATION permission as the run mutations) runs the full parse/match
fail-fast chain synchronously without enqueuing anything: boundary validation with
collected warnings, engine-id + engineParams checks, and status-role
presence/resolvability. When the carrier has a previous parsed run, role resolution
is previewed against that run's **actual file headers** (`headersChecked: true`);
otherwise only role presence is checked (`headersChecked: false`). Config problems
come back in `errors[]` — the query never throws on them. There is no UI button yet
(walls item 3); call it via GraphQL — or use the seed command's `--validate-only`,
which replays the same chain plus carrier resolution. Run warnings are also
persisted per run as `stats.warnings` alongside `stats.configFingerprint` (short
hash of the parsed config), and the review UI's run-summary banner renders both — a
fingerprint-drift warning is appended when the config was edited between the
chained parse and match reads.

### Two-way reconciliation (missing-from-BOB) and policy-number discovery — opt-in knobs
Both legacy phases are live in the server match job (OMN-12), default-off — flipping
nothing keeps every existing carrier bit-for-bit:

- **`matchingConfig.enableMissingFromBob`** (default `false`): after matching, every
  CRM policy in `statusVocabulary.activeStatuses` (carrier-scoped, effective on/after
  `startDate` when set, not future-effective, and not a pre-carrier
  SUBMITTED/PENDING/INCOMPLETE record without a carrier-shaped policy number) that no
  file row matched becomes a `MISSING_FROM_BOB` review item (informational, never
  auto-applied), counted in `stats.missingFromBob`. The knob for "disappeared from
  the BOB means termed" carriers.
- **`matchingConfig.enableDiscovery`** (default `false`): unmatched file rows are
  paired to CRM policies that lack a carrier-shaped policy number by exact DOB +
  fuzzy name. `discoveryNameThreshold` gates a suggestion; below
  `discoveryAutoThreshold` the item's confidence is capped under
  `autoMatchThreshold` so batch approval never sweeps a mere suggestion. The
  suggested number is a normal `policyNumber` field diff applied by the existing
  approve path.

**Multi-file caveat — keep `enableMissingFromBob` OFF for multi-file periods.** A
reconciliation pins exactly **one** source attachment, so carriers that deliver a
period as several files (per-state extracts, active+termed splits, 25MB/50k-row cap
splits) run one reconciliation per file — and every policy living in one of the
*other* files would be flagged missing. Until multi-attachment ingestion lands
(walls item 1), either concatenate offline (identical headers) or leave the knob off.

### 7. Run lifecycle notes — operator ✅
- Re-running matching (REVIEW → MATCHING) picks up live config edits to
  matching/status knobs and **preserves all reviewer decisions**.
- Parse-time knob edits (transformRules, computed fields, parseSettings,
  columnMapping snapshot) re-apply to an existing run: REVIEW → PARSING is a legal
  transition via the existing `startReconciliationParsing` mutation. The re-parse
  reads the same pinned source file, overwrites the parsed-data attachment,
  auto-chains into matching, and reviewer decisions survive. No re-upload needed.
- Learned rules and overrides accumulate per `carrierName` from human approvals; a
  new carrier starts cold. Auto-apply never executes cancel actions.
- **Renames are guarded server-side**: a pre-query hook on `carrierConfig.updateOne`
  (`query-hooks/carrier-config-update-one.pre-query.hook.ts`) blocks a `name` change
  while any `reconciliationDecisionRule` or `reviewItem` references the old name
  (they join on `carrierName`; decision-rule signature hashes embed it). Renames of
  unreferenced configs, and all other field edits, pass through.
- **Audit trail**: carrierConfig edits flow through Twenty's native audit log and
  record timeline (`carrierConfig.updated` timelineActivity rows with before/after
  diffs and workspace-member attribution) — the "who changed which knob when" trail
  exists on the record page. Caveats: async via the worker queue, and seed/system
  writes carry no user attribution.

---

## The walls, ranked (what actually remains)

1. **Multi-attachment periods** (medium-large) — let one reconciliation ingest a
   period delivered as several files so `enableMissingFromBob` sees the whole book;
   until then the knob stays off for multi-file carriers.
2. **Seeds must be re-run on deployed workspaces** (operational, small) —
   `workspace:seed-reconciliation-objects` adds the new RAW_JSON fields
   (`parseSettings`, `diffConfig`, `statusVocabulary`) and the new matchMethod
   SELECT options (`IDENTIFIER_EXACT`, `MISSING_FROM_BOB`, `POLICY_NUMBER_DISCOVERY`);
   existing workspaces don't have them until it runs. Re-run the carrier seeds too
   (merge is existing-wins, so it only fills gaps).
3. **Metadata codegen for the identifier-roles UI** (small) — surfacing the
   identifier-role fields as first-class options in the import/mapping UI needs the
   regenerated front-end GraphQL metadata; until then operators map them by picking
   the underlying CRM field (`applicationId` etc.) directly, which works but isn't
   labeled as identity.
4. **UI surface for `validateCarrierConfig`** (small) — the query, persisted
   warnings, and the run-summary banner all exist; what's missing is an affordance
   that calls the query (wizard step or settings action).
