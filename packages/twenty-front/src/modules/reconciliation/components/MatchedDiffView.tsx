import { styled } from '@linaria/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button, LightIconButton } from 'twenty-ui/input';
import {
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

const StyledBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-left: ${themeCssVariables.spacing[4]};
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
      byBobHeader.get(d.field) ??
      byFieldKey.get(d.field) ??
      null;

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
  const columnMapping = useMemo<Record<string, ColumnMappingEntry> | null>(() => {
    if (!rawColumnMapping) return null;
    if (typeof rawColumnMapping === 'string') {
      try { return JSON.parse(rawColumnMapping); } catch { return null; }
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

  // Read policy record from store to get lead relation ID
  const policyRecord = useAtomFamilyStateValue(
    recordStoreFamilyState,
    policyId ?? '',
  );

  const leadId = policyRecord
    ? ((policyRecord as Record<string, unknown>).lead as Record<string, string> | null)?.id
    : undefined;

  // Build related violations to auto-expand relations with diffs
  const relatedViolations = useMemo<RelatedRecordViolation[]>(() => {
    if (!leadId) return [];

    const leadChanges = fieldDiffs.filter(
      (d) =>
        (d.crmObjectType === 'lead' || d.crmField?.startsWith('lead.')) &&
        d.bobValue !== null &&
        d.bobValue !== d.crmValue,
    );

    if (leadChanges.length === 0) return [];

    return [
      {
        relationFieldName: 'lead',
        relationLabel: 'Lead',
        relatedObjectNameSingular: 'person',
        relatedRecordId: leadId,
        violations: leadChanges.map((d) => ({
          fieldMetadataId: d.field,
          fieldLabel: d.label,
        })),
      },
    ];
  }, [fieldDiffs, leadId]);

  // Read lead record from store for batch composite merging
  const leadRecord = useAtomFamilyStateValue(
    recordStoreFamilyState,
    leadId ?? '',
  );

  // ── Decision actions ──
  const { updateOneRecord } = useUpdateOneRecord();

  const updateDecision = useCallback(
    async (decision: string) => {
      await updateOneRecord({
        objectNameSingular: 'reviewItem',
        idToUpdate: item.id,
        updateOneRecordInput: {
          decision,
          decidedAt: new Date().toISOString(),
        },
      });
      onDecisionMade?.(item.id);
    },
    [item.id, updateOneRecord, onDecisionMade],
  );

  const handleAcceptAll = useCallback(async () => {
    const policyUpdates: Record<string, unknown> = {};
    const leadUpdates: Record<string, unknown> = {};

    for (const diff of fieldDiffs) {
      if (
        !diff.crmField ||
        diff.bobValue === null ||
        diff.bobValue === diff.crmValue
      )
        continue;

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
        // Composite sub-field: merge into existing composite object
        const subField = parts[parts.length - 1];
        if (updates[fieldName] && typeof updates[fieldName] === 'object') {
          (updates[fieldName] as Record<string, unknown>)[subField] =
            diff.bobValue;
        } else {
          const currentComposite = sourceRecord
            ? (sourceRecord as Record<string, unknown>)[fieldName]
            : null;
          const existing =
            typeof currentComposite === 'object' && currentComposite !== null
              ? JSON.parse(JSON.stringify(currentComposite))
              : {};
          delete existing.__typename;
          existing[subField] = diff.bobValue;
          updates[fieldName] = existing;
        }
      } else {
        updates[fieldName] = diff.bobValue;
      }
    }

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

    await updateDecision('APPROVED');
  }, [
    fieldDiffs,
    policyId,
    leadId,
    policyRecord,
    leadRecord,
    updateOneRecord,
    updateDecision,
  ]);

  const handleReject = useCallback(
    () => updateDecision('REJECTED'),
    [updateDecision],
  );

  const handleFlag = useCallback(
    () => updateDecision('FLAG_AUDIT'),
    [updateDecision],
  );

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
      </StyledHeader>

      <StyledBody>
        {policyId && (
          <>
            <RecordShowEffect
              objectNameSingular="policy"
              recordId={policyId}
            />
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
          title="Accept all"
          variant="primary"
          accent="blue"
          size="small"
          Icon={IconCheck}
          onClick={handleAcceptAll}
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
          title="Flag for review"
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
