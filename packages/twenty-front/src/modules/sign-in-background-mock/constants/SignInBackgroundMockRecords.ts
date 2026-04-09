import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

function createMockLeadSource(id: string, name: string) {
  return {
    __typename: 'LeadSource',
    id,
    name,
  };
}

function createMockAssignedAgent(
  id: string,
  firstName: string,
  lastName: string,
  userEmail: string,
) {
  return {
    __typename: 'WorkspaceMember',
    id,
    name: {
      __typename: 'FullName',
      firstName,
      lastName,
    },
    avatarUrl: null,
    userEmail,
  };
}

function createMockPolicy(id: string, name: string) {
  return {
    __typename: 'Policy',
    id,
    name,
  };
}

function createMockAddress(
  addressStreet1: string,
  addressCity: string,
  addressState: string,
  addressCountry = 'United States',
) {
  return {
    addressStreet1,
    addressStreet2: '',
    addressCity,
    addressState,
    addressPostcode: '',
    addressCountry,
  };
}

function createLeadRecord({
  id,
  firstName,
  lastName,
  status,
  email,
  phoneNumber,
  createdAt,
  leadSource,
  assignedAgent,
  policies,
  address,
}: {
  id: string;
  firstName: string;
  lastName: string;
  status: 'ASSIGNED' | 'CONTACTED' | 'SOLD';
  email: string;
  phoneNumber: string;
  createdAt: string;
  leadSource: ReturnType<typeof createMockLeadSource> | null;
  assignedAgent: ReturnType<typeof createMockAssignedAgent> | null;
  policies: ReturnType<typeof createMockPolicy>[];
  address?: ReturnType<typeof createMockAddress>;
}) {
  return {
    __typename: 'Person',
    id,
    name: {
      __typename: 'FullName',
      firstName,
      lastName,
    },
    status,
    emails: {
      __typename: 'Emails',
      primaryEmail: email,
      additionalEmails: [],
    },
    phones: {
      __typename: 'Phones',
      primaryPhoneNumber: phoneNumber,
      primaryPhoneCountryCode: 'US',
      primaryPhoneCallingCode: '+1',
      additionalPhones: [],
    },
    leadSource,
    leadSourceId: leadSource?.id ?? null,
    assignedAgent,
    assignedAgentId: assignedAgent?.id ?? null,
    policies,
    address: address ?? createMockAddress('', '', '', ''),
    avatarUrl: null,
    favorites: {
      __typename: 'FavoriteConnection',
      edges: [],
    },
    attachments: {
      __typename: 'AttachmentConnection',
      edges: [],
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export const SIGN_IN_BACKGROUND_MOCK_RECORDS: ObjectRecord[] = [
  createLeadRecord({
    id: 'sign-in-lead-1',
    firstName: 'Devan',
    lastName: 'Sisson',
    status: 'SOLD',
    email: 'devanleford@gmail.com',
    phoneNumber: '7063130920',
    createdAt: '2026-04-08T14:30:00.000Z',
    leadSource: createMockLeadSource('lead-source-website', 'Website'),
    assignedAgent: createMockAssignedAgent(
      'agent-alexandria-marrero',
      'Alexandria',
      'Marrero',
      'alexandria@omniaagent.com',
    ),
    policies: [
      createMockPolicy(
        'policy-uhc-accidentwise-10000',
        'UnitedHealth One - AccidentWise Plan 10000',
      ),
      createMockPolicy(
        'policy-uhc-criticalx',
        'UnitedHealth One - CriticalGuard Under 25k',
      ),
    ],
    address: createMockAddress('43 Vernon White Rd', 'Bradford', 'FL'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-2',
    firstName: 'Paulamen',
    lastName: 'Smith',
    status: 'SOLD',
    email: 'paulamenasmith@gmail.com',
    phoneNumber: '4705550110',
    createdAt: '2026-04-08T11:15:00.000Z',
    leadSource: createMockLeadSource(
      'lead-source-health-sherpa',
      'Health Sherpa',
    ),
    assignedAgent: createMockAssignedAgent(
      'agent-alexandria-marrero',
      'Alexandria',
      'Marrero',
      'alexandria@omniaagent.com',
    ),
    policies: [],
  }),
  createLeadRecord({
    id: 'sign-in-lead-3',
    firstName: 'Larry',
    lastName: 'Griffin',
    status: 'ASSIGNED',
    email: '',
    phoneNumber: '',
    createdAt: '2026-04-07T16:05:00.000Z',
    leadSource: createMockLeadSource('lead-source-referral', 'Referral'),
    assignedAgent: createMockAssignedAgent(
      'agent-rochae-spohn',
      'Rochae',
      'Spohn',
      'rochae@omniaagent.com',
    ),
    policies: [],
    address: createMockAddress('106 Railroad Street', 'Easley', 'SC'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-4',
    firstName: 'Monica',
    lastName: 'Marin',
    status: 'SOLD',
    email: 'monikmarin1972@outlook.com',
    phoneNumber: '4078668916',
    createdAt: '2026-04-07T09:45:00.000Z',
    leadSource: createMockLeadSource(
      'lead-source-agent-created',
      'Agent Created Leads',
    ),
    assignedAgent: createMockAssignedAgent(
      'agent-daniel-meneses',
      'Daniel',
      'Meneses',
      'daniel@omniaagent.com',
    ),
    policies: [
      createMockPolicy(
        'policy-uhc-critical-25',
        'UnitedHealth One - CriticalGuard Under 25k',
      ),
      createMockPolicy(
        'policy-uhc-accident',
        'UnitedHealth One - AccidentWise',
      ),
    ],
    address: createMockAddress('5872 Freshwater Canyon Dr', 'Orlando', 'FL'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-5',
    firstName: 'Jacoya',
    lastName: 'Miles',
    status: 'ASSIGNED',
    email: 'wmiles1975@gmail.com',
    phoneNumber: '2105551679',
    createdAt: '2026-04-06T15:20:00.000Z',
    leadSource: createMockLeadSource('lead-source-call-center', 'Call Center'),
    assignedAgent: createMockAssignedAgent(
      'agent-daniel-meneses',
      'Daniel',
      'Meneses',
      'daniel@omniaagent.com',
    ),
    policies: [],
    address: createMockAddress('122 Haley Bottoms Trl', 'Carbondale', 'IL'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-6',
    firstName: 'Rafael',
    lastName: 'Marin',
    status: 'SOLD',
    email: 'rafaelmarin1998@outlook.com',
    phoneNumber: '4079675537',
    createdAt: '2026-04-05T13:10:00.000Z',
    leadSource: createMockLeadSource('lead-source-facebook', 'Facebook'),
    assignedAgent: createMockAssignedAgent(
      'agent-rojan-turner',
      'Rojan',
      'Turner',
      'rojan@omniaagent.com',
    ),
    policies: [
      createMockPolicy('policy-ambetter-bronze-1', 'Ambetter - ACA - Bronze'),
    ],
    address: createMockAddress('22360 Mathis Rd', 'San Antonio', 'TX'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-7',
    firstName: 'Griselda',
    lastName: 'Garza',
    status: 'SOLD',
    email: 'garzagris21@gmail.com',
    phoneNumber: '2105516179',
    createdAt: '2026-04-04T10:40:00.000Z',
    leadSource: createMockLeadSource(
      'lead-source-health-sherpa',
      'Health Sherpa',
    ),
    assignedAgent: createMockAssignedAgent(
      'agent-daniel-meneses',
      'Daniel',
      'Meneses',
      'daniel@omniaagent.com',
    ),
    policies: [
      createMockPolicy(
        'policy-uhc-aca-gold',
        'UnitedHealthcare ACA - ACA - Gold',
      ),
    ],
    address: createMockAddress('201 County Rd 194', 'Coffeeville', 'MS'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-8',
    firstName: 'Jessica',
    lastName: 'Ieard',
    status: 'ASSIGNED',
    email: 'leard967@gmail.com',
    phoneNumber: '9856027485',
    createdAt: '2026-04-03T08:55:00.000Z',
    leadSource: createMockLeadSource('lead-source-website', 'Website'),
    assignedAgent: createMockAssignedAgent(
      'agent-chancelyn-archer',
      'Chancelyn',
      'Archer',
      'chancelyn@omniaagent.com',
    ),
    policies: [
      createMockPolicy('policy-ambetter-bronze-2', 'Ambetter - ACA - Bronze'),
    ],
    address: createMockAddress('6354 Wyndotte Rd', 'Pensacola', 'FL'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-9',
    firstName: 'Crystal',
    lastName: 'Perkins',
    status: 'SOLD',
    email: 'perkinscrystal32@gmail.com',
    phoneNumber: '8504288414',
    createdAt: '2026-04-02T14:15:00.000Z',
    leadSource: createMockLeadSource('lead-source-referral', 'Referral'),
    assignedAgent: createMockAssignedAgent(
      'agent-rochae-spohn',
      'Rochae',
      'Spohn',
      'rochae@omniaagent.com',
    ),
    policies: [
      createMockPolicy(
        'policy-visionwise-premier',
        'UnitedHealth One - VisionWise Premier',
      ),
    ],
    address: createMockAddress('8025 Baxter Springs Rd', 'Austin', 'TX'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-10',
    firstName: 'Sidney',
    lastName: 'Randel',
    status: 'CONTACTED',
    email: 'sidney.randel@gmail.com',
    phoneNumber: '5129470985',
    createdAt: '2026-04-01T12:45:00.000Z',
    leadSource: createMockLeadSource('lead-source-call-center', 'Call Center'),
    assignedAgent: createMockAssignedAgent(
      'agent-rojan-turner',
      'Rojan',
      'Turner',
      'rojan@omniaagent.com',
    ),
    policies: [
      createMockPolicy('policy-ambetter-silver-1', 'Ambetter - ACA - Silver'),
    ],
    address: createMockAddress('717 Mockingbird Ln', 'Houston', 'TX'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-11',
    firstName: 'Karen',
    lastName: 'Adams',
    status: 'ASSIGNED',
    email: 'adamsross33@gmail.com',
    phoneNumber: '5046183281',
    createdAt: '2026-03-31T16:20:00.000Z',
    leadSource: createMockLeadSource(
      'lead-source-agent-created',
      'Agent Created Leads',
    ),
    assignedAgent: createMockAssignedAgent(
      'agent-claudie-nader',
      'Claudie',
      'Nader',
      'claudie@omniaagent.com',
    ),
    policies: [
      createMockPolicy('policy-ambetter-bronze-3', 'Ambetter - ACA - Bronze'),
    ],
    address: createMockAddress('30 Old Crawford Hwy', 'Pryor', 'OK'),
  }),
  createLeadRecord({
    id: 'sign-in-lead-12',
    firstName: 'Alisha',
    lastName: 'Spikes',
    status: 'ASSIGNED',
    email: 'alishaspikes77@gmail.com',
    phoneNumber: '3347393803',
    createdAt: '2026-03-30T09:35:00.000Z',
    leadSource: createMockLeadSource('lead-source-facebook', 'Facebook'),
    assignedAgent: createMockAssignedAgent(
      'agent-kevin-desku',
      'Kevin',
      'Desku',
      'kevin@omniaagent.com',
    ),
    policies: [
      createMockPolicy(
        'policy-bcbs-gold',
        'Blue Cross Blue Shield - ACA - Gold',
      ),
    ],
    address: createMockAddress('7868 Hamel St', 'Houston', 'TX'),
  }),
];
