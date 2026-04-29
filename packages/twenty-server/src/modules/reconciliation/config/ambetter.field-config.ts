/**
 * Ambetter field configuration — the single source of truth.
 *
 * This array defines every field in the Ambetter BOB pipeline:
 * - How to find it in the XLSX (columnAliases)
 * - How to transform the raw value (dataType)
 * - How to compute derived fields (computation + inputs)
 * - What CRM field it maps to for comparison/apply (crmField)
 * - How to compare BOB vs CRM values (compareMethod)
 * - What role it plays in matching and status engines
 *
 * Seeded to CarrierConfig.fieldConfig by seed-ambetter-carrier-config.command.ts.
 * Used directly by tests and as the fallback when CarrierConfig has no fieldConfig.
 */

import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';

export const AMBETTER_FIELD_CONFIG: FieldConfigEntry[] = [
  // ─── Policy ──────────────────────────────────────────
  {
    name: 'carrierPolicyNumber',
    label: 'Policy Number',
    dataType: 'text',
    columnAliases: ['Policy Number'],
    crmField: 'policyNumber',
    compareMethod: 'caseInsensitive',
    matchingRole: 'policyNumber',
  },
  {
    name: 'planName',
    label: 'Plan Name',
    dataType: 'text',
    columnAliases: ['Plan Name'],
    compareMethod: 'caseInsensitive',
  },
  {
    name: 'subscriberNumber',
    label: 'Subscriber ID',
    dataType: 'text',
    columnAliases: ['Exchange Subscriber ID'],
  },
  {
    name: 'onOffExchange',
    label: 'On/Off Exchange',
    dataType: 'text',
    columnAliases: ['On/Off Exchange'],
  },

  // ─── Identity ────────────────────────────────────────
  {
    name: 'memberFirstName',
    label: 'First Name',
    dataType: 'text',
    columnAliases: ['Insured First Name'],
    crmField: 'lead.name.firstName',
    compareMethod: 'fuzzyName',
    matchingRole: 'memberFirstName',
  },
  {
    name: 'memberLastName',
    label: 'Last Name',
    dataType: 'text',
    columnAliases: ['Insured Last Name'],
    crmField: 'lead.name.lastName',
    compareMethod: 'fuzzyName',
    matchingRole: 'memberLastName',
  },
  {
    name: 'memberDob',
    label: 'Date of Birth',
    dataType: 'date',
    columnAliases: ['Member Date Of Birth'],
    crmField: 'lead.dateOfBirth',
    compareMethod: 'exact',
    matchingRole: 'memberDob',
  },

  // ─── Agent ───────────────────────────────────────────
  {
    name: 'brokerName',
    label: 'Agent Name',
    dataType: 'text',
    columnAliases: ['Broker Name'],
    compareMethod: 'caseInsensitive',
    matchingRole: 'agentName',
  },
  {
    name: 'brokerNpn',
    label: 'Agent NPN',
    dataType: 'text',
    columnAliases: ['Broker NPN'],
    compareMethod: 'caseInsensitive',
    matchingRole: 'agentNpn',
  },
  {
    name: 'payableAgent',
    label: 'Payable Agent',
    dataType: 'text',
    columnAliases: ['Payable Agent'],
  },

  // ─── Dates ───────────────────────────────────────────
  {
    name: 'brokerEffectiveDate',
    label: 'Broker Effective Date',
    dataType: 'date',
    columnAliases: ['Broker Effective Date'],
  },
  {
    name: 'policyEffectiveDate',
    label: 'Policy Effective Date',
    dataType: 'date',
    columnAliases: ['Policy Effective Date'],
  },
  {
    name: 'trueEffectiveDate',
    label: 'Effective Date',
    dataType: 'date',
    computation: 'maxDate',
    inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
    crmField: 'effectiveDate',
    compareMethod: 'exact',
    matchingRole: 'effectiveDate',
    statusRole: 'effectiveDate',
  },
  {
    name: 'paidThroughDate',
    label: 'Paid Through Date',
    dataType: 'date',
    columnAliases: ['Paid Through Date'],
    statusRole: 'paidThroughDate',
  },
  {
    name: 'termDate',
    label: 'Term Date',
    dataType: 'date',
    columnAliases: ['Policy Term Date', 'Broker Term Date'],
    statusRole: 'termDate',
  },

  // ─── Eligibility (status-derivation input, not commission tracking) ───
  // Ambetter sets "Eligible for Commission" = No when a policy lapses.
  // The status engine reads this to derive CANCELED.
  {
    name: 'eligibleForCommission',
    label: 'Eligible for Commission',
    dataType: 'boolean',
    columnAliases: ['Eligible for Commission'],
    statusRole: 'eligibleForCommission',
  },

  // ─── Financial ───────────────────────────────────────
  {
    name: 'monthlyPremium',
    label: 'Monthly Premium',
    dataType: 'currency',
    columnAliases: ['Monthly Premium Amount'],
  },
  {
    name: 'memberResponsibility',
    label: 'Member Responsibility',
    dataType: 'currency',
    columnAliases: ['Member Responsibility'],
  },

  // ─── Contact ─────────────────────────────────────────
  {
    name: 'memberPhone',
    label: 'Phone',
    dataType: 'text',
    columnAliases: ['Member Phone Number'],
    compareMethod: 'caseInsensitive',
  },
  {
    name: 'memberEmail',
    label: 'Email',
    dataType: 'text',
    columnAliases: ['Member Email'],
    compareMethod: 'caseInsensitive',
  },

  // ─── Enrollment ──────────────────────────────────────
  {
    name: 'numberOfMembers',
    label: 'Number of Members',
    dataType: 'number',
    columnAliases: ['Number of Members'],
  },

  // ─── Location ────────────────────────────────────────
  {
    name: 'state',
    label: 'State',
    dataType: 'text',
    columnAliases: ['State'],
  },
  {
    name: 'county',
    label: 'County',
    dataType: 'text',
    columnAliases: ['County'],
  },
];
