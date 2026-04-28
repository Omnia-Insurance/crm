/**
 * Shared types for the reconciliation pipeline.
 *
 * Types specific to individual engines (MatchDecision, BobRow, CrmPolicy,
 * MatchingConfig, FieldDiff, StatusDecision, etc.) remain in their engine
 * files. This file holds types used across multiple pipeline stages and
 * the v2 data model types (Reconciliation record, JSON attachment shapes).
 */

// Types previously imported from engines are no longer needed here.
// MatchResultData, ResolutionData, NbrNode, PendingMatchResult have been
// replaced by the reviewItem workspace object.

// ---------------------------------------------------------------------------
// Generic parsed row (output of config-driven parser)
// ---------------------------------------------------------------------------

export type GenericRow = Record<string, string | number | boolean | null> & {
  rowNumber: number;
  name: string;
  rawPayload: Record<string, unknown>;
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
  /** @deprecated Use columnMapping (new format) instead */
  fieldConfig: Record<string, unknown>[] | null;
  matchingConfig: Record<string, unknown> | null;
  statusConfig: StatusConfig | null;
  carrierId: string | null;
  policyNumberPattern?: string | null;
  columnMapping?: ColumnMapping | null;
  productMapping?: ProductMappingEntry[] | null;
  /** @deprecated Use fieldConfig instead */
  transformRules?: Record<string, unknown> | null;
  /** @deprecated Use statusConfig instead */
  statusRules?: Record<string, unknown> | null;
  /** @deprecated Use fieldConfig instead */
  explanationRules?: Record<string, unknown> | null;
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

/** @deprecated Legacy column mapping format (canonical name → XLSX aliases) */
export type LegacyColumnMapping = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Status engine config
// ---------------------------------------------------------------------------

export type StatusConfig = {
  /** Maps status engine roles → XLSX column headers (or computed field keys) */
  fieldMapping: Record<string, string>;
  placedThresholdDays: number;
  paymentErrorAgeDays: number;
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

export type EnrichedPolicyData = {
  id: string;
  planIdentifier: string | null;
  leadId: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
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

/** Fallback start date if not configured in matchingConfig.startDate */
export const DEFAULT_START_DATE = '2025-07-09';

/** Non-cancel statuses that should appear in BOB */
export const ACTIVE_CRM_STATUSES = new Set([
  'SUBMITTED',
  'PENDING',
  'ACTIVE_APPROVED',
  'ACTIVE_PLACED',
  'ACTIVE',
  'PAYMENT_ERROR_ACTIVE_APPROVED',
  'PAYMENT_ERROR_ACTIVE_PLACED',
]);

// ---------------------------------------------------------------------------
// Pipeline error
// ---------------------------------------------------------------------------

export class PipelineError extends Error {
  public readonly reconciliationId: string;
  public readonly step: string;
  public readonly originalError: unknown;

  constructor(
    reconciliationId: string,
    step: string,
    originalError: unknown,
  ) {
    const originalMessage =
      originalError instanceof Error
        ? originalError.message
        : String(originalError);

    super(`[${step}] ${originalMessage}`);

    this.name = 'PipelineError';
    this.reconciliationId = reconciliationId;
    this.step = step;
    this.originalError = originalError;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
