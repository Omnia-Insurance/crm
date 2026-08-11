import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button, LightIconButton } from 'twenty-ui/input';
import {
  IconArrowBackUp,
  IconCheck,
  IconX,
  IconCopy,
  IconAlertTriangle,
  IconMessage,
} from 'twenty-ui/icon';
import { AppTooltip, TooltipDelay } from 'twenty-ui/surfaces';

import { RecordShowEffect } from '@/object-record/record-show/components/RecordShowEffect';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { DraftRelatedViolationsContext } from '@/object-record/record-field/ui/contexts/DraftRelatedViolationsContext';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { PageLayoutType } from '~/generated-metadata/graphql';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { type RelatedRecordViolation } from '@/object-record/record-field/ui/utils/getRelatedRecordViolations';
import { useLazyFindOneRecord } from '@/object-record/hooks/useLazyFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

import { useTasks } from '@/activities/tasks/hooks/useTasks';
import { RecordFieldList } from '@/object-record/record-field-list/components/RecordFieldList';
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { BATCH_APPLY_REVIEW_ITEMS } from '@/reconciliation/graphql/mutations/batchApproveReviewItems';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useOpenCreateAuditTaskDraft } from '@/reconciliation/hooks/useOpenCreateAuditTaskDraft';
import { useOpenReviewItemCommentsInSidePanel } from '@/reconciliation/hooks/useOpenReviewItemCommentsInSidePanel';
import type { FieldDiff } from '@/reconciliation/types/FieldDiff';
import type { ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';

type MatchedDiffViewProps = {
  item: ReviewItemRecord;
  reconciliationId: string;
  onDecisionMade?: (itemId: string) => void;
};

type ColumnMappingEntry = {
  crmField: string;
  fieldType: string;
  fieldKey: string;
};

const useRecordStoreValue = (recordId: string) => {
  const recordStore = useAtomFamilyStateValue(recordStoreFamilyState, recordId);

  return recordStore;
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

const normalizeDiffComparableValue = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledHeader = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledHeaderRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRecordName = styled.span`
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledPolicyBadge = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  height: 24px;
`;

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledMatchLabel = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};

  svg {
    color: ${themeCssVariables.color.orange};
  }
`;

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

const StyledFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

export const MatchedDiffView = ({
  item,
  reconciliationId,
  onDecisionMade,
}: MatchedDiffViewProps) => {
  const rawFieldDiffs = item.fieldDiffs as FieldDiff[];
  const policyId = item.policy?.id;

  // Read reconciliation record from store to get column mapping
  const reconciliationRecord = useRecordStoreValue(reconciliationId);

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

  // Server-stored diffs are authoritative (remediation 2.1). The former
  // enrichFieldDiffs crmField backfill + INFO_ONLY → UPDATE promotion was
  // deleted: the diff engine always stamps crmField on actionable diffs,
  // and INFO_ONLY means "never applied" on both sides — the server refuses
  // to write INFO_ONLY diffs and the client must never resurrect them. The
  // only remaining enrichment surfaces statusChangeReason as a tooltip on
  // the status field's inline diff so the explanation lives next to the
  // change instead of pinned to the header.
  const fieldDiffs = useMemo(() => {
    if (!item.statusChangeReason) return rawFieldDiffs;
    return rawFieldDiffs.map((d) =>
      d.crmField === 'status' && !d.note
        ? { ...d, note: item.statusChangeReason }
        : d,
    );
  }, [rawFieldDiffs, item.statusChangeReason]);

  const matchLabel = MATCH_LABELS[item.matchMethod] ?? item.matchMethod;
  const matchLabelId = `match-label-${item.id}`;
  const multiMatchReason = item.flagReasons?.MULTI_MATCH ?? null;
  const displayName = item.policy?.name ?? item.name;
  const policyNumber =
    item.name.split(' → ')[0] ?? item.name.split(' ')[0] ?? '';

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
  const policyRecord = useRecordStoreValue(policyId ?? '');

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
      if (!d.crmField || d.bobValue === d.crmValue) continue;
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
  const leadRecord = useRecordStoreValue(leadId ?? '');

  // ── Decision actions ──
  // ONE WRITE PATH (remediation 2.1): Apply all / Undo all / Mark approved
  // delegate every CRM record write to the server's batchApplyReviewItems
  // mutation — it applies/reverts the stored field diffs to the policy and
  // lead, executes + captures the cancel-previous-policy step, enforces the
  // fork's policy-write RLS, and flips the review item decision. The former
  // client-side updateOneRecord loop (a buildUpdatesForTarget mirror of the
  // server's) was deleted; after the mutation we refetch the affected
  // records so the UI reflects server truth (the mutation returns counts,
  // not payloads).
  //
  // DELIBERATE SPLIT — inline per-diff accept/undo chips stay client-side:
  // they live in RecordInlineCellContainer (single-field updateOneRecord
  // writes) and the server has no per-diff granularity — batchApply always
  // applies the whole item. They do not double-write: inline accepts never
  // call the server mutation, and the explicit "Mark approved" server APPLY
  // that follows them is value-idempotent (the record already equals BOB;
  // promotePrimary*ToAdditional no-ops on an equal primary).
  const { updateOneRecord } = useUpdateOneRecord();
  const [batchApplyMutation] = useMutation(BATCH_APPLY_REVIEW_ITEMS);
  const { enqueueErrorSnackBar } = useSnackBar();
  const store = useStore();
  // Disables the footer buttons while an APPLY/UNDO/decision write is in
  // flight so a double-click cannot fire the server mutation twice.
  const [isDecisionActionInFlight, setIsDecisionActionInFlight] =
    useState(false);

  // Client-side review-item decision write. Only for decisions with no
  // server-side write path (Reject → SKIPPED, comment → FLAG_AUDIT);
  // APPLY/UNDO decisions are stamped by the server mutation.
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

  // Runs the server-side apply/undo for this single item and returns how
  // many items the server actually updated (0 means it skipped this one —
  // e.g. the RLS check refused the write or the item was not eligible).
  const syncReviewItemDecisionWithServer = useCallback(
    async (action: 'APPLY' | 'UNDO'): Promise<number> => {
      const result = await batchApplyMutation({
        variables: {
          reconciliationId,
          action,
          reviewItemIds: [item.id],
        },
      });
      const status =
        (
          result.data as
            | { batchApplyReviewItems?: { status?: string | null } }
            | null
            | undefined
        )?.batchApplyReviewItems?.status ?? '';
      const updatedCount = Number(status.split('_').pop());

      return Number.isFinite(updatedCount) ? updatedCount : 0;
    },
    [batchApplyMutation, item.id, reconciliationId],
  );

  // After a server-side APPLY/UNDO, pull the affected records back
  // network-only and push them into the record store so the rendered field
  // values (and allDiffsAccepted) reflect what the server actually wrote.
  const { findOneRecord: refetchPolicyRecord } = useLazyFindOneRecord({
    objectNameSingular: 'policy',
    fetchPolicy: 'network-only',
  });
  const { findOneRecord: refetchPersonRecord } = useLazyFindOneRecord({
    objectNameSingular: 'person',
    fetchPolicy: 'network-only',
  });

  const refetchAffectedRecords = useCallback(async () => {
    const writeRecordToStore = (recordId: string) => (record: ObjectRecord) => {
      store.set(recordStoreFamilyState.atomFamily(recordId), record);
    };

    if (policyId) {
      await refetchPolicyRecord({
        objectRecordId: policyId,
        onCompleted: writeRecordToStore(policyId),
      });
    }

    if (leadId) {
      await refetchPersonRecord({
        objectRecordId: leadId,
        onCompleted: writeRecordToStore(leadId),
      });
    }

    // The server may also have canceled (APPLY) or restored (UNDO) a
    // previous policy version — refresh it so no stale cached copy
    // survives. The `cancelId && cancelId !== policyId` guard mirrors the
    // server's self-cancel refusal (resolveCancelTargetPolicy), which owns
    // the actual write.
    const snapshot = item.bobRowSnapshot as
      | (Record<string, unknown> & {
          __cancelPreviousPolicyId?: string;
        })
      | null;
    const cancelId = snapshot?.__cancelPreviousPolicyId;

    if (cancelId && cancelId !== policyId) {
      await refetchPolicyRecord({
        objectRecordId: cancelId,
        onCompleted: writeRecordToStore(cancelId),
      });
    }
  }, [
    item.bobRowSnapshot,
    leadId,
    policyId,
    refetchPolicyRecord,
    refetchPersonRecord,
    store,
  ]);

  const handleAcceptAll = useCallback(async () => {
    setIsDecisionActionInFlight(true);

    try {
      const updatedCount = await syncReviewItemDecisionWithServer('APPLY');

      if (updatedCount === 0) {
        enqueueErrorSnackBar({
          message:
            'The server did not apply this item — it may be outside your edit window or no longer pending.',
        });

        return;
      }

      await refetchAffectedRecords();
      onDecisionMade?.(item.id);
    } catch {
      enqueueErrorSnackBar({
        message: 'Apply all failed — no changes were saved.',
      });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [
    syncReviewItemDecisionWithServer,
    refetchAffectedRecords,
    onDecisionMade,
    item.id,
    enqueueErrorSnackBar,
  ]);

  const handleUndoAll = useCallback(async () => {
    setIsDecisionActionInFlight(true);

    try {
      const updatedCount = await syncReviewItemDecisionWithServer('UNDO');

      if (updatedCount === 0) {
        enqueueErrorSnackBar({
          message:
            'The server did not undo this item — it may be outside your edit window or not applied.',
        });

        return;
      }

      await refetchAffectedRecords();
      onDecisionMade?.(item.id);
    } catch {
      enqueueErrorSnackBar({
        message: 'Undo all failed — no changes were reverted.',
      });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [
    syncReviewItemDecisionWithServer,
    refetchAffectedRecords,
    onDecisionMade,
    item.id,
    enqueueErrorSnackBar,
  ]);

  // True when every actionable diff currently matches its proposed BOB value
  // — meaning the user (or a prior Accept all) has already written all
  // changes. Used ONLY to flip the bottom button between "Apply all" /
  // "Undo all" and to offer the explicit "Mark approved" promotion below.
  // It must never trigger a mutation by itself: record-value equality is
  // also true for stale items (e.g. two policies sharing a lead, or a
  // policy edited between match and review), so acting on it would fire a
  // server APPLY — with its rule-learning cascade — from merely viewing
  // an item (reconciliation remediation item 2.2).
  const allDiffsAccepted = useMemo(() => {
    const actionable = fieldDiffs.filter(
      (d) => d.crmField !== null && d.bobValue !== d.crmValue,
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
          value = undefined;
          break;
        }
      }

      return normalizeDiffComparableValue(value) === d.bobValue;
    });
  }, [fieldDiffs, leadRecord, policyRecord]);

  // Explicit promotion for the inline-accept path: when the user has
  // accepted every diff one by one (or the record already matches BOB),
  // the primary button has flipped to "Undo all", so we surface a separate
  // "Mark approved" button instead of auto-promoting from a useEffect.
  // The server APPLY stamps the APPROVED decision and (value-idempotently)
  // re-writes the already-accepted values; the records are then refetched
  // so the UI shows server truth. Failures surface once via snackbar and
  // stop — no retry loop.
  const handleMarkApproved = useCallback(async () => {
    setIsDecisionActionInFlight(true);

    try {
      const updatedCount = await syncReviewItemDecisionWithServer('APPLY');

      if (updatedCount === 0) {
        enqueueErrorSnackBar({
          message:
            'The server did not approve this item — it may be outside your edit window or no longer pending.',
        });

        return;
      }

      await refetchAffectedRecords();
      onDecisionMade?.(item.id);
    } catch {
      enqueueErrorSnackBar({
        message: 'Failed to mark the review item approved.',
      });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [
    syncReviewItemDecisionWithServer,
    refetchAffectedRecords,
    onDecisionMade,
    item.id,
    enqueueErrorSnackBar,
  ]);

  const handleReject = useCallback(async () => {
    setIsDecisionActionInFlight(true);

    try {
      await updateDecision('SKIPPED');
    } catch {
      enqueueErrorSnackBar({ message: 'Failed to reject the review item.' });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [updateDecision, enqueueErrorSnackBar]);

  // ── Leave comment ──
  // Routes to one of two flows depending on whether comments exist:
  //   * 0 tasks: open the new audit-task draft side panel directly (no
  //     point in showing an empty list).
  //   * ≥1 tasks: open the SidePanelReviewItemCommentsPage with the
  //     stacked-card list + filters; the user can add a new one from there.
  const { tasks: existingTasks } = useTasks({
    targetableObjects: [
      { id: item.id, targetObjectNameSingular: 'reviewItem' },
    ],
  });
  const commentCount = existingTasks.length;

  const { openCreateAuditTaskDraft } = useOpenCreateAuditTaskDraft({
    // Only flag PENDING items: commenting on an APPROVED item must not
    // clobber the decision, or the applied CRM writes lose batch-undo
    // eligibility (both client and server undo select decision ===
    // 'APPROVED') — reconciliation remediation item 2.3.
    onTaskCreated: async () => {
      if (item.decision !== 'PENDING') {
        return;
      }

      try {
        await updateDecision('FLAG_AUDIT');
      } catch {
        enqueueErrorSnackBar({
          message: 'Failed to flag the review item for audit.',
        });
      }
    },
  });
  const { openReviewItemCommentsInSidePanel } =
    useOpenReviewItemCommentsInSidePanel();

  const handleCommentClick = useCallback(() => {
    if (commentCount === 0) {
      openCreateAuditTaskDraft({ reviewItemId: item.id });
    } else {
      openReviewItemCommentsInSidePanel(item.id);
    }
  }, [
    commentCount,
    openCreateAuditTaskDraft,
    openReviewItemCommentsInSidePanel,
    item.id,
  ]);

  // ── Copy policy number ──
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const copyTimerId = setTimeout(() => setCopied(false), 1500);

    return () => clearTimeout(copyTimerId);
  }, [copied]);

  const handleCopyPolicyNumber = useCallback(() => {
    navigator.clipboard.writeText(policyNumber);
    setCopied(true);
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
          <StyledMatchLabel id={matchLabelId}>
            <IconAlertTriangle size={14} />
            {matchLabel}
          </StyledMatchLabel>
          {multiMatchReason && (
            <AppTooltip
              anchorSelect={`#${matchLabelId}`}
              content={multiMatchReason}
              clickable
              noArrow
              place="bottom"
              positionStrategy="fixed"
              delay={TooltipDelay.shortDelay}
            />
          )}
        </StyledHeaderRow>
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

      <StyledFooter>
        <Button
          title={allDiffsAccepted ? 'Undo all' : 'Apply all'}
          variant="primary"
          accent={allDiffsAccepted ? 'danger' : 'blue'}
          size="small"
          Icon={allDiffsAccepted ? IconArrowBackUp : IconCheck}
          onClick={allDiffsAccepted ? handleUndoAll : handleAcceptAll}
          disabled={isDecisionActionInFlight}
        />
        {allDiffsAccepted && item.decision === 'PENDING' && (
          <Button
            title="Mark approved"
            variant="primary"
            accent="blue"
            size="small"
            Icon={IconCheck}
            onClick={handleMarkApproved}
            disabled={isDecisionActionInFlight}
          />
        )}
        <Button
          title="Reject"
          variant="secondary"
          accent="default"
          size="small"
          Icon={IconX}
          onClick={handleReject}
          disabled={isDecisionActionInFlight}
        />
        <StyledSpacer />
        <Button
          title={
            commentCount > 0 ? `Comments (${commentCount})` : 'Leave comment'
          }
          variant="tertiary"
          accent="default"
          size="small"
          Icon={IconMessage}
          onClick={handleCommentClick}
        />
      </StyledFooter>
    </StyledContainer>
  );
};
