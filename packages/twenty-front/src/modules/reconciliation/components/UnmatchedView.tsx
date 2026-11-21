import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useStore } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { doNotTranslate } from 'twenty-shared/i18n';
import { CurrencyCode } from 'twenty-shared/constants';
import { isPlainObject } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { IconFlag, IconPlus, IconX } from 'twenty-ui/icon';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { RecordFieldList } from '@/object-record/record-field-list/components/RecordFieldList';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { ReconciliationRecordRelationsList } from '@/reconciliation/components/ReconciliationRecordRelationsList';
import { type ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';
import {
  buildSyntheticPolicyRecord,
  deriveStatusFromBob,
  normalizePaidThroughDateForEffectiveDate,
  resolveProductFromPlanName,
  type ClientStatusConfig,
} from '@/reconciliation/utils/buildSyntheticPolicyRecord';
import {
  invertColumnMapping,
  resolveBobValue,
  type ColumnMappingEntry,
  type ComputedFieldDef,
} from '@/reconciliation/utils/invertColumnMapping';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { PageLayoutType } from '~/generated-metadata/graphql';

type UnmatchedViewProps = {
  item: ReviewItemRecord;
  reconciliationId: string;
  onDecisionMade?: (itemId: string) => void;
};

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

export const UnmatchedView = ({
  item,
  reconciliationId,
  onDecisionMade,
}: UnmatchedViewProps) => {
  const { t } = useLingui();
  const store = useStore();
  const { enqueueToast } = useToast();
  const snapshot = useMemo(
    () => item.bobRowSnapshot ?? {},
    [item.bobRowSnapshot],
  );

  // Not UUIDs on purpose: these records only exist in the store
  const tempPolicyId = useMemo(() => `preview-${item.id}`, [item.id]);
  const tempLeadId = useMemo(() => `preview-lead-${item.id}`, [item.id]);

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

  const carrierConfigRelation = recordStore
    ? ((recordStore as Record<string, unknown>).carrierConfig as Record<
        string,
        unknown
      > | null)
    : null;
  const carrierConfigId = carrierConfigRelation?.id as string | undefined;

  const { record: carrierConfigRecord } = useFindOneRecord({
    objectNameSingular: 'carrierConfig',
    objectRecordId: carrierConfigId ?? '',
    skip: !carrierConfigId,
  });

  const productMapping = useMemo(() => {
    if (!carrierConfigRecord) {
      return null;
    }
    const raw = (carrierConfigRecord as Record<string, unknown>).productMapping;

    if (!raw) {
      return null;
    }
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw as { pattern: string; productId: string; productName: string }[];
  }, [carrierConfigRecord]);

  const computedFields = useMemo<ComputedFieldDef[] | null>(() => {
    if (!carrierConfigRecord) {
      return null;
    }
    const raw = (carrierConfigRecord as Record<string, unknown>).fieldConfig;

    if (!raw) {
      return null;
    }
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

  // Client status fallback (OMN-12); without it deriveStatusFromBob keeps its
  // legacy Ambetter literals.
  const statusConfig = useMemo<ClientStatusConfig | null>(() => {
    if (!carrierConfigRecord) {
      return null;
    }
    const raw = (carrierConfigRecord as Record<string, unknown>).statusConfig;

    if (!raw) {
      return null;
    }
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw as ClientStatusConfig;
  }, [carrierConfigRecord]);

  const planNameRaw = resolveBobValue(
    snapshot,
    crmFieldLookup,
    'planIdentifier',
    ['plan_name'],
  );
  const planName = planNameRaw == null ? null : String(planNameRaw);
  const resolvedProduct = useMemo(
    () => resolveProductFromPlanName(planName, productMapping),
    [planName, productMapping],
  );

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
            name: (carrierRelation.name as string) ?? t`Unknown`,
          }
        : null,
    [carrierRelation, t],
  );

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

    if (agent === undefined) {
      return null;
    }

    return {
      id: agent.id as string,
      name: ((agent as Record<string, unknown>).name as string) ?? '',
    };
  }, [agentResults]);

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

    if (!cp) {
      return null;
    }
    const commission = cp.commission as { amountMicros: number } | undefined;

    return commission?.amountMicros ?? null;
  }, [carrierProducts]);

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

  // The preview renders through the standard field list, which reads the store.
  useEffect(() => {
    store.set(recordStoreFamilyState.atomFamily(tempPolicyId), syntheticPolicy);
    store.set(recordStoreFamilyState.atomFamily(tempLeadId), syntheticLead);

    return () => {
      store.set(recordStoreFamilyState.atomFamily(tempPolicyId), null);
      store.set(recordStoreFamilyState.atomFamily(tempLeadId), null);
    };
  }, [syntheticPolicy, syntheticLead, tempPolicyId, tempLeadId, store]);

  const phoneNumber = String(
    resolveBobValue(
      snapshot,
      crmFieldLookup,
      'lead.phones.primaryPhoneNumber',
      ['member_phone_number'],
    ) ?? '',
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

  const existingLeadName: unknown = existingLead?.name;
  const existingLeadFullName = isPlainObject(existingLeadName)
    ? [existingLeadName.firstName, existingLeadName.lastName]
        .filter(isNonEmptyString)
        .join(' ')
    : '';

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

  const { createOneRecord: createPerson } = useCreateOneRecord({
    objectNameSingular: 'person',
  });
  const { createOneRecord: createPolicy } = useCreateOneRecord({
    objectNameSingular: 'policy',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const [creating, setCreating] = useState(false);

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
    if (creating) {
      return;
    }
    setCreating(true);

    try {
      let leadId: string;

      if (existingLead !== null) {
        leadId = existingLead.id;
      } else {
        const email = String(
          resolveBobValue(
            snapshot,
            crmFieldLookup,
            'lead.emails.primaryEmail',
            ['member_email'],
          ) ?? '',
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

      // The computed effective-date key (e.g. 'True Effective Date') wins over
      // the raw mapped column when the snapshot carries it.
      const effectiveDate =
        resolveBobValue(snapshot, crmFieldLookup, 'effectiveDate', [
          doNotTranslate('True Effective Date'),
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
          ? {
              premium: {
                amountMicros: premiumMicros,
                currencyCode: CurrencyCode.USD,
              },
            }
          : {}),
        status:
          item.derivedStatus ||
          deriveStatusFromBob(snapshot, crmFieldLookup, statusConfig),
        ...(ltvAmountMicros
          ? {
              ltv: {
                amountMicros: ltvAmountMicros,
                currencyCode: CurrencyCode.USD,
              },
            }
          : {}),
        ...(resolvedProduct ? { productId: resolvedProduct.id } : {}),
        ...(resolvedCarrier ? { carrierId: resolvedCarrier.id } : {}),
        ...(resolvedAgent ? { agentId: resolvedAgent.id } : {}),
      };

      const newPolicy = await createPolicy(policyInput);

      await updateDecision('APPROVED', newPolicy.id);
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Failed to create policy`,
      });
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
    enqueueToast,
    t,
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

  const decisionTagColor =
    item.decision === 'APPROVED'
      ? 'green'
      : item.decision === 'REJECTED'
        ? 'red'
        : 'orange';

  const decisionTagLabel =
    item.decision === 'APPROVED'
      ? t`Created`
      : item.decision === 'REJECTED'
        ? t`Dismissed`
        : t`Flagged`;

  return (
    <StyledContainer>
      <StyledHeader>
        <StyledName>{displayName}</StyledName>
        {isDecided ? (
          <Tag color={decisionTagColor}>{decisionTagLabel}</Tag>
        ) : (
          <Tag color="green">{t`New Policy`}</Tag>
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
            ? t`Existing lead found: ${existingLeadFullName}. The new policy will be linked to this lead.`
            : t`Preview of the policy record that will be created. A new lead will also be created.`}
        </StyledCallout>
      )}

      <StyledBody>
        <LayoutRenderingProvider
          value={{
            targetRecordIdentifier: {
              id: tempPolicyId,
              targetObjectNameSingular: 'policy',
            },
            layoutType: PageLayoutType.RECORD_PAGE,
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
            />
            {/* The preview is not saved yet: nothing to reassign or detach */}
            <ReconciliationRecordRelationsList
              objectNameSingular="policy"
              objectRecordId={tempPolicyId}
              isReadOnly
              expandedRelationFieldNames={['lead']}
            />
          </RecordFieldsScopeContextProvider>
        </LayoutRenderingProvider>
      </StyledBody>

      {!isDecided && (
        <StyledFooter>
          <Button
            variant="solid"
            color="accent"
            size="sm"
            startIcon={<IconPlus />}
            loading={creating}
            loadingPosition="start"
            onClick={handleCreatePolicy}
          >
            {t`Create policy`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            startIcon={<IconX />}
            onClick={handleDismiss}
            disabled={creating}
          >
            {t`Dismiss`}
          </Button>
          <StyledSpacer />
          <Button
            variant="ghost"
            size="sm"
            startIcon={<IconFlag />}
            onClick={handleFlag}
            disabled={creating}
          >
            {t`Flag for review`}
          </Button>
        </StyledFooter>
      )}
    </StyledContainer>
  );
};
