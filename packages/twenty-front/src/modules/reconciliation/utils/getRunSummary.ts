import { type MessageDescriptor } from '@lingui/core';
import { msg, t } from '@lingui/core/macro';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

// Run summary for the review banner (OMN-11). `stats` is a server-written JSON
// blob admins can hand-edit and older runs lack newer counters, so every read
// tolerates missing keys and wrong shapes. errorMessage only shows for FAILED
// runs so a stale message never sits next to a healthy status.

export type RunStatusKind =
  | 'failed'
  | 'inProgress'
  | 'review'
  | 'completed'
  | 'unknown';

export type RunStatChip = {
  key: string;
  text: string;
  isWarning: boolean;
};

export type RunSummary = {
  statusKind: RunStatusKind;
  statusLabel: string;
  // FAILED runs only: carries the actionable [STEP] config errors
  errorMessage: string | null;
  statChips: RunStatChip[];
  summaryText: string | null;
  warningSummaryText: string | null;
  // warnings and configFingerprint are forward-compat: absent on older runs
  warnings: string[];
  configFingerprint: string | null;
  hasDetails: boolean;
};

export type ReconciliationRunRecordSlice = {
  status?: unknown;
  errorMessage?: unknown;
  stats?: unknown;
};

type StatusDescriptor = { kind: RunStatusKind; label: MessageDescriptor };

const STATUS_DESCRIPTORS: Record<string, StatusDescriptor> = {
  UPLOADED: { kind: 'inProgress', label: msg`Uploaded — parse not started` },
  PARSING: { kind: 'inProgress', label: msg`Parsing file…` },
  PARSED: { kind: 'inProgress', label: msg`Parsed — awaiting matching` },
  MATCHING: { kind: 'inProgress', label: msg`Matching rows…` },
  REVIEW: { kind: 'review', label: msg`In review` },
  // Dead legacy state (see ReconciliationStatus on the server) — old records
  // may still carry it, so label it rather than falling to 'unknown'.
  APPLYING: { kind: 'inProgress', label: msg`Applying (legacy state)` },
  COMPLETED: { kind: 'completed', label: msg`Completed` },
  FAILED: { kind: 'failed', label: msg`Run failed` },
};

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

const pluralize = (value: number, singular: string, plural: string): string =>
  value === 1 ? singular : plural;

type CounterDescriptor = {
  key: string;
  label: (value: number) => string;
  isWarningCounter: boolean;
};

// Operator reading order: volume, outcomes, drops
const COUNTER_DESCRIPTORS: CounterDescriptor[] = [
  {
    key: 'totalBobRows',
    label: (value) => pluralize(value, t`row`, t`rows`),
    isWarningCounter: false,
  },
  { key: 'autoMatched', label: () => t`auto-matched`, isWarningCounter: false },
  { key: 'needsReview', label: () => t`needs review`, isWarningCounter: false },
  { key: 'unmatched', label: () => t`unmatched`, isWarningCounter: false },
  {
    key: 'parseErrors',
    label: (value) => pluralize(value, t`parse error`, t`parse errors`),
    isWarningCounter: true,
  },
  {
    key: 'skippedBeforeStartDate',
    label: () => t`skipped before start date`,
    isWarningCounter: true,
  },
  {
    key: 'skippedInvalidPolicyNumber',
    label: () => t`skipped — invalid policy #`,
    isWarningCounter: true,
  },
];

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
  const statusLabel = isDefined(statusDescriptor)
    ? t(statusDescriptor.label)
    : (rawStatus ?? t`Status unknown`);

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
