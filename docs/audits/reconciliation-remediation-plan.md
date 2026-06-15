# Reconciliation Remediation Plan

Companion to [reconciliation-audit-2026-06-10.md](./reconciliation-audit-2026-06-10.md).
Organized into 5 phases sequenced by risk: security first, then stopping active data
loss, then a single write path, then engine correctness, then the carrier-config
refactor that makes a second carrier a pure-config exercise. Tests are woven into each
item (the audit's test-gap findings are mapped to the change that makes them writable).

Standing requirements for every item:
- Update `CUSTOMIZATIONS.md` + `scripts/check-customizations.sh` when adding files or
  touching upstream ones (repo non-negotiable).
- Each bug fix lands with the regression test named in its item.

Effort: S = hours, M = 1–3 days, L = 3+ days.

---

## Phase 0 — Security & access control (independent, do first) — ~2–3 days

### 0.1 Real permission guard on the reconciliation resolver (S)
`reconciliation.resolver.ts:28` uses `NoPermissionGuard` — any workspace member can
start runs, batch-approve, and batch-apply CRM writes.
- Replace with a permission check (SettingsPermissionGuard or a custom guard asserting
  an admin/reconciliation permission) on all four mutations.
- Test: resolver guard test — non-privileged member gets denied on each mutation.

### 0.2 Enforce ownership rules on the server write path (M)
`ReviewItemService.applyOneReviewItem` writes policies/leads through system-context
repos, bypassing the agent-ownership RLS + edit-window hooks recently added elsewhere.
- Re-implement the agent-ownership + edit-window checks inside `ReviewItemService`
  before issuing repo writes (or route through the permission-checked GraphQL update
  path). Decide once here; Phase 2.1 consolidation makes this the *only* write path.
- Test: apply attempt against a policy outside the actor's ownership window is rejected.

### 0.3 Validate the cancel target (S–M)
`cancelPreviousPolicyIfRequested` (`review-item.service.ts:773`) cancels whatever policy
UUID sits in the JSON snapshot; only guard is `cancelId !== item.policyId`.
- At match time, persist the cancel target as a first-class column on the review item
  (`cancelPreviousPolicyId`, plus `cancelPreviousPolicyPriorStatus` /
  `...PriorExpirationDate` for Phase 1.4), stamped server-side by `match.job.ts` —
  stop reading it from `bobRowSnapshot` at apply time.
- At apply time, re-validate: target must share the matched policy's lead (or policy
  number base) and carrier.
- Test: snapshot with a foreign policy id is refused.

### 0.4 XLSX parser hardening (S–M)
`xlsx@0.18.5` has known prototype-pollution/ReDoS CVEs and parses untrusted files.
- Migrate to the SheetJS CDN build ≥0.20.2 (npm registry stopped at 0.18.5) or swap to
  `exceljs`; add max-byte/row caps before parsing; neutralize leading `=+-@` if values
  are ever exported.

### 0.5 Durable admin lock-down of reconciliation objects (S)
`seed-reconciliation-objects.command.ts:822` locks roles one-shot at seed time; roles
created later get default access.
- Run the lock-down on role creation (event hook) or add a startup/CI check that fails
  loudly when a non-admin role has access.

---

## Phase 1 — Stop destroying human work (re-run + rule safety) — ~4–5 days

### 1.1 Non-destructive match re-run (M) — the single highest-value fix
`persistMatchResults` (`match.job.ts:388`) hard-deletes ALL review items (including
APPROVED/SKIPPED with their audit trail) before recreating PENDING ones; delete→create
is not transactional.
- Reconcile by stable row identity (`carrierPolicyNumber` + row hash, see 1.2) instead
  of delete-all: preserve decided items untouched, update PENDING items in place,
  mark items whose row disappeared as stale rather than deleting.
- Wrap the whole persist in a transaction; verify a per-run token (see 3.19) before
  any destructive step.
- Tests: re-run preserves APPROVED items + decidedAt/source/ruleId; mid-persist failure
  leaves prior items intact.

### 1.2 First-class identity columns on reviewItem (S–M)
`fetchOverrides` (`review-item.service.ts:830`) guesses snapshot keys
(`policy_number`/`Policy_Number`) that don't match live header-keyed snapshots, and its
query has no carrier filter.
- Add `carrierPolicyNumber` and `carrierName` columns, stamped by `match.job` at
  creation (it already resolves the policy-number header via columnMapping).
  Prerequisite for 1.1's row identity and 1.3.

### 1.3 Rewrite fetchOverrides as a typed, carrier-scoped query (S)
- `repo.find({ where: { carrierName, decision: 'APPROVED', ... } })` on the new
  columns. No snapshot parsing, no carrier stamping.
- Test: override from carrier A never matches a carrier B run; overrides survive
  a re-run (depends on 1.1).

### 1.4 Make cancels undoable (S–M)
The cancel runs only on APPLY and UNDO never reverses it; prior status/expirationDate
are stored nowhere — erroneous auto-cancel is unrecoverable.
- Before cancelling, persist the target's prior `{status, expirationDate}` on the
  review item (columns from 0.3); UNDO restores them.
- Test: APPLY→UNDO round-trips the previous policy exactly.

### 1.5 Close the rule-learning cancel blind spot (S)
`isStatusOnlyReviewItem` (`decision-rule.service.ts:396`) filters to non-null
`crmField`, so the synthetic cancel diff is invisible; rules learned from cancel-free
items auto-apply cancels with zero review.
- Items with a cancel action are never "status only": check the cancel column (0.3),
  not just diffs. Include cancel-presence in the rule signature. Auto-apply must never
  execute a cancel — route those items to human review unconditionally.
- Tests (audit test-gap #1): `buildStatusRuleSignature` returns null for items with
  cancel actions / blocking flags / non-status actionable diffs; signature-hash
  snapshot fixtures to catch drift.

### 1.6 Undo of an auto-applied item must stick (S)
`review-item.service.ts:321` — the rule stays active and re-applies the item.
- On undo of `decisionSource === 'AUTO_RULE'`: deactivate or decrement the rule in
  `decisionRuleId`, and/or record a per-item exclusion so
  `applyLearnedRulesForReconciliation` skips human-undone items.

### 1.7 Backfill command hygiene (S)
`backfill-reconciliation-decision-rules.command.ts:151` resurrects human-deactivated
rules, learns from machine approvals, inflates approvedCount on rerun.
- Filter to `decisionSource IN ('USER','BATCH_USER')` (or `decisionRuleId IS NULL`);
  respect a `deactivatedAt` flag; skip count increments for already-linked items.

---

## Phase 2 — One write path + frontend correctness — ~5–7 days

### 2.1 Consolidate apply on the server (M–L) — **scope decision, recommended**
Apply logic is duplicated: `buildUpdatesForTarget` exists in both
`review-item.service.ts:614` and `MatchedDiffView.tsx`, with the frontend additionally
promoting INFO_ONLY diffs to writable UPDATEs (server doesn't). The April decision
moved apply client-side; the server batch path was then added back — both now write.
- Recommended: frontend calls `batchApplyReviewItems` (APPLY/UNDO) and refetches;
  delete the client-side write loop, `enrichFieldDiffs` promotion, and the
  INFO_ONLY→UPDATE backfill. This is also what makes 0.2's permission enforcement
  airtight (one path to guard).
- Fallback if client writes must stay (optimistic UX): extract `buildUpdatesForTarget`
  into `twenty-shared` and add the parity fixture tests from audit test-gap #3
  (primary-email promotion on APPLY but not UNDO; composite subfield preservation;
  lead routing; null/equal skips).

### 2.2 Remove the auto-approve effect (S–M)
`MatchedDiffView.tsx:674` fires a server APPLY (with rule-learning + cascading
auto-apply) whenever the rendered item's record already matches BOB, and its catch
mutates Set identity in the effect deps — infinite retry on persistent error.
- Promote PENDING→APPROVED only from explicit user actions (inline accept handlers /
  Accept all), not from record-equality observation. On failure: surface error, mark
  item as sync-failed, stop.
- Test: stale item whose record matches BOB renders without any mutation firing.

### 2.3 Comments stop clobbering decisions (S)
`MatchedDiffView.tsx:720` unconditionally overwrites the decision with FLAG_AUDIT.
- Only set FLAG_AUDIT from PENDING, or move the audit flag to its own field.

### 2.4 Real pagination for review items (S–M)
`ReconciliationReviewBody.tsx:67` caps at 1000; batch scope diverges from server.
- Loop `fetchMoreRecords` until `hasNextPage` is false before computing batch
  candidates; show server-side counts in batch confirm dialogs; warn on truncation.

### 2.5 Error handling on Apply all / Undo all / Reject (S)
Unhandled promise rejections today. Wrap with try/catch + `enqueueErrorSnackBar`
(moot for the write half if 2.1 lands first — sequence 2.1 → 2.5).

### 2.6 Batch apply: prefetch + transactions (M)
`review-item.service.ts:536` issues N+1 sequential queries with non-transactional
multi-record writes per item.
- Prefetch candidate policies (with leads) in one IN-query; chunk per-item writes into
  transactions so decision flag + CRM mutation commit together; run
  `applyLearnedRulesForReconciliation` against the prefetched map.

### 2.7 Shared constants to twenty-shared (S)
Blocking-flag list + confidence threshold are duplicated client/server
(`ReconciliationReviewBody.tsx:24`). Move next to
`coerceFieldDiffValueForRecordUpdate`; render unknown flags with a fallback label.

### 2.8 Frontend dead-code sweep (S)
Delete `serializeDiffsForPatch.ts`, `serializeRecordForDiff.ts`,
`ReconciliationRecordFieldList.tsx`, `startReconciliationApply.ts`, the
`BATCH_APPROVE_REVIEW_ITEMS` export, mockup.html.

---

## Phase 3 — Engine correctness — ~5–7 days (items are independent; batch by file)

### Matching (`engines/matching.ts`, `services/data.service.ts`)
- **3.1 Tier 7/8 best-candidate selection (M).** Score *all* candidates, pick best with
  deterministic tie-break; consult `memberDob` in Tier 7; demote unresolved ties to
  NEEDS_REVIEW. Tests with multiple NPN/DOB candidates (none exist today).
- **3.2 Ordered pagination (S).** `fetchPoliciesForMatching` (`data.service.ts:121`):
  add `order: { id: 'ASC' }` (or keyset pagination) — fixes skip/duplicate pages and
  nondeterministic tie-breaks downstream.
- **3.3 Policy-number normalization (S).** Trim+uppercase on both index and input
  sides, mirroring `isValidAmbetterPolicyNumber`.
- **3.4 Recency narrowing scope + honesty (S–M).** Restrict the most-recent-policy
  narrowing (commit f8871ba9b4) to all-terminal candidate sets, or run it only after
  Tier 2/3 fail; give narrowed winners a distinct method
  (`POLICY_NUMBER_NARROWED_RECENT`) and cap confidence below the auto-match threshold.
- **3.5 Empty-name guard (S).** `agentNameMatches`: return false when a normalized side
  is empty/shorter than 3 chars.
- **3.6 DOB normalization (S).** Normalize CRM DOBs to `YYYY-MM-DD` when building
  `policyByDob` so Tier 8 isn't raw-string-equality.

### Diff (`engines/diff.ts`)
- **3.7 Computed-field loop guards (S).** Add the missing "don't clear CRM when BOB
  empty" + "skip unpopulated field" + `.amountMicros` guards to the computed loop —
  extract one shared guard chain used by both loops (kills the drift class). Test:
  blank Broker+Policy effective dates produce no `effectiveDate → null` diff.
- **3.8 Suppress contact fields on subscriber mismatch (S).** Extend
  `LEAD_IDENTITY_CRM_FIELDS` to `lead.phones.primaryPhoneNumber`,
  `lead.emails.primaryEmail`, `lead.addressCustom.addressState` (or suppress all
  `lead.*`). Extend the existing incident regression test to email/phone.
- **3.9 Jan-1 rollover beyond year+1 (S).** `bobDate.year > crmDate.year`, + year+2 test.
- **3.10 Negative-to-negative suppression completeness (S).** Gate the companion
  `expirationDate` CRITICAL diff on the same check. Test: PAYMENT_ERROR_CANCELED →
  CANCELED with differing expire dates yields zero diffs.
- **3.11 Empty-string/null symmetry (S).** Treat trimmed `''` as null on both sides.
- **3.12 Stale paid-through suppression sees computed effectiveDate (S).**
  `isInvalidPaidThroughDateMove` resolves effective date the way the status engine does
  (computedFields first).

### Status (`engines/status.ts`)
- **3.13 Missing-effective-date path (S–M).** Run `eligibleForCommission === false` and
  past-termDate checks before the early return — or return null (no status assertion)
  when no usable effective date.
- **3.14 Reinstatement uses the negative-terminal set (S).** Not just exact
  `'CANCELED'` — PAYMENT_ERROR_CANCELED reinstatements currently bypass review gates.
- **3.15 UTC date math in getCancelExpireDate (S).** All arithmetic via
  `setUTCDate/getUTC*` (DST off-by-one today).

### Parse (`parsers/transforms.ts`, `jobs/parse.job.ts`, `services/attachment.service.ts`)
- **3.16 Date transform hardening (M).** Validate month/day ranges; configurable
  two-digit-year pivot (a `12/30/63` DOB must not become 2063); Excel-serial decoding
  only for cells that were numeric-typed in the sheet, never for digit strings.
  Transforms return `{ok, value} | {ok:false, raw, reason}` so the parse job's
  existing cell-error machinery + `stats.parseErrors` finally engage (they're
  unreachable today). Also: collapse/differentiate the identical toNumber/toCurrency,
  add parentheses/trailing-minus handling.
- **3.17 Status-role header validation (S).** After `resolveFieldMapping`, fail the run
  (required roles) or warn loudly when a status-role header resolves to nothing —
  today a misnamed column yields blanket PAYMENT_ERROR derivations silently.
- **3.18 Pin the source attachment (S).** Store the attachment id on the reconciliation
  at upload; `readSourceFile` reads exactly that instead of newest-of-any-kind.

### Pipeline (`services/state-machine.service.ts`, jobs)
- **3.19 Compare-and-swap state machine + stuck-run recovery (M).**
  `transition()` becomes `UPDATE ... WHERE id = :id AND status = :expected`, affected=0
  → conflict, jobs re-read status at start and exit cleanly. `setFailed` skips the
  write when status is already a post-step state from a newer run. Add
  startedAt/heartbeat + watchdog (or threshold-gated manual reset) for runs stuck in
  PARSING/MATCHING after a worker crash. Type the map as
  `Record<ReconciliationStatus, ReconciliationStatus[]>`. Either delete the dead
  APPLYING/COMPLETED states or add a real terminal transition — recommended:
  `REVIEW → COMPLETED` when all review items are decided, which the UI can show.

---

## Phase 4 — Carrier config unification (the generics work) — ~7–10 days

Goal: adding a carrier = seeding one validated config record + (only if its file
semantics differ) registering one status engine. No code edits elsewhere.

### 4.1 Port tests off the dead stack, then delete it (M)
The documented `FieldConfigEntry` pipeline (`generic.ts`, `registry.ts`,
`buildStatusInput`, `AMBETTER_FIELD_CONFIG`) is dead code — and the only tested parser
code. Order matters:
1. Extract `parse.job.ts`'s per-row loop (≈lines 109–176) into a pure function
   `(rows, columnMapping, computedFields, statusFieldMapping) → {normalized, parseErrors}`.
2. Port `generic.spec.ts`'s real Ambetter fixtures to it (two header formats +
   Excel-serial dates — audit test-gap #5).
3. Delete `generic.ts`, `registry.ts`, `buildStatusInput`, `AMBETTER_FIELD_CONFIG`
   (its data moves into the seed), and the doc claims in `types/field-config.ts`.

### 4.2 One validated CarrierPipelineConfig (M)
Wholesale `as MatchingConfig` casts crash on partial JSON (`match.job.ts:658`).
- New `types/carrier-config.ts`: `{ statusEngineId, columnMapping, computedFields,
  statusFieldMapping, matching, status, policyNumberPattern, productMapping,
  startDate }` with a Zod schema, `.partial()` + defaults merge, actionable error
  messages, regex validation. Single `parseCarrierPipelineConfig()` boundary called by
  `loadMatchContext` and `parse.job`. Type `CarrierConfigRecord.matchingConfig` as
  `Partial<MatchingConfig> | null` so the compiler forces the merge.

### 4.3 Status engine registry keyed by config, fail-fast (S–M)
`statusConfig.engineId` is seeded but never read; selection runs off
`parserVersion ?? 'ambetter-bob-v1'`, so a second carrier either floods review with
empty UPDATE items (unknown id → null statuses) or silently gets Ambetter payment
semantics (null → fallback).
- Key the registry off `statusEngineId`; unknown id → run fails at MATCH with a clear
  error; thresholds (`placedThresholdDays`, `paymentErrorAgeDays`) read from
  statusConfig only (the job hardcodes 30/10 today); `deriveCategory` treats
  `derivedStatus === null` as "no status assertion", not a change.

### 4.4 De-Ambetter the constants (S)
- `startDate` becomes a required per-carrier seed value (null = no cutoff); delete both
  duplicated `DEFAULT_START_DATE` constants. Count rows skipped by startDate and
  policyNumberPattern into run stats so operators see why totals diverge.
- `ACTIVE_CRM_STATUSES` + negative-terminal sets get one shared home, referenced by
  status engine, diff suppression, and reinstatement checks alike.

### 4.5 One Jackie's-rule implementation (S–M)
Duplicated with divergent logic between the unmatched branch and `deriveFlags`;
"effective date" resolved three ways in `match.job.ts`.
- Extract `deriveBrokerEffAudit(input) → {flagged, reason}` plus a single
  `resolveEffectiveDateHeader(ctx)`; call from both sites. Table-driven tests
  (audit test-gap: deriveFlags/deriveCategory).

### 4.6 Seed command correctness (S)
Seeds legacy columnMapping shape (breaks import-dialog prefill) and re-running
destroys user-captured mappings. Seed the live `ColumnMappingEntry` shape; merge,
don't replace, on update; drop the never-read transformRules/statusRules/
explanationRules writes (until 4.9 consumes transformRules).

### 4.7 Frontend de-hardcoding (S–M)
`UnmatchedView`/`buildSyntheticPolicyRecord` hardcode Ambetter headers — resolve
through columnMapping inversion (as `enrichFieldDiffs` already does), Ambetter names
as legacy fallback only.

### 4.8 Per-carrier transform vocabulary (M)
`TRANSFORMS` becomes `buildTransforms(rules)` with
`{ dateFormats, twoDigitYearPivot, booleanTrue/False, currencyStrip }` — current
behavior as defaults, fed from `carrierConfig.transformRules`. This is the last piece
that makes a DD/MM-format carrier pure-config (pairs with 3.16).

### 4.9 Scale guards (S–M)
Whole-file/whole-book in-memory processing with no caps; null `carrierId` silently
matches against every policy in the workspace. Add row/policy caps with stats,
chunked processing where cheap, and treat missing carrierId as a hard error.

### 4.10 Acceptance test for "second carrier" (M)
End state check: a fixture "Oscar" config (different headers, DD/MM dates, no `^U`
policy pattern, its own status engine stub) runs the full extracted pipeline
(parse-transform → match → status → diff → category) and produces correct review-item
shapes — the e2e fixture test that replaces the dead `pipeline-real-data.spec.ts` stub.

---

## Sequencing & dependency notes

```
Phase 0 (security)        — independent, ship immediately
Phase 1 (preserve work)   — 1.2 → 1.1 → 1.3; 0.3 → 1.4 → 1.5
Phase 2 (one write path)  — decide 2.1 first; it simplifies 0.2, 2.2, 2.5, 2.6
Phase 3 (engine fixes)    — independent small items; batch by file to limit churn
Phase 4 (carrier config)  — 4.1 step 1–2 (test extraction) before any deletion;
                            4.2/4.3 before 4.4–4.8; 4.10 is the exit criterion
```

Rough total: 4–6 weeks of focused single-dev work; Phases 0–1 (~1 week) remove the
active data-loss and security risk and are worth doing before the next monthly
reconciliation run.

Decisions embedded above that deserve a deliberate yes/no:
1. **2.1** — consolidate apply server-side (recommended) vs. keep dual write paths
   with parity tests.
2. **3.19** — add `REVIEW → COMPLETED` terminal transition (recommended) vs. delete the
   dead states.
3. **1.5** — auto-apply *never* executes cancels (recommended) vs. cancel-aware rule
   signatures that may auto-cancel.

## Unverified-finding caveat

Items 1.6, 1.7, 2.3–2.5, 3.4–3.6, 3.9–3.18 derive from audit findings whose
adversarial verification was cut off by the session limit (audit report §2). Each is
cited to file:line and none of their verified siblings were refuted, but re-confirm the
behavior (the fix's regression test does this naturally) before relying on the
description's details.
