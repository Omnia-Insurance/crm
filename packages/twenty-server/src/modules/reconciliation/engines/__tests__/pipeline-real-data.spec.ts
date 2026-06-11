// OMNIA-CUSTOM: Phase 4.10 acceptance test — "a second carrier is a
// pure-config exercise."
//
// Drives the FULL extracted pipeline end-to-end, exactly as the jobs run it
// (parse.job.ts → match.job.ts), using only the pure stages:
//
//   parseCarrierPipelineConfig → resolveFieldMapping → transformRows
//   (+ computed fields) → buildMatchIndexes → matchRow → deriveStatus →
//   computeFieldDiffsFromMapping → deriveCategory / deriveFlags
//
// for TWO carriers:
//
//   1. Ambetter — the literal seeded config (constants + merge builder
//      imported from seed-ambetter-carrier-config.command.ts) over the real
//      BOB fixture rows (ported verbatim from parsers/__tests__/
//      transforms.spec.ts, themselves from the 03/10/2026 export).
//   2. Oscar — a fictional second carrier defined ONLY by config: different
//      headers ('Member ID', 'Policy Ref', 'Coverage Start', …),
//      DD/MM/YYYY dates + Y/N booleans via transformRules, a '^OSC-' policy
//      pattern instead of '^U', its own columnMapping / computedFields /
//      statusFieldMapping, and a null startDate (no Ambetter onboarding
//      cutoff). No production code knows Oscar exists.
//
// Status engine: the registry deliberately holds only 'ambetter-bob-v1'
// (STATUS_ENGINE_IDS). Oscar's status semantics are the same ACA
// effective/paid-through/term rules, so its config reuses that engine id —
// and this suite additionally asserts the fail-fast: a config selecting an
// UNREGISTERED engine id dies with the actionable registry error before any
// row is processed. No production Oscar engine is added.

import {
  AMBETTER_COLUMN_MAPPING,
  AMBETTER_COMPUTED_FIELDS,
  AMBETTER_STATUS_ENGINE_ID,
  AMBETTER_STATUS_FIELD_MAPPING,
  AMBETTER_TRANSFORM_RULES,
  buildCarrierConfigUpdate,
} from 'src/database/commands/custom/seed-ambetter-carrier-config.command';
import {
  computeFieldDiffsFromMapping,
  summarizeDiffs,
  type FieldDiff,
} from 'src/modules/reconciliation/engines/diff';
import {
  buildMatchIndexes,
  buildMatchInputFromMapping,
  DEFAULT_MATCHING_CONFIG,
  matchRow,
  type CrmPolicy,
  type Override,
} from 'src/modules/reconciliation/engines/matching';
import {
  buildBrokerEffAuditInput,
  buildStatusInputFromMapping,
  deriveBrokerEffAudit,
  deriveStatus,
  getCancelExpireDate,
  isKnownStatusEngine,
  resolveEffectiveDateHeader,
  STATUS_ENGINE_IDS,
  STATUS_ENGINE_ROLE_TYPES,
  type OmniaStatus,
} from 'src/modules/reconciliation/engines/status';
import {
  inferDataType,
  resolveFieldMapping,
  transformRows,
  validateStatusRoleMapping,
  type CellParseError,
  type StatusRoleValidationResult,
} from 'src/modules/reconciliation/parsers/transforms';
import type { ParsedRow } from 'src/modules/reconciliation/parsers/xlsx';
import { buildPolicyForDiff } from 'src/modules/reconciliation/services/data.service';
import {
  parseCarrierPipelineConfig,
  type CarrierPipelineConfig,
} from 'src/modules/reconciliation/types/carrier-config';
import {
  deriveCategory,
  deriveFlags,
} from 'src/modules/reconciliation/types/field-config';
import type {
  CarrierConfigRecord,
  ColumnMapping,
  ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

// Fixed clock: the date of the real Ambetter export the fixtures came from.
const TODAY = new Date('2026-03-10T12:00:00Z');

const RECONCILIATION_ID = 'reconciliation-e2e-test';

// ---------------------------------------------------------------------------
// Pipeline harness — a faithful, pure replication of the two jobs' stage
// sequence. Deliberately does NOT import the job classes (they need the Nest
// queue/data/state-machine services); each block below mirrors a numbered
// step in parse.job.ts `handle` or match.job.ts `handle`/`loadMatchContext`.
// ---------------------------------------------------------------------------

type PipelineStats = {
  totalBobRows: number;
  autoMatched: number;
  needsReview: number;
  unmatched: number;
  confirmed: number;
  discrepanciesFound: number;
  skippedBeforeStartDate: number;
  skippedInvalidPolicyNumber: number;
};

type PipelineRunResult = {
  pipelineConfig: CarrierPipelineConfig;
  roleValidation: StatusRoleValidationResult;
  normalized: Record<string, unknown>[];
  parseErrors: CellParseError[];
  reviewItems: Record<string, unknown>[];
  stats: PipelineStats;
};

type PendingItem = {
  row: Record<string, unknown>;
  derivedStatus: string | null;
  currentCrmStatus: string | null;
  derivedExpireDate: string | null;
  cancelPreviousPolicyId: string | null;
  statusChangeReason: string | null;
  matchedPolicyId: string;
  record: Record<string, unknown>;
};

const runPipeline = ({
  carrierConfig,
  rawRows,
  crmPolicies,
  overrides = [],
  today = TODAY,
}: {
  carrierConfig: CarrierConfigRecord;
  rawRows: ParsedRow[];
  crmPolicies: CrmPolicy[];
  overrides?: Override[];
  today?: Date;
}): PipelineRunResult => {
  const carrierName = carrierConfig.name;

  // ---- PARSE stage (parse.job.ts step 4) ----
  const pipelineConfig = parseCarrierPipelineConfig(carrierConfig);

  // Fail fast at PARSE on an unknown status engine id (same message as
  // parse.job.ts).
  if (!isKnownStatusEngine(pipelineConfig.statusEngineId)) {
    throw new Error(
      `Unknown status engine id "${pipelineConfig.statusEngineId}" on carrier config ` +
        `"${carrierConfig.name}". Known engines: ${STATUS_ENGINE_IDS.join(', ')}. ` +
        `Fix statusConfig.engineId on the carrier config and re-run.`,
    );
  }

  // The jobs read the per-reconciliation columnMapping snapshot; the import
  // dialog prefills that snapshot from the carrier config, so for these
  // fixtures the snapshot IS the carrier's seeded mapping.
  const columnMapping = carrierConfig.columnMapping as ColumnMapping;
  const computedFields = pipelineConfig.computedFields;

  const actualHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const parseStatusFieldMapping = resolveFieldMapping(
    pipelineConfig.statusFieldMapping,
    actualHeaders,
  );
  const roleValidation = validateStatusRoleMapping(
    parseStatusFieldMapping,
    actualHeaders,
    computedFields,
  );

  if (roleValidation.unresolvedRequired.length > 0) {
    throw new Error(
      `Status-engine required role(s) resolve to no file header or computed-field output: ` +
        roleValidation.unresolvedRequired
          .map(({ role, configuredHeader }) => `${role} → "${configuredHeader}"`)
          .join(', '),
    );
  }

  // Header → dataType map from columnMapping fieldTypes + status-role types.
  const headerTypes = new Map<string, string>();

  for (const [header, entry] of Object.entries(columnMapping)) {
    headerTypes.set(header, inferDataType(entry.fieldType));
  }
  for (const [role, header] of Object.entries(parseStatusFieldMapping)) {
    if (!headerTypes.has(header) && STATUS_ENGINE_ROLE_TYPES[role]) {
      headerTypes.set(header, STATUS_ENGINE_ROLE_TYPES[role]);
    }
  }

  const policyNumberHeader = Object.entries(columnMapping).find(
    ([, e]) => e.crmField === 'policyNumber',
  )?.[0];

  const { normalized, parseErrors } = transformRows(
    rawRows,
    headerTypes,
    computedFields,
    parseStatusFieldMapping,
    policyNumberHeader,
    pipelineConfig.transformRules,
  );

  // parse.job persists the rows as a JSON attachment that match.job reads
  // back — round-trip them so nothing that wouldn't survive JSON leaks in.
  const parsedRows: Record<string, unknown>[] = JSON.parse(
    JSON.stringify(normalized),
  );

  // ---- MATCH stage (match.job.ts loadMatchContext + handle) ----
  const computedFieldCrmFields = computedFields
    ? Object.fromEntries(
        computedFields
          .filter((cf) => cf.crmField)
          .map((cf) => [cf.outputKey, cf.crmField!]),
      )
    : undefined;

  const sampleRow = parsedRows.length > 0 ? parsedRows[0] : {};
  const statusFieldMapping = resolveFieldMapping(
    pipelineConfig.statusFieldMapping,
    Object.keys(sampleRow),
  );

  const matchIndexes = buildMatchIndexes(crmPolicies);
  const policyNumberMap = matchIndexes.policyByNumber;
  const effDateHeader = resolveEffectiveDateHeader(
    columnMapping,
    computedFields,
  );

  const {
    statusEngineId,
    matching: matchingConfig,
    status: statusEngineConfig,
    startDate,
    policyNumberPattern,
  } = pipelineConfig;

  let autoMatched = 0;
  let needsReview = 0;
  let unmatched = 0;
  let confirmed = 0;
  let discrepanciesFound = 0;
  let skippedBeforeStartDate = 0;
  let skippedInvalidPolicyNumber = 0;
  const reviewItems: Record<string, unknown>[] = [];
  const pendingItems: PendingItem[] = [];

  // --- per-row loop (match.job.ts "PILLAR 1: Matching + Status") ---
  for (const row of parsedRows) {
    const policyEffDate = effDateHeader
      ? (row[effDateHeader] as string | null)
      : null;

    if (startDate && policyEffDate && policyEffDate < startDate) {
      skippedBeforeStartDate++;
      continue;
    }

    const matchInput = buildMatchInputFromMapping(
      row,
      columnMapping,
      computedFieldCrmFields,
    );

    if (
      policyNumberPattern &&
      matchInput.policyNumber &&
      !policyNumberPattern.test(matchInput.policyNumber)
    ) {
      skippedInvalidPolicyNumber++;
      continue;
    }

    const decision = matchRow(
      matchInput,
      matchIndexes,
      overrides,
      carrierName,
      matchingConfig,
    );

    let derivedStatus: string | null = null;
    let currentCrmStatus: string | null = null;
    let derivedExpireDate: string | null = null;
    let cancelPreviousPolicyId: string | null = null;
    let statusChangeReason: string | null = null;

    if (decision.crmPolicyId) {
      const matchedPolicy = matchIndexes.policyById.get(decision.crmPolicyId);

      currentCrmStatus = matchedPolicy?.status ?? null;

      const allPoliciesForNumber = matchInput.policyNumber
        ? (policyNumberMap.get(matchInput.policyNumber) ?? [])
        : [];

      const statusInputData = buildStatusInputFromMapping(
        row,
        statusFieldMapping,
      );

      const statusResult = deriveStatus(
        statusEngineId,
        statusInputData,
        allPoliciesForNumber,
        today,
        statusEngineConfig,
        decision.crmPolicyId,
      );

      if (statusResult) {
        derivedStatus = statusResult.derivedStatus;
        derivedExpireDate = statusResult.derivedExpireDate;
        cancelPreviousPolicyId = statusResult.cancelPreviousPolicyId;
        statusChangeReason = statusResult.statusChangeReason;
      }
    }

    const policyLabel = matchInput.policyNumber ?? 'unknown';
    const crmLabel = decision.crmPolicyNumber ?? 'none';

    if (decision.status === 'UNMATCHED') {
      let enrichedNotes = decision.notes;
      const auditInput = buildBrokerEffAuditInput(
        row,
        statusFieldMapping,
        derivedStatus,
      );
      const audit = deriveBrokerEffAudit(auditInput);

      if (audit.flagged) {
        enrichedNotes += `. ${audit.reason} — flag for audit research`;
      } else if (auditInput.eligibleForCommission === false) {
        enrichedNotes += '. CANCELED in BOB — no CRM match';
      } else if (auditInput.brokerEffectiveDate) {
        enrichedNotes += `. ACTIVE policy not in CRM (broker eff ${auditInput.brokerEffectiveDate}) — needs CRM record`;
      }

      const unmatchedFlags = deriveFlags(
        derivedStatus,
        currentCrmStatus,
        decision.method,
        [],
        statusFieldMapping,
        row,
      );

      reviewItems.push({
        name: `${policyLabel} → ${crmLabel}`,
        confidence: decision.confidence,
        matchMethod: decision.method,
        matchNotes: enrichedNotes,
        derivedStatus,
        currentCrmStatus,
        statusChangeReason,
        decision: 'PENDING',
        fieldDiffs: null,
        bobRowSnapshot: row,
        reconciliationId: RECONCILIATION_ID,
        policyId: null,
        category: 'UNMATCHED',
        flags: unmatchedFlags.flags,
        flagReasons: unmatchedFlags.reasons,
        summary: '',
        carrierPolicyNumber: matchInput.policyNumber ?? null,
        carrierName,
        cancelPreviousPolicyId,
      });

      unmatched++;
    } else {
      pendingItems.push({
        row,
        derivedStatus,
        currentCrmStatus,
        derivedExpireDate,
        cancelPreviousPolicyId,
        statusChangeReason,
        matchedPolicyId: decision.crmPolicyId!,
        record: {
          name: `${policyLabel} → ${crmLabel}`,
          confidence: decision.confidence,
          matchMethod: decision.method,
          matchNotes: decision.notes,
          derivedStatus,
          currentCrmStatus,
          statusChangeReason,
          decision: 'PENDING',
          fieldDiffs: null as FieldDiff[] | null,
          bobRowSnapshot: row,
          reconciliationId: RECONCILIATION_ID,
          policyId: decision.crmPolicyId,
          category: 'UPDATE',
          flags: [] as string[],
          flagReasons: {} as Record<string, string>,
          summary: '',
          carrierPolicyNumber: matchInput.policyNumber ?? null,
          carrierName,
          cancelPreviousPolicyId,
        },
      });

      if (decision.status === 'AUTO_MATCHED') autoMatched++;
      else needsReview++;
    }
  }

  // --- dedup (match.job.ts dedupPendingByPolicyId) ---
  const byPolicyId = new Map<string, PendingItem[]>();

  for (const item of pendingItems) {
    const existing = byPolicyId.get(item.matchedPolicyId) ?? [];

    existing.push(item);
    byPolicyId.set(item.matchedPolicyId, existing);
  }

  const dedupedItems: PendingItem[] = [];

  for (const [, items] of byPolicyId) {
    if (items.length === 1) {
      dedupedItems.push(items[0]);
      continue;
    }

    items.sort((a, b) => {
      const aEff = effDateHeader ? ((a.row[effDateHeader] as string) ?? '') : '';
      const bEff = effDateHeader ? ((b.row[effDateHeader] as string) ?? '') : '';

      return bEff.localeCompare(aEff);
    });

    dedupedItems.push(items[0]);
  }

  // --- diff enrichment (match.job.ts enrichAndDiffMatchedItems) ---
  // No phase-2 enrichment store in this in-memory harness: diff over the
  // phase-1 snapshot — exactly what buildPolicyForDiff produces when
  // enrichMatchedPolicies has nothing for a policy.
  for (const pending of dedupedItems) {
    const matchedPolicy = matchIndexes.policyById.get(pending.matchedPolicyId);

    if (!matchedPolicy) continue;

    const policyForDiff = buildPolicyForDiff(matchedPolicy, undefined);

    const statusResult =
      pending.derivedStatus != null
        ? {
            derivedStatus: pending.derivedStatus as OmniaStatus,
            derivedExpireDate: pending.derivedExpireDate,
            cancelPreviousPolicyId: pending.cancelPreviousPolicyId,
            statusChangeReason: pending.statusChangeReason ?? '',
          }
        : null;

    const policyNumber = matchedPolicy.policyNumber;
    const namesakes = policyNumber
      ? (matchIndexes.policyByNumber.get(policyNumber) ?? []).filter(
          (p) => p.id !== matchedPolicy.id,
        )
      : [];

    const diffs = computeFieldDiffsFromMapping(
      pending.row,
      policyForDiff,
      statusResult,
      columnMapping,
      computedFields,
      namesakes,
    );

    if (pending.cancelPreviousPolicyId) {
      const effDateVal = effDateHeader
        ? (pending.row[effDateHeader] as string | undefined)
        : undefined;
      const cancelExpireDate = effDateVal
        ? getCancelExpireDate(effDateVal)
        : null;

      diffs.push({
        field: '__cancelPreviousPolicy',
        label: 'Cancel Previous Version',
        bobValue: cancelExpireDate
          ? `Canceled as of ${cancelExpireDate}`
          : 'Cancel previous version',
        crmValue: null,
        action: 'COMPUTED',
        severity: 'CRITICAL',
        approval: 'PENDING',
        crmField: null,
        crmObjectType: null,
        note: `Previous policy ${pending.cancelPreviousPolicyId} will be set to CANCELED`,
      });
    }

    const category = deriveCategory(
      false,
      diffs,
      pending.derivedStatus,
      pending.currentCrmStatus,
    );

    if (category === null) {
      confirmed++;
      continue;
    }

    const flagsResult = deriveFlags(
      pending.derivedStatus,
      pending.currentCrmStatus,
      pending.record.matchMethod as string,
      diffs,
      statusFieldMapping,
      pending.row,
    );

    pending.record.fieldDiffs = diffs;
    pending.record.summary = summarizeDiffs(diffs);
    pending.record.category = category;
    pending.record.flags = flagsResult.flags;
    pending.record.flagReasons = flagsResult.reasons;

    if (pending.cancelPreviousPolicyId) {
      const effDateVal = effDateHeader
        ? (pending.row[effDateHeader] as string | undefined)
        : undefined;

      pending.record.bobRowSnapshot = {
        ...pending.row,
        __cancelPreviousPolicyId: pending.cancelPreviousPolicyId,
        __cancelExpireDate: effDateVal ? getCancelExpireDate(effDateVal) : null,
      };
    }

    reviewItems.push(pending.record);
    discrepanciesFound++;
  }

  return {
    pipelineConfig,
    roleValidation,
    normalized,
    parseErrors,
    reviewItems,
    stats: {
      totalBobRows: parsedRows.length,
      autoMatched,
      needsReview,
      unmatched,
      confirmed,
      discrepanciesFound,
      skippedBeforeStartDate,
      skippedInvalidPolicyNumber,
    },
  };
};

const itemFor = (
  result: PipelineRunResult,
  carrierPolicyNumber: string,
): Record<string, unknown> => {
  const item = result.reviewItems.find(
    (r) => r.carrierPolicyNumber === carrierPolicyNumber,
  );

  if (!item) {
    throw new Error(`No review item for policy "${carrierPolicyNumber}"`);
  }

  return item;
};

const diffsOf = (item: Record<string, unknown>): FieldDiff[] =>
  item.fieldDiffs as FieldDiff[];

// ---------------------------------------------------------------------------
// CRM policy fixtures
// ---------------------------------------------------------------------------

const makePolicy = (overrides: Partial<CrmPolicy> = {}): CrmPolicy => ({
  id: 'policy-x',
  policyNumber: null,
  applicationId: null,
  effectiveDate: null,
  expirationDate: null,
  paidThroughDate: null,
  status: null,
  applicantCount: 1,
  'premium.amountMicros': null,
  'lead.name.firstName': null,
  'lead.name.lastName': null,
  'lead.dateOfBirth': null,
  'lead.addressCustom.addressState': null,
  'agent.name': null,
  'agent.npn': null,
  planIdentifier: null,
  'lead.phones.primaryPhoneNumber': null,
  'lead.emails.primaryEmail': null,
  'lead.id': null,
  ...overrides,
});

// ===========================================================================
// Carrier 1: Ambetter — literal seeded config + real BOB fixtures
// ===========================================================================

// The exact payload the seed command writes (create path and fresh-merge
// path are identical — buildCarrierConfigUpdate({}) resolves every merge to
// the seed constants).
const seededAmbetterValues = buildCarrierConfigUpdate({}).value;

const AMBETTER_CARRIER_CONFIG: CarrierConfigRecord = {
  id: 'carrier-config-ambetter',
  name: 'Ambetter',
  carrierId: null,
  parserVersion: seededAmbetterValues.parserVersion as string,
  fieldConfig: seededAmbetterValues.fieldConfig as Record<string, unknown>[],
  matchingConfig:
    seededAmbetterValues.matchingConfig as CarrierConfigRecord['matchingConfig'],
  statusConfig:
    seededAmbetterValues.statusConfig as CarrierConfigRecord['statusConfig'],
  policyNumberPattern: seededAmbetterValues.policyNumberPattern as string,
  columnMapping: seededAmbetterValues.columnMapping as ColumnMapping,
  productMapping:
    seededAmbetterValues.productMapping as CarrierConfigRecord['productMapping'],
  transformRules: seededAmbetterValues.transformRules as Record<
    string,
    unknown
  >,
};

// Real Ambetter BOB rows from the 03/10/2026 export — ported verbatim from
// parsers/__tests__/transforms.spec.ts (REAL_ROWS).
const AMBETTER_REAL_ROWS: ParsedRow[] = [
  {
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U94753487',
    'Plan Name': 'Ambetter Balanced Care 12 (2021) + Vision + Adult Dental',
    'Insured First Name': 'Sara',
    'Insured Last Name': 'Ghoston',
    'Broker Effective Date': '2/1/2026',
    'Policy Effective Date': '4/1/2021',
    'Policy Term Date': '8/31/2021',
    'Paid Through Date': '8/31/2021',
    'Member Date Of Birth': '12/30/1963',
    'Eligible for Commission': 'No',
    'Member Phone Number': '2149953244',
    'Member Email': 'ghostonsara8@gmail.com',
  },
  {
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U71951365',
    'Plan Name': 'Everyday Bronze',
    'Insured First Name': 'Brittany',
    'Insured Last Name': 'Smith',
    'Broker Effective Date': '1/1/2026',
    'Policy Effective Date': '6/1/2024',
    'Policy Term Date': '12/31/2026',
    'Paid Through Date': '12/31/2026',
    'Member Date Of Birth': '6/4/1985',
    'Eligible for Commission': 'Yes',
    'Member Phone Number': '',
    'Member Email': '',
  },
  {
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U73500709',
    'Plan Name': 'Everyday Bronze',
    'Insured First Name': 'Jeremy',
    'Insured Last Name': 'Boudreaux',
    'Broker Effective Date': '1/1/2026',
    'Policy Effective Date': '1/1/2026',
    'Policy Term Date': '12/31/2026',
    'Paid Through Date': '1/31/2026',
    'Member Date Of Birth': '2/10/1988',
    'Eligible for Commission': 'Yes',
    'Member Phone Number': '9853340462',
    'Member Email': 'boudreauxjeremy40@gmail.com',
  },
];

// Three extra Ambetter-shaped rows exercising the config gates and the
// unmatched path (synthetic, clearly not part of the real export).
const AMBETTER_EXTRA_ROWS: ParsedRow[] = [
  {
    // True Effective Date 2025-07-01 < seeded startDate 2025-07-09 → skipped
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U70000001',
    'Plan Name': 'Everyday Bronze',
    'Insured First Name': 'Dana',
    'Insured Last Name': 'Pruitt',
    'Broker Effective Date': '7/1/2025',
    'Policy Effective Date': '1/1/2025',
    'Policy Term Date': '',
    'Paid Through Date': '7/31/2025',
    'Member Date Of Birth': '5/5/1970',
    'Eligible for Commission': 'Yes',
    'Member Phone Number': '',
    'Member Email': '',
  },
  {
    // FFM-style digits instead of a U-number → gated by seeded '^U' pattern
    ...AMBETTER_REAL_ROWS[2],
    'Policy Number': '73500709123',
    'Insured First Name': 'Nadia',
    'Insured Last Name': 'Quinn',
  },
  {
    // Active policy with no CRM record → UNMATCHED review item
    'Broker Name': 'Alexandria Marrero',
    'Broker NPN': '21340394',
    'Policy Number': 'U99999999',
    'Plan Name': 'Everyday Bronze',
    'Insured First Name': 'Marcus',
    'Insured Last Name': 'Webb',
    'Broker Effective Date': '1/1/2026',
    'Policy Effective Date': '1/1/2026',
    'Policy Term Date': '',
    'Paid Through Date': '3/31/2026',
    'Member Date Of Birth': '9/9/1990',
    'Eligible for Commission': 'Yes',
    'Member Phone Number': '',
    'Member Email': '',
  },
];

const AMBETTER_CRM_POLICIES: CrmPolicy[] = [
  makePolicy({
    id: 'crm-sara',
    // Hand-entered lowercase — index normalization must still match it.
    policyNumber: 'u94753487',
    effectiveDate: '2026-02-01',
    status: 'ACTIVE_PLACED',
    'lead.name.firstName': 'Sara',
    'lead.name.lastName': 'Ghoston',
    'lead.dateOfBirth': '1963-12-30',
    'agent.name': 'Alexandria Marrero',
    'lead.phones.primaryPhoneNumber': '2149953244',
    'lead.emails.primaryEmail': 'ghostonsara8@gmail.com',
  }),
  makePolicy({
    id: 'crm-brittany',
    policyNumber: 'U71951365',
    effectiveDate: '2026-01-01',
    paidThroughDate: '2026-12-31',
    status: 'ACTIVE_PLACED',
    'lead.name.firstName': 'Brittany',
    'lead.name.lastName': 'Smith',
    'lead.dateOfBirth': '1985-06-04',
    'agent.name': 'Alexandria Marrero',
  }),
  makePolicy({
    id: 'crm-jeremy',
    policyNumber: 'U73500709',
    effectiveDate: '2026-01-01',
    paidThroughDate: '2025-12-31',
    status: 'ACTIVE_PLACED',
    'lead.name.firstName': 'Jeremy',
    'lead.name.lastName': 'Boudreaux',
    'lead.dateOfBirth': '1988-02-10',
    'agent.name': 'Alexandria Marrero',
    'lead.phones.primaryPhoneNumber': '9853340462',
    'lead.emails.primaryEmail': 'boudreauxjeremy40@gmail.com',
  }),
  makePolicy({
    // Prior-term version under the same U-number — the status engine must
    // stamp it for cancellation when the newer term is processed.
    id: 'crm-jeremy-old',
    policyNumber: 'U73500709',
    effectiveDate: '2025-01-01',
    expirationDate: '2025-12-31',
    status: 'CANCELED',
    'lead.name.firstName': 'Jeremy',
    'lead.name.lastName': 'Boudreaux',
    'lead.dateOfBirth': '1988-02-10',
    'agent.name': 'Alexandria Marrero',
  }),
];

// ===========================================================================
// Carrier 2: Oscar — pure config, no production code
// ===========================================================================

const OSCAR_COLUMN_MAPPING: ColumnMapping = {
  'Policy Ref': {
    crmField: 'policyNumber',
    fieldType: 'TEXT',
    fieldKey: 'policyNumber',
  },
  'Member ID': {
    crmField: 'applicationId',
    fieldType: 'TEXT',
    fieldKey: 'applicationId',
  },
  'First Name': {
    crmField: 'lead.name.firstName',
    fieldType: 'FULL_NAME',
    fieldKey: 'update:firstName-name (lead)',
  },
  Surname: {
    crmField: 'lead.name.lastName',
    fieldType: 'FULL_NAME',
    fieldKey: 'update:lastName-name (lead)',
  },
  'Date of Birth': {
    crmField: 'lead.dateOfBirth',
    fieldType: 'DATE',
    fieldKey: 'update:dateOfBirth (lead)',
  },
  Producer: {
    crmField: 'agent.name',
    fieldType: 'TEXT',
    fieldKey: 'update:name (agent)',
  },
  'Paid To': {
    crmField: 'paidThroughDate',
    fieldType: 'DATE',
    fieldKey: 'paidThroughDate',
  },
};

const OSCAR_COMPUTED_FIELDS: ComputedFieldDef[] = [
  {
    outputKey: 'True Start',
    method: 'maxDate',
    inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
    type: 'date',
    crmField: 'effectiveDate',
  },
];

const OSCAR_STATUS_FIELD_MAPPING: Record<string, string> = {
  effectiveDate: 'True Start',
  paidThroughDate: 'Paid To',
  termDate: 'Termed On',
  eligibleForCommission: 'Commissionable',
  brokerEffectiveDate: 'Broker Assigned',
  policyEffectiveDate: 'Coverage Start',
};

const oscarCarrierConfig = (): CarrierConfigRecord => ({
  id: 'carrier-config-oscar',
  name: 'Oscar',
  carrierId: null,
  parserVersion: null,
  fieldConfig: OSCAR_COMPUTED_FIELDS as unknown as Record<string, unknown>[],
  // No onboarding cutoff for Oscar — the Ambetter 2025-07-09 default is an
  // Omnia business-history constant, not a sensible cutoff here.
  matchingConfig: { startDate: null },
  statusConfig: {
    // Pragmatic choice (see file header): only 'ambetter-bob-v1' is
    // registered and Oscar shares its ACA status semantics, so the config
    // selects it. The unknown-id fail-fast is asserted separately below.
    engineId: AMBETTER_STATUS_ENGINE_ID,
    fieldMapping: OSCAR_STATUS_FIELD_MAPPING,
  },
  policyNumberPattern: '^OSC-',
  columnMapping: OSCAR_COLUMN_MAPPING,
  productMapping: null,
  transformRules: {
    dateFormats: ['DD/MM/YYYY'],
    booleanTrue: ['y'],
    booleanFalse: ['n'],
  },
});

const OSCAR_ROWS: ParsedRow[] = [
  {
    // DD/MM dates: '05/01/2026' = Jan 5; '28/02/2026' = Feb 28 (a parse
    // ERROR under Ambetter's MM/DD rules — month 28).
    'Policy Ref': 'OSC-1001',
    'Member ID': 'M-55821',
    'First Name': 'Amelia',
    Surname: 'Hart',
    'Date of Birth': '14/03/1991',
    Producer: 'Coastal Benefits Group',
    'Coverage Start': '05/01/2026',
    'Broker Assigned': '05/01/2026',
    'Termed On': '',
    'Paid To': '28/02/2026',
    Commissionable: 'Y',
  },
  {
    // Carrier-canceled member whose CRM book holds TWO terminal versions of
    // the same policy ref; True Start 2024-07-15 predates Ambetter's
    // startDate cutoff — Oscar's null startDate must still process it.
    'Policy Ref': 'OSC-1002',
    'Member ID': '',
    'First Name': 'Bruno',
    Surname: 'Keller',
    'Date of Birth': '12/11/1979',
    Producer: '',
    'Coverage Start': '01/06/2024',
    'Broker Assigned': '15/07/2024',
    'Termed On': '31/12/2025',
    'Paid To': '31/12/2025',
    Commissionable: 'N',
  },
  {
    // An Ambetter-style U-number inside an Oscar file → gated by '^OSC-'.
    'Policy Ref': 'U88112233',
    'Member ID': 'M-90000',
    'First Name': 'Tessa',
    Surname: 'Nguyen',
    'Date of Birth': '02/02/1992',
    Producer: '',
    'Coverage Start': '01/02/2026',
    'Broker Assigned': '01/02/2026',
    'Termed On': '',
    'Paid To': '28/02/2026',
    Commissionable: 'Y',
  },
];

const OSCAR_CRM_POLICIES: CrmPolicy[] = [
  makePolicy({
    id: 'crm-oscar-amelia',
    policyNumber: 'OSC-1001',
    effectiveDate: '2026-01-05',
    paidThroughDate: '2026-01-31',
    status: 'ACTIVE_PLACED',
    'lead.name.firstName': 'Amelia',
    'lead.name.lastName': 'Hart',
    'lead.dateOfBirth': '1991-03-14',
  }),
  makePolicy({
    id: 'crm-oscar-bruno-2024',
    policyNumber: 'OSC-1002',
    effectiveDate: '2024-07-15',
    status: 'CANCELED',
    'lead.name.firstName': 'Bruno',
    'lead.name.lastName': 'Keller',
    'lead.dateOfBirth': '1979-11-12',
  }),
  makePolicy({
    id: 'crm-oscar-bruno-2023',
    policyNumber: 'OSC-1002',
    effectiveDate: '2023-07-15',
    status: 'CANCELED',
    'lead.name.firstName': 'Bruno',
    'lead.name.lastName': 'Keller',
    'lead.dateOfBirth': '1979-11-12',
  }),
];

// ===========================================================================
// Tests
// ===========================================================================

describe('pipeline e2e — second-carrier acceptance (4.10)', () => {
  describe('Ambetter: seeded config over real BOB fixtures', () => {
    const result = runPipeline({
      carrierConfig: AMBETTER_CARRIER_CONFIG,
      rawRows: [...AMBETTER_REAL_ROWS, ...AMBETTER_EXTRA_ROWS],
      crmPolicies: AMBETTER_CRM_POLICIES,
    });

    it('runs the literal seed-command config (imported, not re-typed)', () => {
      expect(AMBETTER_CARRIER_CONFIG.columnMapping).toEqual(
        AMBETTER_COLUMN_MAPPING,
      );
      expect(AMBETTER_CARRIER_CONFIG.fieldConfig).toEqual(
        AMBETTER_COMPUTED_FIELDS,
      );
      expect(AMBETTER_CARRIER_CONFIG.statusConfig?.fieldMapping).toEqual(
        AMBETTER_STATUS_FIELD_MAPPING,
      );
      expect(AMBETTER_CARRIER_CONFIG.transformRules).toEqual(
        AMBETTER_TRANSFORM_RULES,
      );
      expect(AMBETTER_CARRIER_CONFIG.policyNumberPattern).toBe('^U');
      expect(result.pipelineConfig.statusEngineId).toBe(
        AMBETTER_STATUS_ENGINE_ID,
      );
      expect(result.pipelineConfig.matching.autoMatchThreshold).toBe(
        DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
      );
      expect(result.pipelineConfig.startDate).toBe('2025-07-09');
    });

    it('parses every row cleanly with all status roles resolved', () => {
      expect(result.parseErrors).toHaveLength(0);
      expect(result.roleValidation.unresolvedRequired).toHaveLength(0);
      expect(result.roleValidation.unresolvedOptional).toHaveLength(0);
      // Computed effective date (maxDate of broker/policy eff) drives the
      // cutoff, matching, status, and diff stages downstream.
      expect(result.normalized[0]['True Effective Date']).toBe('2026-02-01');
      expect(result.normalized[0]['Eligible for Commission']).toBe(false);
    });

    it('produces the expected pipeline stats (gates counted, confirmed skipped)', () => {
      expect(result.stats).toEqual({
        totalBobRows: 6,
        autoMatched: 3, // Sara, Brittany, Jeremy (tier-2, confidence 98)
        needsReview: 0,
        unmatched: 1, // Marcus
        confirmed: 1, // Brittany — no diffs, status agrees, no review item
        discrepanciesFound: 2, // Sara, Jeremy
        skippedBeforeStartDate: 1, // Dana — True Eff 2025-07-01 < 2025-07-09
        skippedInvalidPolicyNumber: 1, // Nadia — '73500709123' fails '^U'
      });
      expect(result.reviewItems).toHaveLength(3);
    });

    it('skips the fully-agreeing row as confirmed (no review item)', () => {
      expect(
        result.reviewItems.find(
          (r) => r.carrierPolicyNumber === 'U71951365',
        ),
      ).toBeUndefined();
    });

    it('cancel row (Sara): CANCELED status, cancel diffs, broker-eff audit flag, normalized policy match', () => {
      const sara = itemFor(result, 'U94753487');

      expect(sara).toMatchObject({
        category: 'UPDATE',
        matchMethod: 'POLICY_NUMBER_DATE_AGENT',
        confidence: 98,
        policyId: 'crm-sara',
        derivedStatus: 'CANCELED',
        currentCrmStatus: 'ACTIVE_PLACED',
        carrierPolicyNumber: 'U94753487',
        cancelPreviousPolicyId: null,
        // BOB 'U94753487' matched the hand-entered CRM 'u94753487'.
        name: 'U94753487 → u94753487',
      });
      expect(sara.confidence as number).toBeGreaterThanOrEqual(
        DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
      );
      expect(sara.statusChangeReason).toBe(
        'Not eligible for commission → Canceled (expire: 2026-02-01)',
      );

      expect(sara.flags).toEqual(['STATUS_CHANGE', 'BROKER_EFF_AUDIT']);
      expect(
        (sara.flagReasons as Record<string, string>).BROKER_EFF_AUDIT,
      ).toMatch(/Paid-thru 2021-08-31, broker effective 2026-02-01/);

      const diffs = diffsOf(sara);

      expect(diffs).toHaveLength(2);
      expect(diffs).toEqual([
        expect.objectContaining({
          field: 'status',
          crmField: 'status',
          action: 'COMPUTED',
          severity: 'CRITICAL',
          bobValue: 'CANCELED',
          crmValue: 'ACTIVE_PLACED',
          crmObjectType: 'policy',
        }),
        expect.objectContaining({
          field: 'expirationDate',
          crmField: 'expirationDate',
          action: 'COMPUTED',
          severity: 'CRITICAL',
          bobValue: '2026-02-01',
          crmValue: null,
        }),
      ]);
      // The stale pre-enrollment paid-through (2021-08-31 vs True Eff
      // 2026-02-01) must be suppressed, not proposed as a CRM write.
      expect(diffs.find((d) => d.crmField === 'paidThroughDate')).toBeUndefined();
    });

    it('payment-error row (Jeremy): multi-version narrowing, paid-through diff, cancel-previous stamps', () => {
      const jeremy = itemFor(result, 'U73500709');

      expect(jeremy).toMatchObject({
        category: 'UPDATE',
        matchMethod: 'POLICY_NUMBER_DATE_AGENT',
        confidence: 98,
        policyId: 'crm-jeremy',
        derivedStatus: 'PAYMENT_ERROR_ACTIVE_PLACED',
        currentCrmStatus: 'ACTIVE_PLACED',
        cancelPreviousPolicyId: 'crm-jeremy-old',
      });
      expect(jeremy.matchNotes).toContain(
        'disambiguated from 2 candidates by active status',
      );
      expect(jeremy.flags).toEqual(['STATUS_CHANGE', 'PAYMENT_ERROR']);

      const diffs = diffsOf(jeremy);

      expect(diffs).toHaveLength(3);
      expect(diffs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'status',
            action: 'COMPUTED',
            severity: 'CRITICAL',
            bobValue: 'PAYMENT_ERROR_ACTIVE_PLACED',
            crmValue: 'ACTIVE_PLACED',
          }),
          expect.objectContaining({
            field: 'Paid Through Date',
            crmField: 'paidThroughDate',
            action: 'UPDATE',
            severity: 'WARNING',
            bobValue: '2026-01-31',
            crmValue: '2025-12-31',
            crmObjectType: 'policy',
          }),
          expect.objectContaining({
            field: '__cancelPreviousPolicy',
            action: 'COMPUTED',
            severity: 'CRITICAL',
            bobValue: 'Canceled as of 2025-12-31',
            crmField: null,
            note: 'Previous policy crm-jeremy-old will be set to CANCELED',
          }),
        ]),
      );

      // Cancel stamps on the snapshot — read by the apply step.
      const snapshot = jeremy.bobRowSnapshot as Record<string, unknown>;

      expect(snapshot.__cancelPreviousPolicyId).toBe('crm-jeremy-old');
      expect(snapshot.__cancelExpireDate).toBe('2025-12-31');
    });

    it('unmatched row (Marcus): UNMATCHED category with active-not-in-CRM note', () => {
      const marcus = itemFor(result, 'U99999999');

      expect(marcus).toMatchObject({
        category: 'UNMATCHED',
        matchMethod: 'UNMATCHED',
        confidence: 0,
        policyId: null,
        fieldDiffs: null,
        derivedStatus: null,
        currentCrmStatus: null,
        cancelPreviousPolicyId: null,
        flags: [],
      });
      expect(marcus.matchNotes).toContain(
        'No CRM policy found for carrier policy "U99999999"',
      );
      expect(marcus.matchNotes).toContain(
        'ACTIVE policy not in CRM (broker eff 2026-01-01) — needs CRM record',
      );
    });
  });

  describe('Oscar: fictional second carrier, pure config', () => {
    const result = runPipeline({
      carrierConfig: oscarCarrierConfig(),
      rawRows: OSCAR_ROWS,
      crmPolicies: OSCAR_CRM_POLICIES,
    });

    it('parses DD/MM dates and Y/N booleans cleanly through transformRules', () => {
      expect(result.parseErrors).toHaveLength(0);
      expect(result.roleValidation.unresolvedRequired).toHaveLength(0);
      expect(result.roleValidation.unresolvedOptional).toHaveLength(0);

      // '05/01/2026' is Jan 5 for Oscar (DD/MM), not May 1.
      expect(result.normalized[0]['Coverage Start']).toBe('2026-01-05');
      // '28/02/2026' would be a parse error under Ambetter MM/DD rules.
      expect(result.normalized[0]['Paid To']).toBe('2026-02-28');
      expect(result.normalized[0]['Date of Birth']).toBe('1991-03-14');
      // Oscar's own computed field, fed by Oscar's own role mapping.
      expect(result.normalized[0]['True Start']).toBe('2026-01-05');
      // Y/N boolean vocabulary (Ambetter's yes/no would reject 'Y').
      expect(result.normalized[0].Commissionable).toBe(true);
      expect(result.normalized[1].Commissionable).toBe(false);
    });

    it('produces the expected pipeline stats from the same generic code paths', () => {
      expect(result.stats).toEqual({
        totalBobRows: 3,
        autoMatched: 1, // Amelia (tier-3, 95)
        needsReview: 1, // Bruno (recency-narrowed, capped at 84)
        unmatched: 0,
        confirmed: 0,
        discrepanciesFound: 2,
        skippedBeforeStartDate: 0, // startDate null — no Ambetter cutoff
        skippedInvalidPolicyNumber: 1, // 'U88112233' fails '^OSC-'
      });
      expect(result.reviewItems).toHaveLength(2);
    });

    it("gates policy refs by Oscar's own pattern, not Ambetter's '^U'", () => {
      const pattern = result.pipelineConfig.policyNumberPattern!;

      expect(pattern.test('OSC-1001')).toBe(true);
      // A valid Ambetter number is NOT a valid Oscar number.
      expect(pattern.test('U88112233')).toBe(false);
      expect(
        result.reviewItems.find((r) => r.carrierPolicyNumber === 'U88112233'),
      ).toBeUndefined();
    });

    it('payment-error row (Amelia): tier-3 auto-match, status + field diffs, flags', () => {
      const amelia = itemFor(result, 'OSC-1001');

      expect(amelia).toMatchObject({
        category: 'UPDATE',
        matchMethod: 'POLICY_NUMBER_PLUS_EFFECTIVE_DATE',
        confidence: 95,
        policyId: 'crm-oscar-amelia',
        derivedStatus: 'PAYMENT_ERROR_ACTIVE_PLACED',
        currentCrmStatus: 'ACTIVE_PLACED',
        cancelPreviousPolicyId: null,
        name: 'OSC-1001 → OSC-1001',
      });
      expect(amelia.confidence as number).toBeGreaterThanOrEqual(
        DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
      );
      expect(amelia.flags).toEqual(['STATUS_CHANGE', 'PAYMENT_ERROR']);
      expect(amelia.statusChangeReason).toMatch(
        /Placed \(paid through end of effective month \(2026-02-28\)\) with payment error/,
      );

      const diffs = diffsOf(amelia);

      expect(diffs).toHaveLength(3);
      expect(diffs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'status',
            crmField: 'status',
            action: 'COMPUTED',
            severity: 'CRITICAL',
            bobValue: 'PAYMENT_ERROR_ACTIVE_PLACED',
            crmValue: 'ACTIVE_PLACED',
          }),
          expect.objectContaining({
            field: 'Paid To',
            crmField: 'paidThroughDate',
            action: 'UPDATE',
            severity: 'WARNING',
            bobValue: '2026-02-28',
            crmValue: '2026-01-31',
            crmObjectType: 'policy',
          }),
          expect.objectContaining({
            field: 'Member ID',
            crmField: 'applicationId',
            action: 'UPDATE',
            severity: 'WARNING',
            bobValue: 'M-55821',
            crmValue: null,
          }),
        ]),
      );
    });

    it('canceled row (Bruno): recency narrowing capped below auto-match, broker-eff audit, terminal-to-terminal suppression', () => {
      const bruno = itemFor(result, 'OSC-1002');

      expect(bruno).toMatchObject({
        category: 'UPDATE',
        matchMethod: 'POLICY_NUMBER_NARROWED_RECENT',
        // Heuristic narrowing: confidence capped below the auto-match
        // threshold → NEEDS_REVIEW band.
        confidence: DEFAULT_MATCHING_CONFIG.autoMatchThreshold - 1,
        policyId: 'crm-oscar-bruno-2024',
        derivedStatus: 'CANCELED',
        currentCrmStatus: 'CANCELED',
        cancelPreviousPolicyId: null,
      });
      expect(bruno.confidence as number).toBeLessThan(
        DEFAULT_MATCHING_CONFIG.autoMatchThreshold,
      );
      expect(bruno.matchNotes).toContain(
        'disambiguated from 2 candidates by most recent effective date',
      );
      expect(bruno.matchNotes).toContain('recency narrowing is heuristic');

      expect(bruno.flags).toEqual(['BROKER_EFF_AUDIT']);
      expect(
        (bruno.flagReasons as Record<string, string>).BROKER_EFF_AUDIT,
      ).toBe(
        'Status CANCELED, broker effective 2024-07-15 > policy effective 2024-06-01',
      );

      // CANCELED → CANCELED is terminal-to-terminal: no status diff, no
      // expirationDate diff — only the real paid-through correction remains.
      const diffs = diffsOf(bruno);

      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toMatchObject({
        field: 'Paid To',
        crmField: 'paidThroughDate',
        action: 'UPDATE',
        severity: 'WARNING',
        bobValue: '2025-12-31',
        crmValue: null,
      });
    });

    it('processes pre-2025 rows because Oscar has no startDate cutoff', () => {
      // Bruno's True Start (2024-07-15) predates Ambetter's seeded
      // 2025-07-09 cutoff; with Oscar's startDate: null it still produced a
      // review item instead of being skipped.
      expect(result.pipelineConfig.startDate).toBeNull();
      expect(itemFor(result, 'OSC-1002')).toBeDefined();
    });
  });

  describe('carrier isolation: the same Oscar file under Ambetter transform rules', () => {
    const result = runPipeline({
      carrierConfig: {
        ...oscarCarrierConfig(),
        transformRules: AMBETTER_TRANSFORM_RULES as unknown as Record<
          string,
          unknown
        >,
      },
      rawRows: OSCAR_ROWS,
      crmPolicies: OSCAR_CRM_POLICIES,
    });

    it('DD/MM cells become loud parse errors instead of fabricated dates', () => {
      expect(result.parseErrors).toEqual(
        expect.arrayContaining([
          // '28/02/2026' — no month 28 under MM/DD.
          expect.objectContaining({
            rowNumber: 1,
            header: 'Paid To',
            error: expect.stringMatching(/Invalid month\/day/),
          }),
          // '14/03/1991' — no month 14 under MM/DD.
          expect.objectContaining({
            rowNumber: 1,
            header: 'Date of Birth',
            error: expect.stringMatching(/Invalid month\/day/),
          }),
          // 'Y' is not in Ambetter's yes/true/1 vocabulary.
          expect.objectContaining({
            rowNumber: 1,
            header: 'Commissionable',
            error: expect.stringMatching(/Unrecognized boolean/),
          }),
          // '31/12/2025' — no month 31 under MM/DD.
          expect.objectContaining({
            rowNumber: 2,
            header: 'Termed On',
            error: expect.stringMatching(/Invalid month\/day/),
          }),
        ]),
      );
      // Raw value preserved on the row (counted loudly, never silently null).
      expect(result.normalized[0]['Paid To']).toBe('28/02/2026');
    });

    it('a date valid under both formats silently flips meaning — the rules are load-bearing', () => {
      // '05/01/2026' is a real calendar date either way: May 1 under
      // Ambetter's MM/DD, Jan 5 under Oscar's DD/MM. Only the per-carrier
      // transformRules pick the right one.
      expect(result.normalized[0]['Coverage Start']).toBe('2026-05-01');
    });
  });

  describe('status-engine registry: shared engine + fail-fast on unknown ids', () => {
    it('documents the single registered engine Oscar reuses (no Oscar engine in prod)', () => {
      expect(STATUS_ENGINE_IDS).toEqual([AMBETTER_STATUS_ENGINE_ID]);
      expect(isKnownStatusEngine(AMBETTER_STATUS_ENGINE_ID)).toBe(true);
      expect(isKnownStatusEngine('oscar-bob-v1')).toBe(false);
    });

    it('a config selecting an unregistered engine id fails fast with the registry error', () => {
      const badConfig: CarrierConfigRecord = {
        ...oscarCarrierConfig(),
        statusConfig: {
          engineId: 'oscar-bob-v1',
          fieldMapping: OSCAR_STATUS_FIELD_MAPPING,
        },
      };

      expect(() =>
        runPipeline({
          carrierConfig: badConfig,
          rawRows: OSCAR_ROWS,
          crmPolicies: OSCAR_CRM_POLICIES,
        }),
      ).toThrow(
        'Unknown status engine id "oscar-bob-v1" on carrier config "Oscar". ' +
          `Known engines: ${AMBETTER_STATUS_ENGINE_ID}. ` +
          'Fix statusConfig.engineId on the carrier config and re-run.',
      );
    });

    it('deriveStatus never silently derives for unknown engine ids', () => {
      expect(
        deriveStatus(
          'oscar-bob-v1',
          {
            effectiveDate: '2026-01-05',
            paidThroughDate: '2026-02-28',
            termDate: null,
            eligibleForCommission: true,
          },
          [],
          TODAY,
        ),
      ).toBeNull();
    });
  });
});
