/**
 * Pipeline field schema — the fixed set of fields the reconciliation pipeline
 * can process. Defines names, labels, data types, CRM field paths, engine
 * roles, compare methods, and computed field rules.
 *
 * This is pipeline logic, NOT per-carrier configuration. Column aliases
 * (which XLSX headers map to which fields) are per-carrier and stored on
 * carrierConfig.fieldConfig — populated by the import dialog.
 */

import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';

export const PIPELINE_FIELD_SCHEMA: Omit<FieldConfigEntry, 'columnAliases'>[] = [
  // ─── Policy ──────────────────────────────────────────
  {
    name: 'carrierPolicyNumber',
    label: 'Policy Number',
    dataType: 'text',
    crmField: 'policyNumber',
    compareMethod: 'caseInsensitive',
    matchingRole: 'policyNumber',
  },
  {
    name: 'planName',
    label: 'Plan Name',
    dataType: 'text',
    compareMethod: 'caseInsensitive',
  },
  {
    name: 'subscriberNumber',
    label: 'Subscriber ID',
    dataType: 'text',
  },
  {
    name: 'onOffExchange',
    label: 'On/Off Exchange',
    dataType: 'text',
  },

  // ─── Identity ────────────────────────────────────────
  {
    name: 'memberFirstName',
    label: 'First Name',
    dataType: 'text',
    crmField: 'lead.name.firstName',
    compareMethod: 'fuzzyName',
    matchingRole: 'memberFirstName',
  },
  {
    name: 'memberLastName',
    label: 'Last Name',
    dataType: 'text',
    crmField: 'lead.name.lastName',
    compareMethod: 'fuzzyName',
    matchingRole: 'memberLastName',
  },
  {
    name: 'memberDob',
    label: 'Date of Birth',
    dataType: 'date',
    crmField: 'lead.dateOfBirth',
    compareMethod: 'exact',
    matchingRole: 'memberDob',
  },

  // ─── Agent ───────────────────────────────────────────
  {
    name: 'brokerName',
    label: 'Agent Name',
    dataType: 'text',
    compareMethod: 'caseInsensitive',
    matchingRole: 'agentName',
  },
  {
    name: 'brokerNpn',
    label: 'Agent NPN',
    dataType: 'text',
    compareMethod: 'caseInsensitive',
    matchingRole: 'agentNpn',
  },
  {
    name: 'payableAgent',
    label: 'Payable Agent',
    dataType: 'text',
  },

  // ─── Dates ───────────────────────────────────────────
  {
    name: 'brokerEffectiveDate',
    label: 'Broker Effective Date',
    dataType: 'date',
  },
  {
    name: 'policyEffectiveDate',
    label: 'Policy Effective Date',
    dataType: 'date',
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
    statusRole: 'paidThroughDate',
  },
  {
    name: 'termDate',
    label: 'Term Date',
    dataType: 'date',
    statusRole: 'termDate',
  },

  // ─── Commission ──────────────────────────────────────
  {
    name: 'eligibleForCommission',
    label: 'Eligible for Commission',
    dataType: 'boolean',
    statusRole: 'eligibleForCommission',
  },

  // ─── Financial ───────────────────────────────────────
  {
    name: 'monthlyPremium',
    label: 'Monthly Premium',
    dataType: 'currency',
  },
  {
    name: 'memberResponsibility',
    label: 'Member Responsibility',
    dataType: 'currency',
  },

  // ─── Contact ─────────────────────────────────────────
  {
    name: 'memberPhone',
    label: 'Phone',
    dataType: 'text',
    compareMethod: 'caseInsensitive',
  },
  {
    name: 'memberEmail',
    label: 'Email',
    dataType: 'text',
    compareMethod: 'caseInsensitive',
  },

  // ─── Enrollment ──────────────────────────────────────
  {
    name: 'numberOfMembers',
    label: 'Number of Members',
    dataType: 'number',
  },

  // ─── Location ────────────────────────────────────────
  {
    name: 'state',
    label: 'State',
    dataType: 'text',
  },
  {
    name: 'county',
    label: 'County',
    dataType: 'text',
  },
];
