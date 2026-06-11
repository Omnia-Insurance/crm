/**
 * Review-item vocabulary + derivation functions for the reconciliation
 * pipeline (deriveCategory / deriveFlags, called by the match job).
 *
 * ARCHITECTURE NOTE (Phase 4.1 — audit 2026-06-10 §"Two parallel
 * carrier-config models"): the "unified FieldConfigEntry[] drives all 6
 * pipeline stages" design this file once documented was never wired up; its
 * parser stack (parsers/generic.ts, parsers/registry.ts,
 * config/ambetter.field-config.ts) and the FieldConfigEntry type itself
 * have been deleted. The LIVE per-carrier
 * config model is:
 *
 *   - `reconciliation.columnMapping` / `carrierConfig.columnMapping` —
 *     XLSX header → {crmField, fieldType, fieldKey}
 *     (ColumnMappingEntry, types/reconciliation.ts), captured by the import
 *     dialog and pre-filled by the seed command;
 *   - `carrierConfig.fieldConfig` — ComputedFieldDef[] (computed fields like
 *     'True Effective Date');
 *   - `carrierConfig.statusConfig` — engineId + thresholds + fieldMapping
 *     (status-engine role → header);
 *   - `carrierConfig.matchingConfig` / `transformRules` /
 *     `policyNumberPattern` / `productMapping` — engine knobs;
 *
 * all read exclusively through the validated `parseCarrierPipelineConfig`
 * boundary in types/carrier-config.ts.
 */

// ---------------------------------------------------------------------------
// Review types (used by reviewItem workspace object)
// ---------------------------------------------------------------------------

export type ReviewCategory = 'UPDATE' | 'UNMATCHED';

export type ReviewFlag =
  | 'STATUS_CHANGE'
  | 'PAYMENT_ERROR'
  | 'REINSTATEMENT'
  | 'BROKER_EFF_AUDIT'
  | 'MULTI_MATCH'
  | 'NAME_MISMATCH';

export type DecisionAction =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SKIPPED'
  | 'FLAG_AUDIT';

// ---------------------------------------------------------------------------
// Derivation functions (called once by the match job)
// ---------------------------------------------------------------------------

import {
  type FieldDiff,
  isNameLikeCrmField,
  isNegativeToNegativeStatusChange,
} from 'src/modules/reconciliation/engines/diff';
import {
  buildBrokerEffAuditInput,
  deriveBrokerEffAudit,
} from 'src/modules/reconciliation/engines/status';
import { NEGATIVE_TERMINAL_STATUSES } from 'src/modules/reconciliation/types/policy-statuses';

/**
 * Derive the review category. Returns null for confirmed records
 * (matched, no diffs, status agrees) — these should be skipped entirely.
 */
export const deriveCategory = (
  isUnmatched: boolean,
  fieldDiffs: FieldDiff[],
  derivedStatus: string | null,
  currentCrmStatus: string | null,
): ReviewCategory | null => {
  if (isUnmatched) return 'UNMATCHED';

  const hasDiffs = fieldDiffs.length > 0;
  // A null derivedStatus means "no status assertion" (the engine didn't
  // run or had nothing to say), NOT "status changed" (Phase 4.3 / deferred
  // item 3.13). The old `derivedStatus !== currentCrmStatus` comparison
  // promoted every null-status row with a real CRM status to an empty
  // UPDATE item — no diffs, no STATUS_CHANGE flag, nothing to apply —
  // flooding the review queue. Also mirror diff.ts: terminal-to-terminal
  // status changes don't produce a diff, so they shouldn't promote a record
  // to UPDATE on their own.
  const statusChanged =
    derivedStatus !== null &&
    derivedStatus !== currentCrmStatus &&
    !isNegativeToNegativeStatusChange(derivedStatus, currentCrmStatus);

  if (hasDiffs || statusChanged) return 'UPDATE';

  // No diffs and no status disagreement — confirmed, skip creating record
  return null;
};

/**
 * Per-flag explanation. Each entry maps a flag to a one-line, human-readable
 * reason — surfaced in the review UI so the user can see *why* the flag fired
 * without re-deriving the trigger from scratch.
 */
export type FlagReasons = Partial<Record<ReviewFlag, string>>;

export type DerivedFlagsResult = {
  flags: ReviewFlag[];
  reasons: FlagReasons;
};

/**
 * Derive flags for a review item, plus a per-flag reason string. Called AFTER
 * diff enrichment so it can inspect fieldDiffs for NAME_MISMATCH and
 * STATUS_CHANGE detection.
 */
export const deriveFlags = (
  derivedStatus: string | null,
  currentCrmStatus: string | null,
  matchMethod: string,
  fieldDiffs: FieldDiff[],
  statusFieldMapping?: Record<string, string>,
  bobRow?: Record<string, unknown>,
): DerivedFlagsResult => {
  const flags: ReviewFlag[] = [];
  const reasons: FlagReasons = {};

  // Status change: derived status differs from CRM. Suppress when both are
  // terminal-negative — diff.ts hides the diff in that case, so flagging it
  // here would leave a review item with nothing to review.
  if (
    derivedStatus &&
    currentCrmStatus &&
    derivedStatus !== currentCrmStatus &&
    !isNegativeToNegativeStatusChange(derivedStatus, currentCrmStatus)
  ) {
    flags.push('STATUS_CHANGE');
    reasons.STATUS_CHANGE = `${currentCrmStatus} → ${derivedStatus}`;
  }

  // Payment error
  if (derivedStatus?.startsWith('PAYMENT_ERROR')) {
    flags.push('PAYMENT_ERROR');
    reasons.PAYMENT_ERROR = `Status engine derived ${derivedStatus}`;
  }

  // Reinstatement: CRM says the policy is terminally over (CANCELED,
  // PAYMENT_ERROR_CANCELED, DECLINED, INCOMPLETE), BOB derives a non-terminal
  // (active) status. Every terminal→active transition gets the flag — it
  // blocks both batch approval and learned-rule auto-apply. Matching exact
  // 'CANCELED' only (the old check) let PAYMENT_ERROR_CANCELED→active
  // reinstatements bypass the human-review gate. Terminal→terminal moves
  // (e.g. CANCELED→PAYMENT_ERROR_CANCELED) are NOT reinstatements and no
  // longer flag — consistent with isNegativeToNegativeStatusChange
  // suppression in the diff engine and the STATUS_CHANGE flag above.
  if (
    currentCrmStatus &&
    NEGATIVE_TERMINAL_STATUSES.has(currentCrmStatus) &&
    derivedStatus &&
    !NEGATIVE_TERMINAL_STATUSES.has(derivedStatus)
  ) {
    flags.push('REINSTATEMENT');
    reasons.REINSTATEMENT = `CRM ${currentCrmStatus} → BOB ${derivedStatus}`;
  }

  // Jackie's rule: flag for audit when EITHER:
  //   1. Canceled, OR
  //   2. paidThroughDate > 1 day before brokerEffectiveDate
  // Only applies when brokerEffective > policyEffective (OMNIA came on
  // as broker after original enrollment — "dead before we started").
  // Single implementation in engines/status.ts (Phase 4.5) — also consumed
  // by the match job's unmatched branch, so flag and note text agree.
  if (bobRow && statusFieldMapping) {
    const audit = deriveBrokerEffAudit(
      buildBrokerEffAuditInput(bobRow, statusFieldMapping, derivedStatus),
    );

    if (audit.flagged) {
      flags.push('BROKER_EFF_AUDIT');
      reasons.BROKER_EFF_AUDIT = audit.reason;
    }
  }

  // Multi-match disambiguation
  if (matchMethod === 'POLICY_NUMBER_MULTI_BEST') {
    flags.push('MULTI_MATCH');
    reasons.MULTI_MATCH =
      'Multiple CRM policies share this policy number — picked best by weighted score';
  }

  // Multi-member subscriber mismatch — surfaced by the diff engine as a
  // synthetic INFO_ONLY diff (see detectMultiMemberSubscriberMismatch in
  // engines/diff.ts). The diff already suppresses lead identity updates;
  // we reuse the existing NAME_MISMATCH flag for visibility so reviewers
  // see something is off without needing a new enum value in the DB.
  const subscriberMismatchDiff = fieldDiffs.find(
    (d) => d.field === '__multiMemberSubscriberMismatch',
  );

  // Name mismatch: any name-related field diff present, OR a multi-member
  // subscriber-mismatch notice (where name diffs were suppressed).
  const nameDiffs = fieldDiffs.filter((d) => isNameLikeCrmField(d.crmField));

  if (nameDiffs.length > 0 || subscriberMismatchDiff) {
    flags.push('NAME_MISMATCH');

    if (subscriberMismatchDiff) {
      reasons.NAME_MISMATCH =
        subscriberMismatchDiff.note ??
        `BOB ${subscriberMismatchDiff.bobValue ?? '∅'} vs CRM ${
          subscriberMismatchDiff.crmValue ?? '∅'
        }`;
    } else {
      const first = nameDiffs[0];

      reasons.NAME_MISMATCH =
        nameDiffs.length === 1
          ? `${first.crmField}: "${first.crmValue ?? '∅'}" → "${first.bobValue ?? '∅'}"`
          : `${nameDiffs.length} name fields differ (e.g. ${first.crmField}: "${first.crmValue ?? '∅'}" → "${first.bobValue ?? '∅'}")`;
    }
  }

  return { flags, reasons };
};
