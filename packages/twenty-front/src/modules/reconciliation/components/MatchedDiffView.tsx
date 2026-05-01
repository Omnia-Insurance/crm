import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button, LightIconButton } from 'twenty-ui/input';
import {
  IconArrowBackUp,
  IconCheck,
  IconX,
  IconFlag,
  IconCopy,
  IconAlertTriangle,
} from 'twenty-ui/display';

import { RecordShowEffect } from '@/object-record/record-show/components/RecordShowEffect';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { DraftRelatedViolationsContext } from '@/object-record/record-field/ui/contexts/DraftRelatedViolationsContext';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { PageLayoutType } from '~/generated-metadata/graphql';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { type RelatedRecordViolation } from '@/object-record/record-field/ui/utils/getRelatedRecordViolations';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';

import { RecordFieldList } from '@/object-record/record-field-list/components/RecordFieldList';
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import type { FieldDiff } from '@/reconciliation/types/FieldDiff';
import type { ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';
import { TextArea } from '@/ui/input/components/TextArea';
import { type EmailsMetadata, type PhonesMetadata } from 'twenty-shared/types';
import {
  promotePrimaryEmailToAdditional,
  promotePrimaryPhoneToAdditional,
} from 'twenty-shared/utils';

type Props = {
  item: ReviewItemRecord;
  reconciliationId: string;
  onDecisionMade?: (itemId: string) => void;
};

type ColumnMappingEntry = {
  crmField: string;
  fieldType: string;
  fieldKey: string;
};

const MATCH_LABELS: Record<string, string> = {
  POLICY_NUMBER_DATE_AGENT: 'Strong match — policy #, date, and agent',
  POLICY_NUMBER_PLUS_EFFECTIVE_DATE: 'Strong match — policy # and date',
  POLICY_NUMBER_PLUS_AGENT: 'Good match — policy # and agent',
  POLICY_NUMBER_SINGLE: 'Good match — unique policy #',
  POLICY_NUMBER_MULTI_BEST: 'Possible match — best scored',
  NPN_DATE_NAME: 'Possible match — NPN, date, and name',
  NAME_DOB_DATE: 'Weak match — name, DOB, and date',
  OVERRIDE: 'Manual match',
};

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledHeader = styled.div`
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
`;

const StyledHeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRecordName = styled.span`
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledPolicyBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[1]};
  padding: 0 ${themeCssVariables.spacing[2]};
  height: 24px;
  border-radius: ${themeCssVariables.border.radius.sm};
  background: ${themeCssVariables.background.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  color: ${themeCssVariables.font.color.secondary};
  font-variant-numeric: tabular-nums;
`;

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledMatchLabel = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[1]};
  font-size: ${themeCssVariables.font.size.sm};
  color: ${themeCssVariables.font.color.tertiary};

  svg {
    color: ${themeCssVariables.color.orange};
  }
`;

const StyledStatusNote = styled.div`
  margin-top: ${themeCssVariables.spacing[2]};
  font-size: ${themeCssVariables.font.size.sm};
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledFlagReasons = styled.ul`
  margin: ${themeCssVariables.spacing[2]} 0 0;
  padding: 0;
  list-style: none;
  font-size: ${themeCssVariables.font.size.sm};
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledFlagReason = styled.li`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledFlagLabel = styled.span`
  font-weight: ${themeCssVariables.font.weight.medium};
  color: ${themeCssVariables.font.color.primary};
  white-space: nowrap;
`;

// Surfaced inline next to the status-change note. STATUS_CHANGE is already
// rendered via statusChangeReason above, so skip it here to avoid duplication.
const FLAG_LABELS_FOR_REASONS: Record<string, string> = {
  PAYMENT_ERROR: 'Payment error',
  REINSTATEMENT: 'Reinstatement',
  BROKER_EFF_AUDIT: 'Broker date',
  MULTI_MATCH: 'Multi match',
  NAME_MISMATCH: 'Name mismatch',
};

const StyledBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-left: ${themeCssVariables.spacing[4]};
`;

// Callout for synthetic INFO_ONLY diffs (e.g., multi-member subscriber
// mismatch, cross-term namesake) — these have no inline field to attach
// to but still need to be visible. Without this, the only visible signal
// is the small flag reason in the header, and the body looks like an
// unchanged record despite the NAME_MISMATCH chip.
const StyledInfoCallout = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-left: 3px solid ${themeCssVariables.color.yellow};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  margin: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]}
    ${themeCssVariables.spacing[2]} 0;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[3]};
`;

const StyledInfoCalloutHeader = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  gap: ${themeCssVariables.spacing[1]};

  svg {
    color: ${themeCssVariables.color.yellow};
  }
`;

const StyledInfoCalloutBody = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
`;

const StyledInfoCalloutValues = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledInfoCalloutValue = styled.span`
  font-variant-numeric: tabular-nums;

  strong {
    color: ${themeCssVariables.font.color.secondary};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

// Inline prompt that appears above the footer when the user clicks
// "Flag for review". A note is optional but encouraged so reviewers
// capture WHY a row needs research.
const StyledFlagPrompt = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledFlagPromptActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

// Surfaces an existing note on a previously-flagged row so reviewers
// can see why it was flagged without opening the prompt.
const StyledFlagNote = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-left: 3px solid ${themeCssVariables.color.orange};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: ${themeCssVariables.spacing[2]} 0 0;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledFooter = styled.div`
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  flex-shrink: 0;
`;

/**
 * Enrich fieldDiffs with proper crmField values using the reconciliation's
 * column mapping (BOB headers → CRM field paths).
 */
const enrichFieldDiffs = (
  diffs: FieldDiff[],
  columnMapping: Record<string, ColumnMappingEntry> | null,
): FieldDiff[] => {
  if (!columnMapping) return diffs;

  // Column mapping is keyed by BOB header name (e.g., "member_email")
  // Each entry has crmField (e.g., "lead.emails.primaryEmail") and fieldKey
  const byBobHeader = new Map<string, string>();
  const byFieldKey = new Map<string, string>();
  Object.entries(columnMapping).forEach(([header, entry]) => {
    byBobHeader.set(header, entry.crmField);
    byFieldKey.set(entry.fieldKey, entry.crmField);
  });

  return diffs.map((d) => {
    if (d.crmField) return d;

    // fieldDiff.field is the BOB column key — look it up as a header
    const resolved =
      byBobHeader.get(d.field) ?? byFieldKey.get(d.field) ?? null;

    if (resolved) {
      return {
        ...d,
        crmField: resolved,
        crmObjectType: resolved.startsWith('lead.') ? 'lead' : 'policy',
        action: d.action === 'INFO_ONLY' ? 'UPDATE' : d.action,
      };
    }
    return d;
  });
};

export const MatchedDiffView = ({
  item,
  reconciliationId,
  onDecisionMade,
}: Props) => {
  const rawFieldDiffs = item.fieldDiffs as FieldDiff[];
  const policyId = item.policy?.id;

  // Read reconciliation record from store to get column mapping
  const reconciliationRecord = useAtomFamilyStateValue(
    recordStoreFamilyState,
    reconciliationId,
  );

  const rawColumnMapping = reconciliationRecord
    ? (reconciliationRecord as Record<string, unknown>)['columnMapping']
    : null;
  const columnMapping = useMemo<Record<
    string,
    ColumnMappingEntry
  > | null>(() => {
    if (!rawColumnMapping) return null;
    if (typeof rawColumnMapping === 'string') {
      try {
        return JSON.parse(rawColumnMapping);
      } catch {
        return null;
      }
    }
    return rawColumnMapping as Record<string, ColumnMappingEntry>;
  }, [rawColumnMapping]);

  // Enrich fieldDiffs with proper crmField from column mapping
  const fieldDiffs = useMemo(
    () => enrichFieldDiffs(rawFieldDiffs, columnMapping),
    [rawFieldDiffs, columnMapping],
  );

  const matchLabel = MATCH_LABELS[item.matchMethod] ?? item.matchMethod;
  const displayName = item.policy?.name ?? item.name;
  const policyNumber =
    item.name.split(' → ')[0] ?? item.name.split(' ')[0] ?? '';

  const hasStatusChange = fieldDiffs.some(
    (d) =>
      d.action === 'COMPUTED' &&
      d.bobValue !== null &&
      d.bobValue !== d.crmValue,
  );

  // Synthetic informational diffs from the server (e.g., multi-member
  // subscriber mismatch, cross-term namesake). They have no actionable
  // crmField — the apply step skips them. We render them as a banner
  // because the inline RecordFieldList has no field to attach them to,
  // and the header flag-reason is too subtle for cases where the body
  // shows an apparently unchanged record.
  const informationalNotices = useMemo(
    () =>
      fieldDiffs.filter((d) => d.action === 'INFO_ONLY' && d.crmField === null),
    [fieldDiffs],
  );

  // Read policy record from store to get lead relation ID
  const policyRecord = useAtomFamilyStateValue(
    recordStoreFamilyState,
    policyId ?? '',
  );

  const leadId = policyRecord
    ? (
        (policyRecord as Record<string, unknown>).lead as Record<
          string,
          string
        > | null
      )?.id
    : undefined;

  // Build related violations to auto-expand any relation with diffs.
  // Group diffs by their relation prefix (lead./agent./carrier./product./...)
  // and resolve each to its record id from the policy record.
  const relatedViolations = useMemo<RelatedRecordViolation[]>(() => {
    if (!policyRecord) return [];

    const groups = new Map<string, FieldDiff[]>();
    for (const d of fieldDiffs) {
      if (!d.crmField || d.bobValue === null || d.bobValue === d.crmValue)
        continue;
      const dot = d.crmField.indexOf('.');
      if (dot <= 0) continue;
      const relName = d.crmField.slice(0, dot);
      if (!groups.has(relName)) groups.set(relName, []);
      groups.get(relName)!.push(d);
    }

    const violations: RelatedRecordViolation[] = [];
    for (const [relName, diffs] of groups) {
      const relValue = (policyRecord as Record<string, unknown>)[relName];
      const relRecord =
        relValue && typeof relValue === 'object'
          ? (relValue as Record<string, unknown>)
          : null;
      const relId = relRecord?.id;
      if (typeof relId !== 'string') continue;

      // Lead is special-cased to use 'person' (the underlying object).
      // Other relations use their own field name as the object singular.
      const objectNameSingular = relName === 'lead' ? 'person' : relName;

      violations.push({
        relationFieldName: relName,
        relationLabel: relName.charAt(0).toUpperCase() + relName.slice(1),
        relatedObjectNameSingular: objectNameSingular,
        relatedRecordId: relId,
        violations: diffs.map((d) => ({
          fieldMetadataId: d.field,
          fieldLabel: d.label,
        })),
      });
    }

    return violations;
  }, [fieldDiffs, policyRecord]);

  // Read lead record from store for batch composite merging
  const leadRecord = useAtomFamilyStateValue(
    recordStoreFamilyState,
    leadId ?? '',
  );

  // ── Decision actions ──
  const { updateOneRecord } = useUpdateOneRecord();

  const updateDecision = useCallback(
    async (decision: string, note?: string | null) => {
      const updateInput: Record<string, unknown> = {
        decision,
        decidedAt: new Date().toISOString(),
      };

      if (note !== undefined) {
        updateInput.note = note ?? '';
      }

      await updateOneRecord({
        objectNameSingular: 'reviewItem',
        idToUpdate: item.id,
        updateOneRecordInput: updateInput,
      });
      onDecisionMade?.(item.id);
    },
    [item.id, updateOneRecord, onDecisionMade],
  );

  /**
   * Build the policy + lead update payloads needed to write either side of
   * each diff. `target = 'bob'` writes the BOB-proposed values (Accept all);
   * `target = 'crm'` writes the original CRM values (Undo all).
   */
  const buildUpdatesForTarget = useCallback(
    (target: 'bob' | 'crm') => {
      const policyUpdates: Record<string, unknown> = {};
      const leadUpdates: Record<string, unknown> = {};

      for (const diff of fieldDiffs) {
        if (
          !diff.crmField ||
          diff.bobValue === null ||
          diff.bobValue === diff.crmValue
        )
          continue;

        const targetValue = target === 'bob' ? diff.bobValue : diff.crmValue;

        if (targetValue === null) continue;

        const isLeadField =
          diff.crmObjectType === 'lead' || diff.crmField.startsWith('lead.');
        const crmPath = isLeadField
          ? diff.crmField.replace(/^lead\./, '')
          : diff.crmField;
        const parts = crmPath.split('.');
        const fieldName = parts[0];
        const updates = isLeadField ? leadUpdates : policyUpdates;
        const sourceRecord = isLeadField ? leadRecord : policyRecord;

        if (parts.length >= 2) {
          // Composite sub-field: merge into existing composite object.
          // For phones.primaryPhoneNumber and emails.primaryEmail on Accept
          // we also promote the previous primary into additional* (see helper).
          const subField = parts[parts.length - 1];

          // Seed the in-progress composite from prior in-loop writes if any,
          // otherwise from the live record store. JSON deep clone strips
          // __typename and detaches from the read-only record store.
          const seed: Record<string, unknown> =
            updates[fieldName] && typeof updates[fieldName] === 'object'
              ? (updates[fieldName] as Record<string, unknown>)
              : (() => {
                  const currentComposite = sourceRecord
                    ? (sourceRecord as Record<string, unknown>)[fieldName]
                    : null;
                  const cloned: Record<string, unknown> =
                    typeof currentComposite === 'object' &&
                    currentComposite !== null
                      ? JSON.parse(JSON.stringify(currentComposite))
                      : {};
                  delete cloned.__typename;
                  return cloned;
                })();

          const valueStr = String(targetValue);

          if (
            target === 'bob' &&
            fieldName === 'phones' &&
            subField === 'primaryPhoneNumber'
          ) {
            updates[fieldName] = promotePrimaryPhoneToAdditional(
              seed as PhonesMetadata,
              valueStr,
            );
          } else if (
            target === 'bob' &&
            fieldName === 'emails' &&
            subField === 'primaryEmail'
          ) {
            updates[fieldName] = promotePrimaryEmailToAdditional(
              seed as EmailsMetadata,
              valueStr,
            );
          } else {
            // Undo path: just swap the sub-field back; leave additional* alone
            // (perfect reversal would require pre-accept snapshot we don't keep).
            seed[subField] = targetValue;
            updates[fieldName] = seed;
          }
        } else {
          updates[fieldName] = targetValue;
        }
      }

      return { policyUpdates, leadUpdates };
    },
    [fieldDiffs, leadRecord, policyRecord],
  );

  const handleAcceptAll = useCallback(async () => {
    const { policyUpdates, leadUpdates } = buildUpdatesForTarget('bob');

    if (Object.keys(policyUpdates).length > 0 && policyId) {
      await updateOneRecord({
        objectNameSingular: 'policy',
        idToUpdate: policyId,
        updateOneRecordInput: policyUpdates,
      });
    }
    if (Object.keys(leadUpdates).length > 0 && leadId) {
      await updateOneRecord({
        objectNameSingular: 'person',
        idToUpdate: leadId,
        updateOneRecordInput: leadUpdates,
      });
    }

    // Cancel previous policy version if the matcher flagged one
    // (Section 4.3 — older effective date than the kept BOB row)
    const snapshot = item.bobRowSnapshot as
      | (Record<string, unknown> & {
          __cancelPreviousPolicyId?: string;
          __cancelExpireDate?: string | null;
        })
      | null;
    const cancelId = snapshot?.__cancelPreviousPolicyId;

    if (cancelId) {
      await updateOneRecord({
        objectNameSingular: 'policy',
        idToUpdate: cancelId,
        updateOneRecordInput: {
          status: 'CANCELED',
          expirationDate: snapshot?.__cancelExpireDate ?? null,
        },
      });
    }

    await updateDecision('APPROVED');
  }, [
    buildUpdatesForTarget,
    policyId,
    leadId,
    item.bobRowSnapshot,
    updateOneRecord,
    updateDecision,
  ]);

  const handleUndoAll = useCallback(async () => {
    const { policyUpdates, leadUpdates } = buildUpdatesForTarget('crm');

    if (Object.keys(policyUpdates).length > 0 && policyId) {
      await updateOneRecord({
        objectNameSingular: 'policy',
        idToUpdate: policyId,
        updateOneRecordInput: policyUpdates,
      });
    }
    if (Object.keys(leadUpdates).length > 0 && leadId) {
      await updateOneRecord({
        objectNameSingular: 'person',
        idToUpdate: leadId,
        updateOneRecordInput: leadUpdates,
      });
    }

    // Note: cancel-previous-policy is NOT reversed here — we don't snapshot
    // the previous policy's pre-cancel status/expiration, so we can't restore
    // it precisely. If the user wants that undone they must do it manually.

    await updateDecision('PENDING');
  }, [
    buildUpdatesForTarget,
    policyId,
    leadId,
    updateOneRecord,
    updateDecision,
  ]);

  // True when every actionable diff currently matches its proposed BOB value
  // — meaning the user (or a prior Accept all) has already written all
  // changes. Used to flip the bottom button between "Accept all" / "Undo all".
  const allDiffsAccepted = useMemo(() => {
    const actionable = fieldDiffs.filter(
      (d) =>
        d.crmField !== null && d.bobValue !== null && d.bobValue !== d.crmValue,
    );

    if (actionable.length === 0) return false;

    return actionable.every((d) => {
      const isLead =
        d.crmObjectType === 'lead' ||
        (d.crmField !== null && d.crmField.startsWith('lead.'));
      const source = isLead ? leadRecord : policyRecord;

      if (!source) return false;

      const path =
        isLead && d.crmField !== null
          ? d.crmField.replace(/^lead\./, '')
          : (d.crmField as string);

      let value: unknown = source;

      for (const part of path.split('.')) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[part];
        } else {
          return false;
        }
      }

      return value != null && String(value) === d.bobValue;
    });
  }, [fieldDiffs, leadRecord, policyRecord]);

  // Promote PENDING → APPROVED when the record's live values reach the
  // all-accepted state — covers users who only do inline accepts and never
  // click the bottom "Accept all" button. Keeps the sidebar fade signal in
  // sync with the actual record state. (Demotion stays explicit: handled by
  // the Undo all / Reject buttons.)
  useEffect(() => {
    if (allDiffsAccepted && item.decision === 'PENDING') {
      void updateDecision('APPROVED');
    }
  }, [allDiffsAccepted, item.decision, updateDecision]);

  const handleReject = useCallback(
    () => updateDecision('SKIPPED'),
    [updateDecision],
  );

  // Flag for review: open the note prompt instead of flagging immediately
  // so reviewers can capture WHY they're flagging. Pre-fills with the
  // current note when re-flagging an already-flagged row.
  const [isFlagPromptOpen, setIsFlagPromptOpen] = useState(false);
  const [flagNoteDraft, setFlagNoteDraft] = useState('');

  const handleFlag = useCallback(() => {
    setFlagNoteDraft(item.note ?? '');
    setIsFlagPromptOpen(true);
  }, [item.note]);

  const handleSubmitFlag = useCallback(async () => {
    const trimmed = flagNoteDraft.trim();

    await updateDecision('FLAG_AUDIT', trimmed.length > 0 ? trimmed : null);
    setIsFlagPromptOpen(false);
  }, [updateDecision, flagNoteDraft]);

  const handleCancelFlag = useCallback(() => {
    setIsFlagPromptOpen(false);
  }, []);

  // ── Copy policy number ──
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleCopyPolicyNumber = useCallback(() => {
    navigator.clipboard.writeText(policyNumber);
    setCopied(true);
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [policyNumber]);

  return (
    <StyledContainer>
      <StyledHeader>
        <StyledHeaderRow>
          <StyledRecordName>{displayName}</StyledRecordName>
          <StyledPolicyBadge>
            {policyNumber}
            <LightIconButton
              Icon={copied ? IconCheck : IconCopy}
              size="small"
              accent="tertiary"
              onClick={handleCopyPolicyNumber}
            />
          </StyledPolicyBadge>
          <StyledSpacer />
          <StyledMatchLabel>
            <IconAlertTriangle size={14} />
            {matchLabel}
          </StyledMatchLabel>
        </StyledHeaderRow>
        {hasStatusChange && item.statusChangeReason && (
          <StyledStatusNote>
            {item.currentCrmStatus} → {item.derivedStatus}
            {' — '}
            {item.statusChangeReason}
          </StyledStatusNote>
        )}
        {item.decision === 'FLAG_AUDIT' && item.note && !isFlagPromptOpen && (
          <StyledFlagNote>
            <strong>Reviewer note:</strong> {item.note}
          </StyledFlagNote>
        )}
        {item.flagReasons &&
          (item.flags ?? []).some(
            (flag) =>
              flag !== 'STATUS_CHANGE' &&
              FLAG_LABELS_FOR_REASONS[flag] &&
              item.flagReasons?.[flag],
          ) && (
            <StyledFlagReasons>
              {(item.flags ?? [])
                .filter(
                  (flag) =>
                    flag !== 'STATUS_CHANGE' &&
                    FLAG_LABELS_FOR_REASONS[flag] &&
                    item.flagReasons?.[flag],
                )
                .map((flag) => (
                  <StyledFlagReason key={flag}>
                    <StyledFlagLabel>
                      {FLAG_LABELS_FOR_REASONS[flag]}:
                    </StyledFlagLabel>
                    <span>{item.flagReasons?.[flag]}</span>
                  </StyledFlagReason>
                ))}
            </StyledFlagReasons>
          )}
      </StyledHeader>

      <StyledBody>
        {informationalNotices.map((notice) => (
          <StyledInfoCallout key={notice.field}>
            <StyledInfoCalloutHeader>
              <IconAlertTriangle size={14} />
              {notice.label}
            </StyledInfoCalloutHeader>
            {notice.note && (
              <StyledInfoCalloutBody>{notice.note}</StyledInfoCalloutBody>
            )}
            {(notice.bobValue || notice.crmValue) && (
              <StyledInfoCalloutValues>
                {notice.crmValue && (
                  <StyledInfoCalloutValue>
                    <strong>CRM:</strong> {notice.crmValue}
                  </StyledInfoCalloutValue>
                )}
                {notice.bobValue && (
                  <StyledInfoCalloutValue>
                    <strong>BOB:</strong> {notice.bobValue}
                  </StyledInfoCalloutValue>
                )}
              </StyledInfoCalloutValues>
            )}
          </StyledInfoCallout>
        ))}
        {policyId && (
          <>
            <RecordShowEffect objectNameSingular="policy" recordId={policyId} />
            <ReconciliationDiffsContext.Provider
              value={{ fieldDiffs, columnMapping }}
            >
              <DraftRelatedViolationsContext.Provider value={relatedViolations}>
                <LayoutRenderingProvider
                  value={{
                    targetRecordIdentifier: {
                      id: policyId,
                      targetObjectNameSingular: 'policy',
                    },
                    layoutType: PageLayoutType.RECORD_PAGE,
                    isInSidePanel: false,
                  }}
                >
                  <RecordFieldsScopeContextProvider
                    value={{
                      scopeInstanceId: `recon-policy-${policyId}`,
                    }}
                  >
                    <RecordFieldList
                      instanceId={`recon-policy-${policyId}`}
                      objectNameSingular="policy"
                      objectRecordId={policyId}
                      fieldDiffs={fieldDiffs}
                      showRelationSections
                    />
                  </RecordFieldsScopeContextProvider>
                </LayoutRenderingProvider>
              </DraftRelatedViolationsContext.Provider>
            </ReconciliationDiffsContext.Provider>
          </>
        )}
      </StyledBody>

      {isFlagPromptOpen && (
        <StyledFlagPrompt>
          <TextArea
            textAreaId={`flag-note-${item.id}`}
            label="Reviewer note (optional)"
            value={flagNoteDraft}
            onChange={setFlagNoteDraft}
            placeholder="What needs research on this row?"
            minRows={2}
            maxRows={5}
          />
          <StyledFlagPromptActions>
            <Button
              title="Cancel"
              variant="secondary"
              accent="default"
              size="small"
              onClick={handleCancelFlag}
            />
            <Button
              title={
                item.decision === 'FLAG_AUDIT' ? 'Update flag' : 'Save flag'
              }
              variant="primary"
              accent="blue"
              size="small"
              Icon={IconFlag}
              onClick={handleSubmitFlag}
            />
          </StyledFlagPromptActions>
        </StyledFlagPrompt>
      )}

      <StyledFooter>
        <Button
          title={allDiffsAccepted ? 'Undo all' : 'Accept all'}
          variant="primary"
          accent={allDiffsAccepted ? 'danger' : 'blue'}
          size="small"
          Icon={allDiffsAccepted ? IconArrowBackUp : IconCheck}
          onClick={allDiffsAccepted ? handleUndoAll : handleAcceptAll}
        />
        <Button
          title="Reject"
          variant="secondary"
          accent="default"
          size="small"
          Icon={IconX}
          onClick={handleReject}
        />
        <StyledSpacer />
        <Button
          title={
            item.decision === 'FLAG_AUDIT'
              ? 'Edit flag note'
              : 'Flag for review'
          }
          variant="tertiary"
          accent="default"
          size="small"
          Icon={IconFlag}
          onClick={handleFlag}
        />
      </StyledFooter>
    </StyledContainer>
  );
};
