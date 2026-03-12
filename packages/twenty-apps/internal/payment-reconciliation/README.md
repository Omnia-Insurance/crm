# Payment Reconciliation

## Current Boundary

This should be a separate Twenty app and an independent execution process.

- It should not run as logic embedded in the main CRM.
- It should own reconciliation state, imports, payment expectations, receipts, audits, and forecasting.
- The CRM should be treated as an external business system that provides reference policy data and receives approved status updates back.

That boundary keeps carrier/payment complexity out of the CRM and avoids turning the CRM into the runtime engine for reconciliation.

## Product Scope

The app has three major subsystems:

1. Ingestion and normalization engine
2. Reconciliation engine
3. Revenue recognition and forecasting

## Working Assumptions

- Carrier BOB data is the source of truth for current policy status.
- Health Sherpa remains useful for enrollment facts, but not ongoing status truth.
- Carrier commission statements are the only source of truth for cash actually received.
- OMNIA CRM remains the source of truth for controlled internal fields like the business-effective date and agent ownership.
- The reconciliation app mirrors the minimum required CRM data into its own objects instead of querying CRM tables as its operating data model.

## Proposed System Boundary

### Inputs

- CRM policy mirror sync
- Carrier BOB uploads
- Carrier commission statement uploads
- Manual operator inputs for audits, overrides, and carrier responses

### Outputs

- Recommended or approved policy status changes back to CRM
- Audit work queues
- Payment variance queues
- Forecast and recognized revenue datasets
- Dashboard-friendly summary views

## Proposed App Architecture

### 1. CRM Mirror Layer

Purpose: bring a stable snapshot of the CRM into the reconciliation app without making the app depend on CRM internals at runtime.

Mirror only fields needed for matching and downstream decisions:

- CRM policy id
- policy number
- application id / external ids
- carrier / product / product type
- agent / agent status
- lead / member names and DOB where available
- effective date / expiration date
- current CRM status
- member count / household count
- LTV snapshot and submitted date where useful

The current CRM already stores useful upstream facts such as `policyNumber`, `applicationId`, `externalPolicyId`, `externalSource`, `planIdentifier`, `memberIdentifiers`, `paymentStatus`, `lastExternalSync`, and `ltv`. The reconciliation app should ingest those as reference data, not re-model them in the CRM.

### 2. Ingestion and Normalization Layer

Purpose: convert inconsistent carrier files into a carrier-neutral ledger.

Core responsibilities:

- store raw uploaded files
- version uploads by carrier and statement/book type
- map source columns into normalized fields
- preserve row-level provenance back to upload + line number
- run carrier-specific parsers without hardcoding carrier logic into the app core

This layer should be configuration-driven where possible:

- column mappings
- date parsing rules
- status mapping rules
- PMPM / commission schedules
- payment lag assumptions
- duplicate and conflict rules

### 3. Reconciliation Layer

Purpose: compare normalized carrier facts against CRM mirror records and determine what changed.

Core responsibilities:

- candidate matching between carrier rows and CRM policies
- carrier-specific status derivation
- diff detection against prior BOB snapshot
- conflict classification: auto-apply, review-needed, unmatched
- lifecycle tracking for unmonitored policies after agent termination

This layer should produce decisions, not just deltas:

- new canonical status
- effective / expiration dates
- match confidence
- reason code
- whether the result can auto-sync to CRM
- whether a human review or audit case is required

### 4. Revenue Layer

Purpose: model expected commissions, actual receipts, and variance over time.

Core responsibilities:

- create monthly commission expectations from reconciled policy state
- ingest actual commission receipts from statements
- match receipts to expected lines
- identify underpayments, no-pays, late pays, and retro adjustments
- produce earned, cash, and forecast views separately

This should be a ledger, not a single summary table.

## Core Domain Model

The app should start with explicit custom objects for the following concepts.

### Reference Objects

- `CarrierConfig`
  - carrier name
  - upload types supported
  - parser id
  - status mapping config
  - PMPM / commission schedule
  - payment lag assumptions
  - audit contact / audit constraints

- `CrmPolicyMirror`
  - crm policy id
  - policy number
  - application id
  - carrier / product / agent / lead references
  - controlled effective date
  - current crm status
  - latest sync timestamp

### Import Objects

- `SourceFile`
  - carrier
  - file type: BOB, commission statement, audit response
  - coverage month / statement month
  - uploaded by
  - checksum
  - parse status

- `NormalizedBookRow`
  - source file id
  - row number
  - carrier policy number
  - member/subscriber identifiers
  - names / DOB
  - broker name / agent of record
  - true effective date inputs
  - normalized status inputs
  - paid through date
  - term date
  - raw payload

- `NormalizedCommissionLine`
  - source file id
  - row number
  - policy/member identifiers
  - payment month
  - coverage month
  - amount
  - members paid
  - commission type
  - raw payload

### Matching and Reconciliation Objects

- `PolicyIdentity`
  - stable carrier-side identity grouping
  - not equal to CRM policy id
  - used when carrier identifiers roll across years or AOR changes

- `PolicyVersion`
  - a specific coverage/version slice
  - anchored by carrier, true effective date, and AOR context
  - especially important for Ambetter where the same member number can span multiple years and agents

- `ReconciliationRun`
  - carrier
  - source file id
  - run status
  - ruleset version
  - counts by outcome

- `ReconciliationDecision`
  - matched crm policy mirror
  - matched policy version
  - proposed canonical status
  - confidence
  - reason code
  - requires review
  - sync-back status

### Revenue Objects

- `CommissionExpectation`
  - policy version
  - coverage month
  - expected members
  - expected amount
  - expectation reason

- `CommissionReceipt`
  - normalized commission line
  - policy version
  - coverage month
  - received amount
  - statement month

- `PaymentVariance`
  - expectation id
  - receipt id
  - variance type: exact, underpaid, unpaid, overpaid, retro
  - amount delta
  - follow-up state

- `AuditCase`
  - carrier
  - policy version
  - audit reason
  - status
  - submitted at
  - notes / outcome

## Matching Strategy

Policy number alone is not safe enough.

The matching stack should be:

1. exact deterministic keys where possible
2. carrier-specific composite keys
3. scored fallback matching
4. human review for ambiguous cases

For Ambetter specifically:

- treat carrier `policy_number` as a member/subscriber number, not a unique policy id
- create `PolicyIdentity` from carrier + member number + member fingerprint where needed
- create `PolicyVersion` from identity + true effective date + AOR/broker context
- always preserve previous versions when a new effective-date slice appears

## Ambetter-First Rules

Ambetter should be the first production carrier.

Why:

- the brief already contains a usable ruleset
- Ambetter has the most clearly documented edge cases
- it exercises the hardest matching problem early: recurring member numbers, 1/1 rollovers, and overlapping AOR slices

Initial Ambetter build should support:

- BOB upload and normalization
- true effective date derivation using max of broker effective date and policy effective date
- Jackie’s status tree translated to code
- previous-version cancellation when a later effective-date version is detected
- payment expectation generation using PMPM and Health Sherpa member count
- commission statement reconciliation
- audit queue creation for unpaid expected business

## Status Model

The app should own a canonical reconciliation taxonomy even if CRM currently uses a narrower enum set.

Canonical statuses for the app:

- Active - Approved
- Active - Placed
- Active - Unmonitored
- Payment Error - Active Approved
- Payment Error - Active Placed
- Canceled
- Canceled - AOR Changed

The CRM sync should map from app status to CRM status fields deliberately.

Open gap:

- verify whether the current CRM enum set already supports `Active - Unmonitored` and `Canceled - AOR Changed`
- if not, keep these as app-native statuses first and add CRM sync expansion separately

## Revenue Recognition and Forecasting Model

The app should keep three separate views:

- `cash received`
  - what carrier actually paid
- `earned / expected`
  - what should have been paid for a coverage month based on reconciled active status
- `forecast`
  - what is likely to be paid in future statement months based on active policy base, PMPM, member count, and known lag curves

Forecasting should be conservative in v1:

- use reconciled active policy counts
- use carrier PMPM schedules
- use recent realized payment lag by carrier
- separate monitored and unmonitored policy revenue

Do not blend cash and forecast into one metric.

## Operator Workflow

The UI should optimize for Vicki-level operation rather than generic CRM record editing.

Primary screens:

- import center
- carrier upload history
- unmatched / ambiguous policy matches
- proposed CRM status changes
- payment variance queue
- unmonitored policies dashboard
- audit case queue
- carrier month summary

## Sync Strategy With CRM

The reconciliation app should sync with CRM in two directions:

### Into the app

- scheduled CRM snapshot pull
- on-demand refresh for a specific policy or agent
- optional event-driven refresh later

### Back to CRM

- approved policy status changes
- expiration date updates
- AOR-changed outcomes
- optional notes / tasks pointing back to audit cases

Default rule:

- do not write intermediate reconciliation state into CRM
- only write approved business outcomes back

## Suggested Delivery Phases

### Phase 0: Capture and samples

- collect real sample files for Ambetter BOBs and commission statements
- capture carrier-to-OMNIA status mapping document
- confirm exact Ambetter PMPM and lag rules
- define CRM fields that may be written back automatically

### Phase 1: Ambetter status reconciliation

- build CRM mirror sync
- build BOB import pipeline
- build Ambetter normalization and matching
- produce status recommendations
- support manual review queue

### Phase 2: Ambetter payment reconciliation

- ingest commission statements
- generate commission expectations
- match statements to expectations
- build unpaid / underpaid queue
- create audit cases

### Phase 3: Revenue and operations

- revenue forecast views
- unmonitored policy workflow
- carrier-month scorecards
- CRM write-back automation

### Phase 4: Additional carriers

- Oscar
- BCBS / Anthem
- others using the same normalized model with carrier configs and parser plugins

## Key Open Questions

- What exact CRM fields are allowed to be updated automatically by this app?
- Should CRM write-back be fully automatic for high-confidence cases or always require review at first?
- What are the exact PMPM schedules, effective-date changes, and retro rules by carrier?
- What commission statement formats exist per carrier, and are statement lines per member or per policy?
- Which carriers lose BOB visibility when an agent is termed, versus staying visible at agency level?
- What is the canonical audit submission output per carrier?
- Does the app need its own persistent worker outside standard Twenty function execution for large file parsing or scheduled month-end runs?

## Recommended Next Artifacts

1. `application.config.ts` for the app shell and variables
2. object list and field list for the core reconciliation objects
3. Ambetter parser spec from real files
4. CRM sync contract defining exact read and write fields
5. first-run operator workflow for import -> review -> sync -> audit
