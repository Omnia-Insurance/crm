import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { LightIconButton } from 'twenty-ui/components/input';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconCopy,
  IconMessage,
  IconX,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { Tooltip } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

import { useTasks } from '@/activities/tasks/hooks/useTasks';
import { useLazyFindOneRecord } from '@/object-record/hooks/useLazyFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { RecordFieldList } from '@/object-record/record-field-list/components/RecordFieldList';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { RecordShowResourceLoader } from '@/object-record/record-show/components/RecordShowResourceLoader';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { ReconciliationRecordRelationsList } from '@/reconciliation/components/ReconciliationRecordRelationsList';
import { type ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { BATCH_APPLY_REVIEW_ITEMS } from '@/reconciliation/graphql/mutations/batchApproveReviewItems';
import { useOpenCreateAuditTaskDraft } from '@/reconciliation/hooks/useOpenCreateAuditTaskDraft';
import { useOpenReviewItemCommentsInSidePanel } from '@/reconciliation/hooks/useOpenReviewItemCommentsInSidePanel';
import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { normalizeDiffComparableValue } from '@/reconciliation/utils/normalizeDiffComparableValue';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { TooltipDelay } from '@/ui/layout/tooltip/constants/TooltipDelay';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { PageLayoutType } from '~/generated-metadata/graphql';

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

const MATCH_LABELS: Record<string, MessageDescriptor> = {
  POLICY_NUMBER_DATE_AGENT: msg`Strong match — policy #, date, and agent`,
  POLICY_NUMBER_PLUS_EFFECTIVE_DATE: msg`Strong match — policy # and date`,
  POLICY_NUMBER_PLUS_AGENT: msg`Good match — policy # and agent`,
  POLICY_NUMBER_SINGLE: msg`Good match — unique policy #`,
  POLICY_NUMBER_MULTI_BEST: msg`Possible match — best scored`,
  NPN_DATE_NAME: msg`Possible match — NPN, date, and name`,
  NAME_DOB_DATE: msg`Weak match — name, DOB, and date`,
  OVERRIDE: msg`Manual match`,
};

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

// INFO_ONLY diffs with no crmField (multi-member subscriber mismatch,
// cross-term namesake) have no inline cell to attach to, so they get a callout.
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
  const { t } = useLingui();
  const rawFieldDiffs = item.fieldDiffs as FieldDiff[];
  const policyId = item.policy?.id;

  const reconciliationRecord = useRecordStoreValue(reconciliationId);

  const rawColumnMapping = reconciliationRecord
    ? (reconciliationRecord as Record<string, unknown>)['columnMapping']
    : null;
  const columnMapping = useMemo<Record<
    string,
    ColumnMappingEntry
  > | null>(() => {
    if (!rawColumnMapping) {
      return null;
    }
    if (typeof rawColumnMapping === 'string') {
      try {
        return JSON.parse(rawColumnMapping);
      } catch {
        return null;
      }
    }
    return rawColumnMapping as Record<string, ColumnMappingEntry>;
  }, [rawColumnMapping]);

  // Server-stored diffs are authoritative (remediation 2.1): INFO_ONLY diffs are
  // never promoted to writes. The only enrichment shows statusChangeReason as the
  // note on the status field's inline diff.
  const fieldDiffs = useMemo(() => {
    if (!item.statusChangeReason) {
      return rawFieldDiffs;
    }
    return rawFieldDiffs.map((d) =>
      d.crmField === 'status' && !d.note
        ? { ...d, note: item.statusChangeReason }
        : d,
    );
  }, [rawFieldDiffs, item.statusChangeReason]);

  const reconciliationDiffsContextValue = useMemo(
    () => ({ fieldDiffs, columnMapping }),
    [fieldDiffs, columnMapping],
  );

  const matchLabelDescriptor = MATCH_LABELS[item.matchMethod];
  const matchLabel = isDefined(matchLabelDescriptor)
    ? t(matchLabelDescriptor)
    : item.matchMethod;
  const multiMatchReason = item.flagReasons?.MULTI_MATCH ?? null;
  const displayName = item.policy?.name ?? item.name;
  const policyNumber =
    item.name.split(' → ')[0] ?? item.name.split(' ')[0] ?? '';

  const informationalNotices = useMemo(
    () =>
      fieldDiffs.filter((d) => d.action === 'INFO_ONLY' && d.crmField === null),
    [fieldDiffs],
  );

  const policyRecord = useRecordStoreValue(policyId ?? '');

  const leadId = policyRecord
    ? (
        (policyRecord as Record<string, unknown>).lead as Record<
          string,
          string
        > | null
      )?.id
    : undefined;

  const leadRecord = useRecordStoreValue(leadId ?? '');

  // ONE WRITE PATH (remediation 2.1): Apply all / Undo all / Mark approved run
  // the server's batchApplyReviewItems mutation, which writes the diffs, the
  // cancel-previous-policy step and the decision under the fork's policy-write
  // RLS. Per-diff inline Accept/Undo stays client-side (single-field writes the
  // server has no granularity for); the later server APPLY is value-idempotent.
  const { updateOneRecord } = useUpdateOneRecord();
  const [batchApplyMutation] = useMutation(BATCH_APPLY_REVIEW_ITEMS);
  const { enqueueToast } = useToast();
  const store = useStore();
  // A double-click must not fire the server mutation twice.
  const [isDecisionActionInFlight, setIsDecisionActionInFlight] =
    useState(false);

  // Only for decisions with no server write path (Reject → SKIPPED, comment →
  // FLAG_AUDIT); the server mutation stamps APPLY/UNDO decisions itself.
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

  // Returns how many items the server updated: 0 means it skipped this one
  // (RLS refused the write or the item was not eligible).
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

  // The mutation returns counts, not records: refetch what the server wrote.
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

    // The server may have canceled (APPLY) or restored (UNDO) a previous policy
    // version. The guard mirrors the server's self-cancel refusal
    // (resolveCancelTargetPolicy), which owns the write.
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
        enqueueToast({
          status: 'error',
          children: t`The server did not apply this item — it may be outside your edit window or no longer pending.`,
        });

        return;
      }

      await refetchAffectedRecords();
      onDecisionMade?.(item.id);
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Apply all failed — no changes were saved.`,
      });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [
    syncReviewItemDecisionWithServer,
    refetchAffectedRecords,
    onDecisionMade,
    item.id,
    enqueueToast,
    t,
  ]);

  const handleUndoAll = useCallback(async () => {
    setIsDecisionActionInFlight(true);

    try {
      const updatedCount = await syncReviewItemDecisionWithServer('UNDO');

      if (updatedCount === 0) {
        enqueueToast({
          status: 'error',
          children: t`The server did not undo this item — it may be outside your edit window or not applied.`,
        });

        return;
      }

      await refetchAffectedRecords();
      onDecisionMade?.(item.id);
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Undo all failed — no changes were reverted.`,
      });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [
    syncReviewItemDecisionWithServer,
    refetchAffectedRecords,
    onDecisionMade,
    item.id,
    enqueueToast,
    t,
  ]);

  // Only flips the footer between Apply all / Undo all and offers Mark approved.
  // It must never trigger a mutation: record equality also holds for stale items
  // (two policies sharing a lead), so acting on it would APPLY from merely
  // viewing an item (remediation 2.2).
  const allDiffsAccepted = useMemo(() => {
    const actionable = fieldDiffs.filter(
      (d) => d.crmField !== null && d.bobValue !== d.crmValue,
    );

    if (actionable.length === 0) {
      return false;
    }

    return actionable.every((d) => {
      const isLead =
        d.crmObjectType === 'lead' ||
        (d.crmField !== null && d.crmField.startsWith('lead.'));
      const source = isLead ? leadRecord : policyRecord;

      if (!source) {
        return false;
      }

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

  // Explicit promotion once every diff was accepted inline: the primary button
  // has flipped to Undo all, so approving is its own click, never an effect.
  const handleMarkApproved = useCallback(async () => {
    setIsDecisionActionInFlight(true);

    try {
      const updatedCount = await syncReviewItemDecisionWithServer('APPLY');

      if (updatedCount === 0) {
        enqueueToast({
          status: 'error',
          children: t`The server did not approve this item — it may be outside your edit window or no longer pending.`,
        });

        return;
      }

      await refetchAffectedRecords();
      onDecisionMade?.(item.id);
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Failed to mark the review item approved.`,
      });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [
    syncReviewItemDecisionWithServer,
    refetchAffectedRecords,
    onDecisionMade,
    item.id,
    enqueueToast,
    t,
  ]);

  const handleReject = useCallback(async () => {
    setIsDecisionActionInFlight(true);

    try {
      await updateDecision('SKIPPED');
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Failed to reject the review item.`,
      });
    } finally {
      setIsDecisionActionInFlight(false);
    }
  }, [updateDecision, enqueueToast, t]);

  // With no comments yet the reviewer goes straight to a new audit task;
  // otherwise the side panel lists the existing ones.
  const { tasks: existingTasks } = useTasks({
    targetableObjects: [
      { id: item.id, targetObjectNameSingular: 'reviewItem' },
    ],
  });
  const commentCount = existingTasks.length;

  const { openCreateAuditTaskDraft } = useOpenCreateAuditTaskDraft({
    // Only PENDING items get flagged: an APPROVED item must keep its decision
    // or its applied writes lose batch-undo eligibility (remediation 2.3).
    onTaskCreated: async () => {
      if (item.decision !== 'PENDING') {
        return;
      }

      try {
        await updateDecision('FLAG_AUDIT');
      } catch {
        enqueueToast({
          status: 'error',
          children: t`Failed to flag the review item for audit.`,
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

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

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
              emphasis="subtle"
              size="sm"
              aria-label={t`Copy policy number`}
              onClick={handleCopyPolicyNumber}
            >
              {copied ? <IconCheck /> : <IconCopy />}
            </LightIconButton>
          </StyledPolicyBadge>
          <StyledSpacer />
          <Tooltip
            content={multiMatchReason}
            side="bottom"
            positionMethod="fixed"
            delay={TooltipDelay.shortDelay}
          >
            <StyledMatchLabel>
              <IconAlertTriangle size={14} />
              {matchLabel}
            </StyledMatchLabel>
          </Tooltip>
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
                    <strong>{t`CRM:`}</strong> {notice.crmValue}
                  </StyledInfoCalloutValue>
                )}
                {notice.bobValue && (
                  <StyledInfoCalloutValue>
                    <strong>{t`BOB:`}</strong> {notice.bobValue}
                  </StyledInfoCalloutValue>
                )}
              </StyledInfoCalloutValues>
            )}
          </StyledInfoCallout>
        ))}
        {policyId && (
          <>
            <RecordShowResourceLoader
              objectNameSingular="policy"
              recordId={policyId}
            />
            <ReconciliationDiffsContext.Provider
              value={reconciliationDiffsContextValue}
            >
              <LayoutRenderingProvider
                value={{
                  targetRecordIdentifier: {
                    id: policyId,
                    targetObjectNameSingular: 'policy',
                  },
                  layoutType: PageLayoutType.RECORD_PAGE,
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
                  />
                  <ReconciliationRecordRelationsList
                    objectNameSingular="policy"
                    objectRecordId={policyId}
                  />
                </RecordFieldsScopeContextProvider>
              </LayoutRenderingProvider>
            </ReconciliationDiffsContext.Provider>
          </>
        )}
      </StyledBody>

      <StyledFooter>
        <Button
          variant="solid"
          color={allDiffsAccepted ? 'danger' : 'accent'}
          size="sm"
          startIcon={allDiffsAccepted ? <IconArrowBackUp /> : <IconCheck />}
          onClick={allDiffsAccepted ? handleUndoAll : handleAcceptAll}
          disabled={isDecisionActionInFlight}
        >
          {allDiffsAccepted ? t`Undo all` : t`Apply all`}
        </Button>
        {allDiffsAccepted && item.decision === 'PENDING' && (
          <Button
            variant="solid"
            color="accent"
            size="sm"
            startIcon={<IconCheck />}
            onClick={handleMarkApproved}
            disabled={isDecisionActionInFlight}
          >
            {t`Mark approved`}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          startIcon={<IconX />}
          onClick={handleReject}
          disabled={isDecisionActionInFlight}
        >
          {t`Reject`}
        </Button>
        <StyledSpacer />
        <Button
          variant="ghost"
          size="sm"
          startIcon={<IconMessage />}
          onClick={handleCommentClick}
        >
          {commentCount > 0 ? t`Comments (${commentCount})` : t`Leave comment`}
        </Button>
      </StyledFooter>
    </StyledContainer>
  );
};
