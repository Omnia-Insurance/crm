import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'jotai';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button } from 'twenty-ui/input';
import { IconPlus, IconX, IconFlag, IconLoader } from 'twenty-ui/icon';
import { Tag } from 'twenty-ui/data-display';

import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { PageLayoutType } from '~/generated-metadata/graphql';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { RecordFieldList } from '@/object-record/record-field-list/components/RecordFieldList';
import { DraftRelatedViolationsContext } from '@/object-record/record-field/ui/contexts/DraftRelatedViolationsContext';
import type { RelatedRecordViolation } from '@/object-record/record-field/ui/utils/getRelatedRecordViolations';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

import {
  buildSyntheticPolicyRecord,
  resolveProductFromPlanName,
  deriveStatusFromBob,
  normalizePaidThroughDateForEffectiveDate,
  type ClientStatusConfig,
} from '@/reconciliation/utils/buildSyntheticPolicyRecord';
import {
  invertColumnMapping,
  resolveBobValue,
  type ColumnMappingEntry,
  type ComputedFieldDef,
} from '@/reconciliation/utils/invertColumnMapping';
import type { ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';

type UnmatchedViewProps = {
  item: ReviewItemRecord;
  reconciliationId: string;
  onDecisionMade?: (itemId: string) => void;
};

// ── Styled components ──

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledName = styled.span`
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledPlanName = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledCallout = styled.div`
  background: color-mix(
    in srgb,
    ${themeCssVariables.color.green} 6%,
    transparent
  );
  border-left: 3px solid ${themeCssVariables.color.green};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  margin: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-left: ${themeCssVariables.spacing[4]};
`;

const StyledFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

// ── Component ──

export const UnmatchedView = ({
  item,
  reconciliationId,
  onDecisionMade,
}: UnmatchedViewProps) => {
  const store = useStore();
  const { enqueueErrorSnackBar } = useSnackBar();
  const snapshot = useMemo(
    () => item.bobRowSnapshot ?? {},
    [item.bobRowSnapshot],
  );

  // Stable temporary IDs derived from review item ID
  const tempPolicyId = useMemo(() => `preview-${item.id}`, [item.id]);
  const tempLeadId = useMemo(() => `preview-lead-${item.id}`, [item.id]);

  // ── Read reconciliation record from store ──

  const recordStore = useAtomFamilyStateValue(
    recordStoreFamilyState,
    reconciliationId,
  );

  const rawColumnMapping = recordStore
    ? (recordStore as Record<string, unknown>)['columnMapping']
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

  // Get carrierConfig relation from reconciliation
  const carrierConfigRelation = recordStore
    ? ((recordStore as Record<string, unknown>).carrierConfig as Record<
        string,
        unknown
      > | null)
    : null;
  const carrierConfigId = carrierConfigRelation?.id as string | undefined;

  // ── Fetch carrierConfig for productMapping + carrier info ──

  const { record: carrierConfigRecord } = useFindOneRecord({
    objectNameSingular: 'carrierConfig',
    objectRecordId: carrierConfigId ?? '',
    skip: !carrierConfigId,
  });

  const productMapping = useMemo(() => {
    if (!carrierConfigRecord) return null;
    const raw = (carrierConfigRecord as Record<string, unknown>).productMapping;

    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw as { pattern: string; productId: string; productName: string }[];
  }, [carrierConfigRecord]);

  // ── Computed-field defs (carrierConfig.fieldConfig) + crmField lookup ──

  const computedFields = useMemo<ComputedFieldDef[] | null>(() => {
    if (!carrierConfigRecord) return null;
    const raw = (carrierConfigRecord as Record<string, unknown>).fieldConfig;

    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw as ComputedFieldDef[];
  }, [carrierConfigRecord]);

  // Inverted columnMapping (crmField → snapshot key). All raw-snapshot reads
  // below go through this so non-Ambetter carriers resolve their own headers;
  // the legacy Ambetter literals passed to resolveBobValue only apply when
  // the mapping has no entry (pre-mapping reconciliations).
  const crmFieldLookup = useMemo(
    () => invertColumnMapping(columnMapping, computedFields),
    [columnMapping, computedFields],
  );

  // ── statusConfig (carrierConfig.statusConfig) for the client status
  // fallback (OMN-12): placedThresholdDays + the role → row-key fieldMapping.
  // Without it deriveStatusFromBob keeps its legacy Ambetter literals.

  const statusConfig = useMemo<ClientStatusConfig | null>(() => {
    if (!carrierConfigRecord) return null;
    const raw = (carrierConfigRecord as Record<string, unknown>).statusConfig;

    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw as ClientStatusConfig;
  }, [carrierConfigRecord]);

  // ── Resolve product from plan name ──

  const planNameRaw = resolveBobValue(snapshot, crmFieldLookup, 'planIdentifier', [
    'plan_name',
  ]);
  const planName = planNameRaw == null ? null : String(planNameRaw);
  const resolvedProduct = useMemo(
    () => resolveProductFromPlanName(planName, productMapping),
    [planName, productMapping],
  );

  // ── Resolve carrier ──

  const carrierRelation = carrierConfigRecord
    ? ((carrierConfigRecord as Record<string, unknown>).carrier as Record<
        string,
        unknown
      > | null)
    : null;
  const resolvedCarrier = useMemo(
    () =>
      carrierRelation
        ? {
            id: carrierRelation.id as string,
            name: (carrierRelation.name as string) ?? 'Unknown',
          }
        : null,
    [carrierRelation],
  );

  // ── Resolve agent by NPN ──

  const brokerNpnRaw = resolveBobValue(snapshot, crmFieldLookup, 'agent.npn', [
    'broker_npn',
  ]);
  const brokerNpn = brokerNpnRaw == null ? null : String(brokerNpnRaw);
  const { records: agentResults } = useFindManyRecords({
    objectNameSingular: 'agentProfile',
    filter: brokerNpn ? { npn: { eq: String(brokerNpn) } } : undefined,
    skip: !brokerNpn,
    limit: 1,
  });
  const resolvedAgent = useMemo(() => {
    const agent = agentResults?.[0];

    if (agent === undefined) return null;

    return {
      id: agent.id as string,
      name: ((agent as Record<string, unknown>).name as string) ?? '',
    };
  }, [agentResults]);

  // ── Look up LTV from carrierProduct ──

  const { records: carrierProducts } = useFindManyRecords({
    objectNameSingular: 'carrierProduct',
    filter:
      resolvedCarrier && resolvedProduct
        ? {
            and: [
              { carrierId: { eq: resolvedCarrier.id } },
              { productId: { eq: resolvedProduct.id } },
            ],
          }
        : undefined,
    skip: !resolvedCarrier || !resolvedProduct,
    limit: 1,
  });
  const ltvAmountMicros = useMemo(() => {
    const cp = carrierProducts?.[0] as Record<string, unknown> | undefined;

    if (!cp) return null;
    const commission = cp.commission as { amountMicros: number } | undefined;

    return commission?.amountMicros ?? null;
  }, [carrierProducts]);

  // ── Build synthetic records ──

  const { policy: syntheticPolicy, lead: syntheticLead } = useMemo(
    () =>
      buildSyntheticPolicyRecord({
        bobSnapshot: snapshot,
        columnMapping,
        computedFields,
        resolvedRelations: {
          product: resolvedProduct,
          carrier: resolvedCarrier,
          agent: resolvedAgent,
        },
        derivedStatus: item.derivedStatus || null,
        statusConfig,
        ltvAmountMicros,
        tempPolicyId,
        tempLeadId,
      }),
    [
      snapshot,
      columnMapping,
      computedFields,
      resolvedProduct,
      resolvedCarrier,
      resolvedAgent,
      item.derivedStatus,
      statusConfig,
      ltvAmountMicros,
      tempPolicyId,
      tempLeadId,
    ],
  );

  // ── Populate record store ──

  useEffect(() => {
    store.set(recordStoreFamilyState.atomFamily(tempPolicyId), syntheticPolicy);
    store.set(recordStoreFamilyState.atomFamily(tempLeadId), syntheticLead);

    return () => {
      store.set(recordStoreFamilyState.atomFamily(tempPolicyId), null);
      store.set(recordStoreFamilyState.atomFamily(tempLeadId), null);
    };
  }, [syntheticPolicy, syntheticLead, tempPolicyId, tempLeadId, store]);

  // ── Build related violations to auto-expand lead section ──

  const relatedViolations = useMemo<RelatedRecordViolation[]>(
    () => [
      {
        relationFieldName: 'lead',
        relationLabel: 'Lead',
        relatedObjectNameSingular: 'person',
        relatedRecordId: tempLeadId,
        violations: [
          { fieldMetadataId: 'name', fieldLabel: 'Name' },
          { fieldMetadataId: 'emails', fieldLabel: 'Email' },
          { fieldMetadataId: 'phones', fieldLabel: 'Phone' },
        ],
      },
    ],
    [tempLeadId],
  );

  // ── Pre-fetch existing lead by phone number ──

  const phoneNumber = String(
    resolveBobValue(snapshot, crmFieldLookup, 'lead.phones.primaryPhoneNumber', [
      'member_phone_number',
    ]) ?? '',
  ).replace(/\D/g, '');
  const { records: existingLeadsByPhone } = useFindManyRecords({
    objectNameSingular: 'person',
    filter: phoneNumber
      ? { phones: { primaryPhoneNumber: { like: `%${phoneNumber}` } } }
      : undefined,
    skip: !phoneNumber,
    limit: 1,
  });
  const existingLead = existingLeadsByPhone?.[0] ?? null;

  // ── Display values ──

  const firstName = String(
    resolveBobValue(snapshot, crmFieldLookup, 'lead.name.firstName', [
      // 'inusred' is Ambetter's own header typo, preserved verbatim
      'inusred_first_name',
      'insured_first_name',
    ]) ?? '',
  );
  const lastName = String(
    resolveBobValue(snapshot, crmFieldLookup, 'lead.name.lastName', [
      'insured_last_name',
    ]) ?? '',
  );
  const displayName =
    firstName || lastName ? `${firstName} ${lastName}`.trim() : item.name;

  // ── Create hooks ──

  const { createOneRecord: createPerson } = useCreateOneRecord({
    objectNameSingular: 'person',
  });
  const { createOneRecord: createPolicy } = useCreateOneRecord({
    objectNameSingular: 'policy',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const [creating, setCreating] = useState(false);

  // ── Decision actions ──

  const updateDecision = useCallback(
    async (decision: string, policyId?: string) => {
      await updateOneRecord({
        objectNameSingular: 'reviewItem',
        idToUpdate: item.id,
        updateOneRecordInput: {
          decision,
          decidedAt: new Date().toISOString(),
          ...(policyId ? { policyId } : {}),
        },
      });
      onDecisionMade?.(item.id);
    },
    [item.id, updateOneRecord, onDecisionMade],
  );

  const handleCreatePolicy = useCallback(async () => {
    if (creating) return;
    setCreating(true);

    try {
      // 1. Resolve or create lead
      let leadId: string;

      if (existingLead !== null) {
        leadId = existingLead.id;
      } else {
        const email = String(
          resolveBobValue(snapshot, crmFieldLookup, 'lead.emails.primaryEmail', [
            'member_email',
          ]) ?? '',
        );
        const dobRaw = resolveBobValue(
          snapshot,
          crmFieldLookup,
          'lead.dateOfBirth',
          ['member_date_of_birth'],
        );
        const dob = dobRaw ? String(dobRaw) : null;
        const state = String(
          resolveBobValue(
            snapshot,
            crmFieldLookup,
            'lead.addressCustom.addressState',
            ['state'],
          ) ?? '',
        );

        const personRecord = await createPerson({
          name: { firstName, lastName },
          emails: { primaryEmail: email },
          phones: {
            primaryPhoneNumber: phoneNumber,
            primaryPhoneCallingCode: '+1',
          },
          ...(dob ? { dateOfBirth: dob } : {}),
          ...(state ? { addressCustom: { addressState: state } } : {}),
        });

        leadId = personRecord.id;
      }

      // 2. Build policy input — resolved through the inverted columnMapping;
      // the computed effective-date output key (e.g. 'True Effective Date')
      // wins over the raw mapped column when the snapshot carries it.
      const effectiveDate =
        resolveBobValue(snapshot, crmFieldLookup, 'effectiveDate', [
          'True Effective Date',
          'policy_effective_date',
        ]) ?? null;
      const expirationDate =
        resolveBobValue(snapshot, crmFieldLookup, 'expirationDate', [
          'policy_term_date',
        ]) ?? null;
      const paidThroughDate = normalizePaidThroughDateForEffectiveDate(
        resolveBobValue(snapshot, crmFieldLookup, 'paidThroughDate', [
          'paid_through_date',
        ]),
        effectiveDate,
      );
      const policyNumber = String(
        resolveBobValue(snapshot, crmFieldLookup, 'policyNumber', [
          'policy_number',
        ]) ?? '',
      );
      const applicantCount =
        Number(
          resolveBobValue(snapshot, crmFieldLookup, 'applicantCount', [
            'number_of_members',
          ]) ?? 0,
        ) || null;
      // member_responsibility is the member's out-of-pocket (post-subsidy) amount
      const premiumRaw = resolveBobValue(
        snapshot,
        crmFieldLookup,
        'premium.amountMicros',
        ['member_responsibility', 'monthly_premium_amount'],
      );
      const premiumNum =
        premiumRaw !== null && premiumRaw !== undefined
          ? Number(premiumRaw)
          : NaN;
      const premiumMicros = !isNaN(premiumNum)
        ? Math.round(premiumNum * 1_000_000)
        : null;

      const policyInput: Record<string, unknown> = {
        policyNumber,
        leadId,
        ...(effectiveDate ? { effectiveDate: String(effectiveDate) } : {}),
        ...(expirationDate ? { expirationDate: String(expirationDate) } : {}),
        ...(paidThroughDate
          ? { paidThroughDate: String(paidThroughDate) }
          : {}),
        ...(applicantCount ? { applicantCount } : {}),
        ...(premiumMicros !== null
          ? { premium: { amountMicros: premiumMicros, currencyCode: 'USD' } }
          : {}),
        status:
          item.derivedStatus ||
          deriveStatusFromBob(snapshot, crmFieldLookup, statusConfig),
        ...(ltvAmountMicros
          ? { ltv: { amountMicros: ltvAmountMicros, currencyCode: 'USD' } }
          : {}),
        ...(resolvedProduct ? { productId: resolvedProduct.id } : {}),
        ...(resolvedCarrier ? { carrierId: resolvedCarrier.id } : {}),
        ...(resolvedAgent ? { agentId: resolvedAgent.id } : {}),
      };

      const newPolicy = await createPolicy(policyInput);

      // 3. Mark review item as approved and link to new policy
      await updateDecision('APPROVED', newPolicy.id);
    } catch {
      enqueueErrorSnackBar({ message: 'Failed to create policy' });
    } finally {
      setCreating(false);
    }
  }, [
    creating,
    existingLead,
    snapshot,
    crmFieldLookup,
    firstName,
    lastName,
    phoneNumber,
    item.derivedStatus,
    statusConfig,
    ltvAmountMicros,
    resolvedProduct,
    resolvedCarrier,
    resolvedAgent,
    createPerson,
    createPolicy,
    updateDecision,
    enqueueErrorSnackBar,
  ]);

  const handleDismiss = useCallback(
    () => updateDecision('REJECTED'),
    [updateDecision],
  );

  const handleFlag = useCallback(
    () => updateDecision('FLAG_AUDIT'),
    [updateDecision],
  );

  const isDecided =
    item.decision === 'APPROVED' ||
    item.decision === 'REJECTED' ||
    item.decision === 'FLAG_AUDIT';

  return (
    <StyledContainer>
      <StyledHeader>
        <StyledName>{displayName}</StyledName>
        {isDecided ? (
          <Tag
            color={
              item.decision === 'APPROVED'
                ? 'green'
                : item.decision === 'REJECTED'
                  ? 'red'
                  : 'orange'
            }
            text={
              item.decision === 'APPROVED'
                ? 'Created'
                : item.decision === 'REJECTED'
                  ? 'Dismissed'
                  : 'Flagged'
            }
          />
        ) : (
          <Tag color="green" text="New Policy" />
        )}
        {planName && resolvedProduct && (
          <StyledPlanName>
            {planName} → {resolvedProduct.name}
          </StyledPlanName>
        )}
        {planName && !resolvedProduct && (
          <StyledPlanName>{planName}</StyledPlanName>
        )}
        <StyledSpacer />
      </StyledHeader>

      {!isDecided && (
        <StyledCallout>
          {existingLead !== null
            ? `Existing lead found: ${(existingLead as Record<string, any>).name?.firstName ?? ''} ${(existingLead as Record<string, any>).name?.lastName ?? ''}. The new policy will be linked to this lead.`
            : 'Preview of the policy record that will be created. A new lead will also be created.'}
        </StyledCallout>
      )}

      <StyledBody>
        <DraftRelatedViolationsContext.Provider value={relatedViolations}>
          <LayoutRenderingProvider
            value={{
              targetRecordIdentifier: {
                id: tempPolicyId,
                targetObjectNameSingular: 'policy',
              },
              layoutType: PageLayoutType.RECORD_PAGE,
              isInSidePanel: false,
            }}
          >
            <RecordFieldsScopeContextProvider
              value={{
                scopeInstanceId: `preview-policy-${tempPolicyId}`,
              }}
            >
              <RecordFieldList
                instanceId={`preview-policy-${tempPolicyId}`}
                objectNameSingular="policy"
                objectRecordId={tempPolicyId}
                showRelationSections
              />
            </RecordFieldsScopeContextProvider>
          </LayoutRenderingProvider>
        </DraftRelatedViolationsContext.Provider>
      </StyledBody>

      {!isDecided && (
        <StyledFooter>
          <Button
            title={creating ? 'Creating...' : 'Create policy'}
            variant="primary"
            accent="blue"
            size="small"
            Icon={creating ? IconLoader : IconPlus}
            onClick={handleCreatePolicy}
            disabled={creating}
          />
          <Button
            title="Dismiss"
            variant="secondary"
            accent="default"
            size="small"
            Icon={IconX}
            onClick={handleDismiss}
            disabled={creating}
          />
          <StyledSpacer />
          <Button
            title="Flag for review"
            variant="tertiary"
            accent="default"
            size="small"
            Icon={IconFlag}
            onClick={handleFlag}
            disabled={creating}
          />
        </StyledFooter>
      )}
    </StyledContainer>
  );
};
