# Status-Engine Authoring Playbook

How to write, register, and validate a new status engine for the
reconciliation pipeline. Companion to the
[carrier onboarding playbook](carrier-onboarding.md) (step 5) and the
[multi-carrier readiness audit](../audits/multi-carrier-readiness-audit-2026-06-11.md)
(§status-engines lens). Everything described here exists in code on
`feature/reconciliation-remediation` — this is not a roadmap document.

The one-paragraph model: a status engine is a **pure function** plus a
**descriptor** registered in `STATUS_ENGINES`
(`packages/twenty-server/src/modules/reconciliation/engines/status.ts`).
Carriers select an engine with `statusConfig.engineId`; the descriptor
declares which mapped roles the engine requires and what `engineParams` it
accepts, and the jobs enforce both **before any row is processed**. Engine
semantics (what cancels a policy, what counts as a payment error) are code
by design; everything around the engine — column wiring, role mapping,
thresholds, params — is config.

---

## 1. The descriptor contract

`STATUS_ENGINES` maps engine id → `StatusEngineDescriptor`:

```ts
export type StatusEngineDescriptor = {
  id: string;                              // must equal the registry key
  derive: StatusEngineFn;                  // the pure derivation function
  requiredRoles: readonly StatusRoleName[]; // presence-validated at PARSE
  knownRoles: readonly StatusRoleName[];   // requiredRoles + optional reads
  paramsSchema?: z.ZodType<Record<string, unknown>>; // engineParams shape
  description: string;                     // one operator-facing line
};
```

Field semantics:

- **`requiredRoles`** — roles that must be present in
  `statusConfig.fieldMapping` AND resolve to a real file header or
  computed-field output. `parse.job` fails the run on a missing or
  unresolved required role with the role name in the error. Declare a role
  required when its absence silently corrupts the derivation for the whole
  book (Ambetter: a null `effectiveDate` blanket-defaults to
  ACTIVE_APPROVED; a null `paidThroughDate` blanket-derives
  PAYMENT_ERROR_* for every active row). Do NOT declare roles required that
  are legitimately null per row (`termDate`, `eligibleForCommission`).
- **`knownRoles`** — everything the engine (or its companions, e.g. the
  broker-eff audit) reads when mapped. Documentation/tooling surface only;
  it is NOT a warning allowlist — any configured role that fails to resolve
  warns, exactly as before.
- **`paramsSchema`** — a **strict** zod schema (`.strict()`) for
  `statusConfig.engineParams`. Strictness is the point: a typo'd param key
  fails the run instead of being silently stripped. Engines without a
  schema reject any non-empty `engineParams` outright
  (`validateStatusEngineParams`).
- **`derive`** — see the function contract below. Must be pure: no I/O, no
  clock reads (the pipeline passes `today`), no logging.

`StatusEngineFn`:

```ts
type StatusEngineFn = (
  bobRow: StatusInput,                    // role-mapped row values
  allCrmPoliciesForNumber: CrmPolicy[],   // every CRM version of the policy number
  today: Date,                            // injected clock
  config: StatusEngineConfig,             // thresholds + validated engineParams
  currentPolicyId?: string | null,        // the matched CRM policy, if any
) => StatusDecision;
```

`StatusDecision` output rules:

- `derivedStatus` must be one of the six `OmniaStatus` values — the closed
  output vocabulary. The terminal/active classification sets live in
  `types/policy-statuses.ts`; downstream narrowing, reinstatement flagging,
  and diff suppression reason over those sets, so do not invent statuses.
- `statusChangeReason` is shown verbatim to reviewers. Write it like an
  explanation, including the input values that drove the decision (see the
  Ambetter reason strings for the house style).
- `cancelPreviousPolicyId` triggers cancel-previous-version handling
  downstream (synthetic diff + apply-step metadata). Return
  `findPreviousVersion(...)` if your carrier reuses policy numbers across
  terms, `null` otherwise.

## 2. How inputs reach your engine

Three channels, all per-carrier config:

### a. Named roles (`statusConfig.fieldMapping` → `StatusInput`)

`fieldMapping` maps role name → file header (or computed-field outputKey).
The known vocabulary is `STATUS_ROLES` / `STATUS_ENGINE_ROLE_TYPES`
(engines/status.ts): `effectiveDate`, `paidThroughDate`, `termDate`,
`brokerEffectiveDate`, `policyEffectiveDate` (dates) and
`eligibleForCommission` (boolean). At parse time the role's declared type
coerces the raw cell (`STATUS_ENGINE_ROLE_TYPES` feeds the headerTypes map
in parse.job); at match time `buildStatusInputFromMapping` reads the
parsed values into the four named `StatusInput` fields.
(`brokerEffectiveDate`/`policyEffectiveDate` feed `deriveBrokerEffAudit`,
not `StatusInput` — see §5.)

### b. The open input channel (`StatusInput.extraRoles`)

Any `fieldMapping` key **outside** the known vocabulary lands in
`StatusInput.extraRoles` (role name → value), populated by
`buildStatusInputFromMapping`. This is how an engine receives signals the
named fields cannot express — an explicit status column, a premium-paid
amount, a lapse flag:

```jsonc
// carrierConfig.statusConfig.fieldMapping
{
  "effectiveDate": "Coverage Start",
  "carrierStatus": "Policy Status",   // not in STATUS_ROLES → extraRoles
  "premiumPaid": "Premium Paid Amt"   // not in STATUS_ROLES → extraRoles
}
```

Value typing: extraRoles values arrive **as the parse stage left them** —
coerced via headerTypes when the header is also mapped in `columnMapping`
(its CRM `fieldType` decides), otherwise the raw cell value. There is no
role-level text/number coercion yet; if your signal needs parsing
(currency strings, enums), do it inside the engine and treat unparseable
values like nulls. An engine that requires an extra role declares it in
`requiredRoles` — presence validation works on role names, vocabulary
membership is not required (`StatusRoleName`).

`ambetter-bob-v1` ignores `extraRoles` entirely (asserted by tests) — the
bag is purely additive.

### c. Per-engine params (`statusConfig.engineParams` → `config.engineParams`)

`engineParams` is engine-specific JSON validated against your
`paramsSchema` at both fail-fast points (parse.job right after the
engine-id check; match.job in `loadMatchContext`, which also threads the
validated object into `StatusEngineConfig.engineParams`). Re-runs
(REVIEW → MATCHING) re-validate, so live config edits are picked up.

Rules of the channel:

- Engines must treat `config.engineParams === undefined` exactly like `{}`
  (legacy configs predate the channel).
- Put carrier-tunable knobs here, NOT on the shared `StatusEngineConfig` —
  the dead `paymentErrorAgeDays` knob is what happens when engine-specific
  knobs land on the shared type.
- Ambetter's schema is `{ placedThresholdDays?: number }`; when set it
  overrides the legacy `statusConfig.placedThresholdDays`, which remains
  the fallback so existing configs are untouched.

## 3. What to reuse (exported generic ACA mechanics)

All exported from `engines/status.ts`, all pure, all
extracted verbatim from the Ambetter engine. Compose these instead of
forking — the broker-eff-audit duplication post-mortem (Phase 4.5, in the
file) is what copy-paste reuse costs.

| Export | What it gives you |
| --- | --- |
| `evaluateAcaPlacement(eff, paid, thresholdDays)` | The placement window: full-effective-month rule (Jackie) OR days-based fallback, plus the intermediate signals for reason strings. |
| `isFullEffectiveMonthPaid(eff, paid)` | Just the calendar-month rule. |
| `isPaidThroughCurrentMonth(paid, todayStr)` | Month-ahead payment-currency check (paid-through covers the current month end). Grace-period carriers write their own predicate instead. |
| `lastDayOfMonth(dateStr)` | UTC month-end resolution (null on bad input). |
| `findPreviousVersion(policies, newEff, currentId)` | Renewal handling: the most recent prior CRM version of the policy number — the cancel-previous-version candidate. |
| `getCurrentCrmStatus(policies, currentId)` | The matched policy's current CRM status from the cohort. |
| `deriveCanceledStatus(currentCrmStatus)` | Terminal-state helper: cancel preserving the PAYMENT_ERROR prefix (`PAYMENT_ERROR_*` → `PAYMENT_ERROR_CANCELED`, else `CANCELED`). |
| `normalizePaidThroughDateForEffectiveDate(paid, eff)` | Nulls a paid-through that predates effective (carrier data quirk guard). |
| `getCancelExpireDate(newEff)` | Day-before-effective expire stamp for canceled previous versions (UTC-safe). |
| `daysBetweenUTC(a, b)` (parsers/transforms.ts) | Signed day arithmetic on date-only strings. |

What is **deliberately not** reusable: the Ambetter cancel semantics
(`eligibleForCommission === false` as THE cancel signal) and its payment
error definition. Those are carrier billing semantics — the whole reason a
new engine exists.

There is **no general rule DSL, on purpose**: realistic carriers split into
(1) paid-through-centric — reuse `ambetter-bob-v1` via config (the Oscar
e2e proves this), (2) explicit-status — the passthrough engine below, and
(3) novel billing semantics — a small TS engine composed from the exports.
A condition/outcome DSL would re-implement zod-validated TS for no current
payoff; revisit only when the engine count makes TS maintenance a problem.

## 4. The expected first non-Ambetter engine: explicit-status passthrough

A carrier whose BOB carries an explicit status column should get a
**passthrough/mapping engine**, not a fork of the Ambetter date logic.
Expected shape (`explicit-status-v1`):

- `requiredRoles: ['carrierStatus']` — an extraRoles key; presence
  validation makes an unmapped status column fail the run.
- `knownRoles: ['carrierStatus', 'effectiveDate', 'paidThroughDate', 'termDate']`
  — the dates only pick expire dates / corroborate.
- `paramsSchema`: a strict schema with a `statusMap`
  (`Record<string, OmniaStatus>`, e.g. `{ "TERMED": "CANCELED", "LAPSED":
  "PAYMENT_ERROR_CANCELED" }`), an optional `defaultStatus`, and an
  optional expire-date source selector. The carrier→Omnia squashing is then
  config per carrier; the engine is the mechanism.
- `derive`: read `bobRow.extraRoles?.carrierStatus`, normalize
  (trim/uppercase), look up in `statusMap`; unmapped values should derive
  the configured default (or null-equivalent assertion) with a reason
  string naming the unmapped value, never throw mid-row. Reuse
  `findPreviousVersion`/`deriveCanceledStatus`/`getCancelExpireDate` for
  versioning and terminal handling.

Don't build it speculatively — build it when the first explicit-status
carrier file lands and its real status vocabulary is known.

## 5. Things that run regardless of your engine

- **Jackie's broker-eff audit** (`deriveBrokerEffAudit`) runs for every
  carrier independent of `engineId`, gated only on
  `brokerEffectiveDate`/`policyEffectiveDate` being mapped. The documented
  opt-out is leaving those roles unmapped — but computed fields whose
  `inputs` use those role names must then switch to literal header names.
- **Role-mapping validation in parse.job** uses YOUR descriptor's
  `requiredRoles`: missing-from-mapping and resolves-to-nothing both fail
  the run; optional roles that fail to resolve warn to server logs.
- **The fail-fast chain order** at PARSE:
  `parseCarrierPipelineConfig` (config shape) → `isKnownStatusEngine`
  (engine id, error lists registered ids) → `validateStatusEngineParams`
  (params schema) → `validateStatusRoleMapping` (presence, then
  resolvability). MATCH repeats the engine-id and params gates in
  `loadMatchContext`.
- **deriveStatus only runs for matched rows.** Unmatched rows carry
  `derivedStatus: null`; the UnmatchedView create-policy flow currently
  re-implements Ambetter semantics client-side (known gap — audit
  §domain-ui).

## 6. Registration checklist

1. **Write the engine** in `engines/status.ts` (or a sibling file imported
   by it): a `StatusEngineFn` + a strict `paramsSchema` + exported params
   type. Compose the §3 exports; keep it pure.
2. **Register the descriptor** in `STATUS_ENGINES` with honest
   `requiredRoles` (the blanket-corruption inputs only) and complete
   `knownRoles`. `STATUS_ENGINE_IDS`, `isKnownStatusEngine`, and both jobs'
   fail-fasts pick the id up automatically — no other wiring.
3. **Unit tests** (`engines/__tests__/status.spec.ts`):
   - derivation table for your engine (model: the ambetter `describe`
     blocks — canceled/active/edge cases against a fixed `today`);
   - params: schema rejection (bad type, unknown key) and the
     default-behavior path with `engineParams` absent;
   - the registry consistency suite (`self-describing status-engine
     registry`) covers your descriptor automatically — run it.
4. **E2E carrier block** (`engines/__tests__/pipeline-real-data.spec.ts`):
   add a carrier fixture exercising your engine through the full pipeline
   harness (config → parse → match → review items), mirroring the Oscar
   block. Assert at least one derived status, the stats line, and one
   failure mode (missing required role or rejected engineParams).
5. **Config for the carrier**: `statusConfig.engineId: '<your-id>'`,
   `fieldMapping` covering every requiredRole, `engineParams` matching your
   schema. See [carrier-onboarding.md](carrier-onboarding.md) step 2 for
   the full record.
6. **Repo bookkeeping** (non-negotiable for this fork): update
   `CUSTOMIZATIONS.md` and `scripts/check-customizations.sh` for the new
   engine code.
7. **Run everything**:
   `npx jest packages/twenty-server/src/modules/reconciliation
   --config=packages/twenty-server/jest.config.mjs` and
   `npx nx typecheck twenty-server` — the existing Ambetter suite is the
   bit-for-bit regression net; your change must leave it untouched.
