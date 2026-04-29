type ColumnMapping = Record<string, string[]>;

/**
 * Default column mapping for Ambetter Book-of-Business exports.
 * Maps canonical field names to the actual column headers found in Ambetter
 * xlsx sheets. Consumed by the Ambetter carrier-config seed.
 */
export const DEFAULT_AMBETTER_COLUMN_MAPPING: ColumnMapping = {
  carrierPolicyNumber: ['Policy Number'],
  brokerName: ['Broker Name'],
  brokerNpn: ['Broker NPN'],
  brokerEffectiveDate: ['Broker Effective Date'],
  policyEffectiveDate: ['Policy Effective Date'],
  policyTermDate: ['Policy Term Date', 'Broker Term Date'],
  paidThroughDate: ['Paid Through Date'],
  memberFirstName: ['Insured First Name'],
  memberLastName: ['Insured Last Name'],
  memberDob: ['Member Date Of Birth'],
  eligibleForCommission: ['Eligible for Commission'],
  planName: ['Plan Name'],
  monthlyPremium: ['Monthly Premium Amount'],
  memberResponsibility: ['Member Responsibility'],
  memberPhone: ['Member Phone Number'],
  memberEmail: ['Member Email'],
  subscriberNumber: ['Exchange Subscriber ID'],
  numberOfMembers: ['Number of Members'],
  payableAgent: ['Payable Agent'],
  onOffExchange: ['On/Off Exchange'],
  county: ['County'],
  state: ['State'],
};
