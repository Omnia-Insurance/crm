/**
 * Pure run-summary selection for the reconciliation review banner
 * (Linear OMN-11; multi-carrier readiness audit 2026-06-11 §"Config warnings
 * and parse-error details are server-log-only; the review UI renders neither
 * stats nor errorMessage").
 *
 * Extracted from ReconciliationRunSummaryBanner so the status mapping and
 * stats formatting are unit testable. Inputs are deliberately loose:
 * the reconciliation record arrives from recordStoreFamilyState (fetched by
 * RecordShowEffect with depth-1 fields) and `stats` is a server-written
 * RAW_JSON blob that admins can also hand-edit, so every read tolerates
 * missing keys and wrong shapes:
 *
 * - Older runs lack the newer counters (parseErrors, skippedBeforeStartDate,
 *   skippedInvalidPolicyNumber) — only present, finite numeric keys render.
 * - `stats.warnings` (string[]) and `stats.configFingerprint` (string) are
 *   forward-compat: a separate milestone persists them; absence or a wrong
 *   shape is silently tolerated.
 * - `errorMessage` is only surfaced for FAILED runs so a stale message from
 *   an earlier failed attempt is not shown next to a healthy status.
 */

export type RunStatusKind =
  | 'failed'
  | 'inProgress'
  | 'review'
  | 'completed'
  | 'unknown';

export type RunStatChip = {
  /** Stats JSON key (e.g. 'parseErrors') — stable id for rendering. */
  key: string;
  /** Fully formatted display text (e.g. '1,204 rows', '3 parse errors'). */
  text: string;
  /** Warning-styled when a warning-class counter is non-zero. */
  isWarning: boolean;
};

export type RunSummary = {
  statusKind: RunStatusKind;
  statusLabel: string;
  /** Only set for FAILED runs; carries the actionable [STEP] config errors. */
  errorMessage: string | null;
  /** Every known counter present in stats, in display order. */
  statChips: RunStatChip[];
  /** One-line core-counter summary (rows/auto-matched/needs review/unmatched). */
  summaryText: string | null;
  /** Aggregated non-zero warning counters for the warning chip. */
  warningSummaryText: string | null;
  /** Persisted run warnings (forward-compat; [] when absent). */
  warnings: string[];
  /** Per-run config fingerprint (forward-compat; null when absent). */
  configFingerprint: string | null;
  /** Whether the collapsible detail section has anything to show. */
  hasDetails: boolean;
};

export type ReconciliationRunRecordSlice = {
  status?: unknown;
  errorMessage?: unknown;
  stats?: unknown;
};

type StatusDescriptor = { kind: RunStatusKind; label: string };

const STATUS_DESCRIPTORS: Record<string, StatusDescriptor> = {
  UPLOADED: { kind: 'inProgress', label: 'Uploaded — parse not started' },
  PARSING: { kind: 'inProgress', label: 'Parsing file…' },
  PARSED: { kind: 'inProgress', label: 'Parsed — awaiting matching' },
  MATCHING: { kind: 'inProgress', label: 'Matching rows…' },
  REVIEW: { kind: 'review', label: 'In review' },
  // Dead legacy state (see ReconciliationStatus on the server) — old records
  // may still carry it, so label it rather than falling to 'unknown'.
  APPLYING: { kind: 'inProgress', label: 'Applying (legacy state)' },
  COMPLETED: { kind: 'completed', label: 'Completed' },
  FAILED: { kind: 'failed', label: 'Run failed' },
};

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

const pluralize = (value: number, singular: string, plural: string): string =>
  value === 1 ? singular : plural;

type CounterDescriptor = {
  key: string;
  label: (value: number) => string;
  /** Warning-class counters style the chip and feed warningSummaryText when > 0. */
  isWarningCounter: boolean;
};

/** Display order matches the operator's reading order: volume, outcomes, drops. */
const COUNTER_DESCRIPTORS: CounterDescriptor[] = [
  {
    key: 'totalBobRows',
    label: (value) => pluralize(value, 'row', 'rows'),
    isWarningCounter: false,
  },
  { key: 'autoMatched', label: () => 'auto-matched', isWarningCounter: false },
  { key: 'needsReview', label: () => 'needs review', isWarningCounter: false },
  { key: 'unmatched', label: () => 'unmatched', isWarningCounter: false },
  {
    key: 'parseErrors',
    label: (value) => pluralize(value, 'parse error', 'parse errors'),
    isWarningCounter: true,
  },
  {
    key: 'skippedBeforeStartDate',
    label: () => 'skipped before start date',
    isWarningCounter: true,
  },
  {
    key: 'skippedInvalidPolicyNumber',
    label: () => 'skipped — invalid policy #',
    isWarningCounter: true,
  },
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readCounter = (
  stats: Record<string, unknown>,
  key: string,
): number | null => {
  const value = stats[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const readWarnings = (stats: Record<string, unknown> | null): string[] => {
  const value = stats?.['warnings'];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.trim() !== '',
  );
};

const readConfigFingerprint = (
  stats: Record<string, unknown> | null,
): string | null => {
  const value = stats?.['configFingerprint'];

  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

export const getRunSummary = (
  record: ReconciliationRunRecordSlice,
): RunSummary => {
  const rawStatus = typeof record.status === 'string' ? record.status : null;
  const statusDescriptor =
    rawStatus !== null ? STATUS_DESCRIPTORS[rawStatus] : undefined;
  const statusKind = statusDescriptor?.kind ?? 'unknown';
  const statusLabel =
    statusDescriptor?.label ??
    (rawStatus !== null ? rawStatus : 'Status unknown');

  const errorMessage =
    statusKind === 'failed' &&
    typeof record.errorMessage === 'string' &&
    record.errorMessage.trim() !== ''
      ? record.errorMessage
      : null;

  const stats = isPlainObject(record.stats) ? record.stats : null;

  const statChips: RunStatChip[] = [];
  const coreTexts: string[] = [];
  const warningTexts: string[] = [];

  for (const descriptor of COUNTER_DESCRIPTORS) {
    const value = stats === null ? null : readCounter(stats, descriptor.key);

    if (value === null) {
      continue;
    }

    const text = `${NUMBER_FORMAT.format(value)} ${descriptor.label(value)}`;
    const isWarning = descriptor.isWarningCounter && value > 0;

    statChips.push({ key: descriptor.key, text, isWarning });

    if (descriptor.isWarningCounter) {
      if (value > 0) {
        warningTexts.push(text);
      }
    } else {
      coreTexts.push(text);
    }
  }

  const warnings = readWarnings(stats);
  const configFingerprint = readConfigFingerprint(stats);

  return {
    statusKind,
    statusLabel,
    errorMessage,
    statChips,
    summaryText: coreTexts.length > 0 ? coreTexts.join(' · ') : null,
    warningSummaryText:
      warningTexts.length > 0 ? warningTexts.join(' · ') : null,
    warnings,
    configFingerprint,
    hasDetails:
      statChips.length > 0 || warnings.length > 0 || configFingerprint !== null,
  };
};
