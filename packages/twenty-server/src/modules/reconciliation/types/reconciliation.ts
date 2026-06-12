/**
 * Shared types for the reconciliation pipeline.
 *
 * Types specific to individual engines (MatchDecision, BobRow, CrmPolicy,
 * MatchingConfig, FieldDiff, StatusDecision, etc.) remain in their engine
 * files. This file holds types used across multiple pipeline stages and
 * the v2 data model types (Reconciliation record, JSON attachment shapes).
 */

import type { MatchingConfig } from 'src/modules/reconciliation/engines/matching';

// Types previously imported from engines are no longer needed here.
// MatchResultData, ResolutionData, NbrNode, PendingMatchResult have been
// replaced by the reviewItem workspace object.

// ---------------------------------------------------------------------------
// Generic parsed row (shape of the parsed-data JSON attachment rows; the
// dead "config-driven parser" that originally produced it was deleted in
// Phase 4.1 — transformRows in parsers/transforms.ts is the live producer)
// ---------------------------------------------------------------------------

export type GenericRow = {
  rowNumber: number;
  name: string;
  rawPayload: Record<string, unknown>;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Pipeline status
// ---------------------------------------------------------------------------

export type ReconciliationStatus =
  | 'UPLOADED'
  | 'PARSING'
  | 'PARSED'
  | 'MATCHING'
  | 'REVIEW'
  /** @deprecated Dead state — the server-side apply step was removed
   *  2026-04-29 and no code transitions into or out of APPLYING (see
   *  VALID_TRANSITIONS in state-machine.service.ts). Kept only because the
   *  workspace SELECT option still exists (seed command), so legacy records
   *  may carry the value. */
  | 'APPLYING'
  | 'COMPLETED'
  | 'FAILED';

// ---------------------------------------------------------------------------
// Reconciliation record (workspace object fields)
// ---------------------------------------------------------------------------

export type ReconciliationRecord = {
  id: string;
  name: string;
  carrierConfigId: string | null;
  sheetName: string | null;
  /** Pinned id of the attachment holding the uploaded BOB source file.
   *  Set by readSourceFile on first resolution; subsequent reads use exactly
   *  this attachment instead of newest-of-any-kind. May be undefined on
   *  records created before the field was seeded. */
  sourceAttachmentId?: string | null;
  columnMapping: ColumnMapping | null;
  status: ReconciliationStatus;
  stats: ReconciliationStats | null;
  errorMessage: string | null;
  parsedAt: string | null;
  matchedAt: string | null;
  appliedAt: string | null;
  completedAt: string | null;
};

export type ReconciliationStats = {
  totalBobRows: number;
  autoMatched: number;
  needsReview: number;
  unmatched: number;
  /** Active CRM policies (statusVocabulary.activeStatuses) absent from the
   *  carrier file — the match job's missing-from-BOB phase (OMN-12). Always
   *  0 while matchingConfig.enableMissingFromBob is off (the default).
   *  Counted separately from `unmatched`/`needsReview` (those count file
   *  rows; this counts CRM-side gaps). */
  missingFromBob: number;
  discrepanciesFound: number;
  applied: number;
  failed: number;
  skipped: number;
  /** Number of cell-level parse errors (rows still included with raw values) */
  parseErrors?: number;
  /** ISO timestamp stamped when the PARSING phase starts (stuck-run
   *  detection, audit 2026-06-10 §"Worker crash mid-job"). Lives in the
   *  stats JSON rather than a dedicated workspace field because adding
   *  object fields requires editing the seed command (owned by another
   *  workstream); the JSON column needs no schema change. */
  parsingStartedAt?: string;
  /** ISO timestamp stamped when the MATCHING phase starts.
   *  See parsingStartedAt for why this lives in stats. */
  matchingStartedAt?: string;
  /** BOB rows skipped because their effective date predates the carrier's
   *  configured matchingConfig.startDate cutoff. Surfaced so operators can
   *  see why totalBobRows diverges from processed rows (audit 2026-06-10
   *  §"Omnia onboarding date is baked in"). */
  skippedBeforeStartDate?: number;
  /** BOB rows skipped because their policy number failed the carrier's
   *  policyNumberPattern (e.g. Ambetter's '^U'). */
  skippedInvalidPolicyNumber?: number;
  /** Raw file rows dropped at PARSE by parseSettings.rowFilters /
   *  skipFooterRows (OMN-12 — footer 'Totals' rows, blank separators).
   *  Stamped at the PARSING → PARSED stats write; like parseErrors, it does
   *  not survive the match job's wholesale stats rebuild, and the banner
   *  tolerates its absence. */
  skippedByRowFilter?: number;
  /** Operator-facing run warnings (carrier-config boundary `onWarning`
   *  messages: legacy fallbacks, ignored keys, config-drift notices),
   *  deduped and capped (~20) by `mergeRunWarnings`. Stamped at the
   *  PARSING → PARSED and MATCHING → REVIEW stats writes; absent on runs
   *  that predate the key (Linear OMN-11). Rendered by the frontend
   *  run-summary banner. */
  warnings?: string[];
  /** First 12 hex chars of sha256 of the canonical JSON of the parsed
   *  CarrierPipelineConfig (`computeConfigFingerprint`). The match job
   *  compares its live fingerprint against the parse-time stamp and appends
   *  a warning when the config changed mid-run. Absent on older runs. */
  configFingerprint?: string;
};

// ---------------------------------------------------------------------------
// Product mapping (per-carrier plan name → CRM product resolution)
// ---------------------------------------------------------------------------

export type ProductMappingEntry = {
  /** Case-insensitive substring to match against the BOB plan name */
  pattern: string;
  /** CRM product record ID */
  productId: string;
  /** CRM product display name (for preview rendering without a DB lookup) */
  productName: string;
};

export type CarrierConfigRecord = {
  id: string;
  name: string;
  parserVersion: string | null;
  /** Computed-field definitions (`ComputedFieldDef[]`). Despite the legacy
   *  name, this is the active home for computed-field config — read by
   *  match.job.ts and parse.job.ts. */
  fieldConfig: Record<string, unknown>[] | null;
  /** Stored matching config is admin-editable JSON and may be partial
   *  (saved before a field existed, or hand-edited). Typed Partial so every
   *  consumer is forced through the defaults merge in
   *  `parseCarrierPipelineConfig` (types/carrier-config.ts) instead of a
   *  wholesale cast (audit 2026-06-10 §"matchingConfig cast wholesale"). */
  matchingConfig: Partial<MatchingConfig> | null;
  /** Same admin-editable JSON caveat as matchingConfig — merge through
   *  `parseCarrierPipelineConfig`, never cast to the full StatusConfig. */
  statusConfig: Partial<StatusConfig> | null;
  carrierId: string | null;
  policyNumberPattern?: string | null;
  columnMapping?: ColumnMapping | null;
  productMapping?: ProductMappingEntry[] | null;
  /** Per-carrier transform vocabulary (TransformRules shape, Phase 4.8).
   *  Admin-editable JSON — validated and consumed only through
   *  `parseCarrierPipelineConfig` → `buildTransforms`, never cast. Typed
   *  loosely here (like fieldConfig) to keep types/ free of a parsers/
   *  import cycle. */
  transformRules?: Record<string, unknown> | null;
  /** Parse-stage settings (ParseSettings shape, OMN-12): headerRow (1-based),
   *  rowFilters, skipFooterRows. Same admin-editable JSON caveat — validated
   *  only through `parseCarrierPipelineConfig`; typed loosely for the same
   *  cycle reason as transformRules. NOTE: the carrierConfig workspace
   *  object does not yet seed a `parseSettings` RAW_JSON field — until the
   *  seed adds it, the record reads as undefined and the defaults (today's
   *  behavior) apply. */
  parseSettings?: Record<string, unknown> | null;
  /** Per-carrier diff suppression knobs (partial DiffPolicy shape, OMN-12
   *  tuning depth): suppressAgentFields, suppressPremiumDiffs,
   *  suppressBackwardsEffectiveDate, suppressAcaRolloverEffectiveDate,
   *  leadIdentityFields, suppressNegativeToNegativeStatus. Same
   *  admin-editable JSON caveat — validated only through
   *  `parseCarrierPipelineConfig` (merged over DEFAULT_DIFF_POLICY); typed
   *  loosely to keep types/ free of an engines/ import. NOTE: not yet
   *  seeded as a RAW_JSON field — until the seed adds it, the record reads
   *  as undefined and the defaults (today's hardcoded guards) apply. */
  diffConfig?: Record<string, unknown> | null;
  /** Per-carrier status vocabulary (partial StatusVocabulary shape, OMN-12
   *  tuning depth): negativeTerminalStatuses, activeStatuses. Same caveats
   *  as diffConfig — validated only through `parseCarrierPipelineConfig`
   *  (merged over DEFAULT_STATUS_VOCABULARY); not yet seeded. */
  statusVocabulary?: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Column mapping (new format — captured from import dialog)
// ---------------------------------------------------------------------------

/** Maps XLSX column header → CRM field info. Stored on both carrierConfig
 *  (persistent, for pre-fill) and reconciliation (snapshot per run). */
export type ColumnMappingEntry = {
  /** CRM field path: 'policyNumber', 'lead.name.firstName', 'agent.name' */
  crmField: string;
  /** FieldMetadataType: 'TEXT', 'DATE_TIME', 'FULL_NAME', etc. */
  fieldType: string;
  /** SpreadsheetImportField.key for pre-fill round-trip */
  fieldKey: string;
};

export type ColumnMapping = Record<string, ColumnMappingEntry>;

// ---------------------------------------------------------------------------
// Status engine config
// ---------------------------------------------------------------------------

/**
 * The single home for status-engine selection + thresholds (Phase 4.3 —
 * audit §"Status-engine thresholds are split-brained"). The duplicate
 * placedThresholdDays/paymentErrorAgeDays knobs on MatchingConfig were
 * deleted; `parseCarrierPipelineConfig` resolves this stored (possibly
 * partial) record against DEFAULT_STATUS_ENGINE_CONFIG and the engine
 * registry, and the match job reads thresholds only from that result.
 */
export type StatusConfig = {
  /** Maps status engine roles → XLSX column headers (or computed field keys) */
  fieldMapping: Record<string, string>;
  /** Days since effective to consider a policy "placed". Default: 30 */
  placedThresholdDays: number;
  // paymentErrorAgeDays was REMOVED from the stored surface (audit
  // 2026-06-11 §"Validated-but-dead knobs"): no engine ever read it. Stored
  // values are ignored with a boundary warning; engine-specific knobs
  // belong in statusConfig.engineParams.
  /** Status engine id (see STATUS_ENGINE_IDS in engines/status.ts).
   *  Unknown ids fail the run at MATCH. */
  engineId: string;
  /** Per-engine parameters, validated against the selected engine's
   *  `paramsSchema` (STATUS_ENGINES descriptor, engines/status.ts) at the
   *  parse/match fail-fast points — unknown or mistyped params kill the run
   *  with an actionable error. Ambetter accepts `{ placedThresholdDays? }`
   *  (overrides the legacy sibling knob when set). */
  engineParams: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Computed field definitions (stored on carrierConfig)
// ---------------------------------------------------------------------------

export type ComputedFieldDef = {
  /** Key added to the parsed row */
  outputKey: string;
  /** Computation method id (COMPUTATION_METHOD_IDS in parsers/transforms.ts):
   *  'maxDate', 'minDate', 'coalesce', 'firstNonEmpty', 'concat',
   *  'conditional', 'arithmetic'. Unknown methods fail the config boundary. */
  method: string;
  /** XLSX column headers (or other row keys) used as inputs */
  inputs: string[];
  /** Method-specific params (OMN-12) — e.g. concat `{ separator }`,
   *  conditional `{ if, then, else }`, arithmetic `{ expr }`. Validated per
   *  method by `validateComputedFieldParams` at the config boundary. */
  params?: Record<string, unknown>;
  /** Data type of the output */
  type: string;
  /** CRM field this computed value maps to (for diffing) */
  crmField?: string;
};

// NbrNode, MatchResultData, ResolutionData, PendingMatchResult — REMOVED.
// Match results are now reviewItem workspace records with SELECT fields.
// Resolutions are the `decision` field on those records.

// ---------------------------------------------------------------------------
// Enriched policy data (extra fields fetched after matching)
// ---------------------------------------------------------------------------

/**
 * Phase-2 enrichment loaded only for matched policies. Path-keyed to match
 * `CrmPolicy` shape so a simple spread is enough to merge in `buildPolicyForDiff`.
 */
export type EnrichedPolicyData = {
  id: string;
  planIdentifier: string | null;
  'lead.id': string | null;
  'lead.phones.primaryPhoneNumber': string | null;
  'lead.emails.primaryEmail': string | null;
};

// ---------------------------------------------------------------------------
// Job payloads
// ---------------------------------------------------------------------------

export type ReconciliationJobData = {
  workspaceId: string;
  reconciliationId: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Batch size for CRM mutations during apply phase */
export const BATCH_SIZE = 20;

/** Delay between batches to avoid overwhelming the database (ms) */
export const BATCH_DELAY_MS = 100;

// DEFAULT_START_DATE was deleted in Phase 4.4 — the start-date cutoff's
// single source is DEFAULT_MATCHING_CONFIG.startDate (engines/matching.ts),
// resolved per-carrier through parseCarrierPipelineConfig.

/** A run still in PARSING/MATCHING whose phase started more than this long
 *  ago (per stats.parsingStartedAt / stats.matchingStartedAt) is considered
 *  stuck — the worker crashed before setFailed could run — and may be
 *  force-restarted through the orchestrator's recovery path. */
export const STUCK_RUN_THRESHOLD_MS = 30 * 60 * 1000;

/** Non-cancel statuses that should appear in BOB. Single home is
 *  types/policy-statuses.ts (Phase 4.4); re-exported here for compat. */
export { ACTIVE_CRM_STATUSES } from 'src/modules/reconciliation/types/policy-statuses';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
