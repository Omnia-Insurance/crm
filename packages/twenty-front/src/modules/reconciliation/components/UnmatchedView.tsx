import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'jotai';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button } from 'twenty-ui/input';
import { IconPlus, IconX, IconFlag, IconLoader } from 'twenty-ui/display';
import { Tag } from 'twenty-ui/components';

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

import {
  buildSyntheticPolicyRecord,
  resolveProductFromPlanName,
  deriveStatusFromBob,
} from '@/reconciliation/utils/buildSyntheticPolicyRecord';
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

// ── Styled components ──

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledHeader = styled.div`
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledName = styled.span`
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledPlanName = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  color: ${themeCssVariables.font.color.tertiary};
`;

const StyledCallout = styled.div`
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  border-left: 3px solid ${themeCssVariables.color.green};
  background: color-mix(in srgb, ${themeCssVariables.color.green} 6%, transparent);
  margin: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
  border-radius: ${themeCssVariables.border.radius.sm};
  font-size: ${themeCssVariables.font.size.sm};
  color: ${themeCssVariables.font.color.secondary};
  line-height: 1.5;
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

// ── Component ──

export const UnmatchedView = ({
  item,
  reconciliationId,
  onDecisionMade,
}: Props) => {
  const store = useStore();
  const snapshot = item.bobRowSnapshot ?? {};

  // Stable temporary IDs derived from review item ID
  const tempPolicyId = useMemo(() => `preview-${item.id}`, [item.id]);
  const tempLeadId = useMemo(() => `preview-lead-${item.id}`, [item.id]);

  // ── Read reconciliation record from store ──

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

  // Get carrierConfig relation from reconciliation
  const carrierConfigRelation = reconciliationRecord
    ? (
        (reconciliationRecord as Record<string, unknown>)
          .carrierConfig as Record<string, unknown> | null
      )
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

  // ── Resolve product from plan name ──

  const planName = snapshot.plan_name as string | null;
  const resolvedProduct = useMemo(
    () => resolveProductFromPlanName(planName, productMapping),
    [planName, productMapping],
  );

  // ── Resolve carrier ──

  const carrierRelation = carrierConfigRecord
    ? (
        (carrierConfigRecord as Record<string, unknown>).carrier as Record<
          string,
          unknown
        > | null
      )
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

  const brokerNpn = snapshot.broker_npn as string | null;
  const { records: agentResults } = useFindManyRecords({
    objectNameSingular: 'agentProfile',
    filter: brokerNpn
      ? { npn: { eq: String(brokerNpn) } }
      : undefined,
    skip: !brokerNpn,
    limit: 1,
  });
  const resolvedAgent = useMemo(() => {
    const agent = agentResults?.[0];

    if (!agent) return null;

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
    const commission = cp.commission as
      | { amountMicros: number }
      | undefined;

    return commission?.amountMicros ?? null;
  }, [carrierProducts]);

  // ── Build synthetic records ──

  const { policy: syntheticPolicy, lead: syntheticLead } = useMemo(
    () =>
      buildSyntheticPolicyRecord({
        bobSnapshot: snapshot,
        columnMapping,
        resolvedRelations: {
          product: resolvedProduct,
          carrier: resolvedCarrier,
          agent: resolvedAgent,
        },
        derivedStatus: item.derivedStatus || null,
        ltvAmountMicros,
        tempPolicyId,
        tempLeadId,
      }),
    [
      snapshot,
      columnMapping,
      resolvedProduct,
      resolvedCarrier,
      resolvedAgent,
      item.derivedStatus,
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
    snapshot.member_phone_number ?? '',
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
    snapshot.inusred_first_name ?? snapshot.insured_first_name ?? '',
  );
  const lastName = String(snapshot.insured_last_name ?? '');
  const displayName =
    firstName || lastName
      ? `${firstName} ${lastName}`.trim()
      : item.name;

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

      if (existingLead) {
        leadId = existingLead.id;
      } else {
        const email = String(snapshot.member_email ?? '');
        const dob = snapshot.member_date_of_birth
          ? String(snapshot.member_date_of_birth)
          : null;
        const state = String(snapshot.state ?? '');

        const personRecord = await createPerson({
          name: { firstName, lastName },
          emails: { primaryEmail: email },
          phones: {
            primaryPhoneNumber: phoneNumber,
            primaryPhoneCallingCode: '+1',
          },
          ...(dob ? { dateOfBirth: dob } : {}),
          ...(state
            ? { addressCustom: { addressState: state } }
            : {}),
        });

        leadId = personRecord.id;
      }

      // 2. Build policy input
      const effectiveDate =
        snapshot['True Effective Date'] ??
        snapshot.policy_effective_date ??
        null;
      const expirationDate = snapshot.policy_term_date ?? null;
      const paidThroughDate = snapshot.paid_through_date ?? null;
      const policyNumber = String(snapshot.policy_number ?? '');
      const applicantCount = Number(snapshot.number_of_members ?? 0) || null;
      // member_responsibility is the member's out-of-pocket (post-subsidy) amount
      const premiumRaw =
        snapshot.member_responsibility ?? snapshot.monthly_premium_amount;
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
        ...(paidThroughDate ? { paidThroughDate: String(paidThroughDate) } : {}),
        ...(applicantCount ? { applicantCount } : {}),
        ...(premiumMicros !== null
          ? { premium: { amountMicros: premiumMicros, currencyCode: 'USD' } }
          : {}),
        status: item.derivedStatus || deriveStatusFromBob(snapshot),
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
    } catch (err) {
      console.error('Failed to create policy:', err);
    } finally {
      setCreating(false);
    }
  }, [
    creating,
    existingLead,
    snapshot,
    firstName,
    lastName,
    phoneNumber,
    item.derivedStatus,
    ltvAmountMicros,
    resolvedProduct,
    resolvedCarrier,
    resolvedAgent,
    createPerson,
    createPolicy,
    updateDecision,
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
            color={item.decision === 'APPROVED' ? 'green' : item.decision === 'REJECTED' ? 'red' : 'orange'}
            text={item.decision === 'APPROVED' ? 'Created' : item.decision === 'REJECTED' ? 'Dismissed' : 'Flagged'}
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
          {existingLead
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
