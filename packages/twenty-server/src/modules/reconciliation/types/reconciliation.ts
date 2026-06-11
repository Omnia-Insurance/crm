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
  /** Legacy knob; Ambetter active payment error uses current-month coverage. Default: 10 */
  paymentErrorAgeDays: number;
  /** Status engine id (see STATUS_ENGINE_IDS in engines/status.ts).
   *  Unknown ids fail the run at MATCH. */
  engineId: string;
};

// ---------------------------------------------------------------------------
// Computed field definitions (stored on carrierConfig)
// ---------------------------------------------------------------------------

export type ComputedFieldDef = {
  /** Key added to the parsed row */
  outputKey: string;
  /** Computation method: 'maxDate', 'minDate', 'coalesce' */
  method: string;
  /** XLSX column headers (or other row keys) used as inputs */
  inputs: string[];
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
