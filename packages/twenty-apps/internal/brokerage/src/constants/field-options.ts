type SelectFieldOptionColor =
  | 'green'
  | 'turquoise'
  | 'sky'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'gray';

type SelectFieldOption = {
  id: string;
  value: string;
  label: string;
  position: number;
  color: SelectFieldOptionColor;
};

export const AGENT_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: 'c0ccbdbe-5880-419d-a7b3-70ea856f59f9',
    value: 'ACTIVE',
    label: 'Active',
    position: 0,
    color: 'green',
  },
  {
    id: '1616f7b4-f802-4357-b09a-581fab56ec4b',
    value: 'PENDING',
    label: 'Pending',
    position: 1,
    color: 'yellow',
  },
  {
    id: 'ad9b5ba4-5d90-4536-bf46-252eef4f09a6',
    value: 'TERMINATED',
    label: 'Terminated',
    position: 2,
    color: 'red',
  },
  {
    id: '5c85c0a6-45bc-476d-9720-0cee6176a2ab',
    value: 'ICANN',
    label: 'ICANN',
    position: 3,
    color: 'gray',
  },
];

export const CALL_DIRECTION_OPTIONS: SelectFieldOption[] = [
  {
    id: 'af3ea6b2-9e3e-402e-9f9d-cf7b9d6ed7d9',
    value: 'INBOUND',
    label: 'Inbound',
    position: 0,
    color: 'gray',
  },
  {
    id: 'c643a220-58b1-489d-93a4-ec5654a8fde1',
    value: 'OUTBOUND',
    label: 'Outbound',
    position: 1,
    color: 'red',
  },
];

export const FAMILY_MEMBER_TYPE_OPTIONS: SelectFieldOption[] = [
  {
    id: 'd6a2008f-f434-4799-9170-328d4ed313a9',
    value: 'DEPENDENT',
    label: 'Dependent',
    position: 0,
    color: 'blue',
  },
  {
    id: 'e9c869a9-ae55-4ec1-8dc0-6169f2330831',
    value: 'SPOUSE',
    label: 'Spouse',
    position: 1,
    color: 'pink',
  },
];

export const LEAD_GENDER_OPTIONS: SelectFieldOption[] = [
  {
    id: '38c60890-6641-46e1-b4d8-f3e48027f566',
    value: 'MALE',
    label: 'Male',
    position: 0,
    color: 'blue',
  },
  {
    id: '2672d795-91ca-482a-b874-ca89a4184ccf',
    value: 'FEMALE',
    label: 'Female',
    position: 1,
    color: 'pink',
  },
  {
    id: 'f653a017-bfa0-46e4-84d4-87762f5720bf',
    value: 'NON_BINARY',
    label: 'Non-Binary',
    position: 2,
    color: 'purple',
  },
];

export const LEAD_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: '2a5590ed-5572-4ba4-9451-1364fd9826e5',
    value: 'IDLE',
    label: 'Idle',
    position: 0,
    color: 'gray',
  },
  {
    id: '4dd04cfd-6bc7-4a6d-ae2c-637dab0383c9',
    value: 'ASSIGNED',
    label: 'Assigned',
    position: 1,
    color: 'yellow',
  },
  {
    id: '05f0cd44-0bc4-405c-a961-5e42ea9c5044',
    value: 'CONTACTED',
    label: 'Contacted',
    position: 2,
    color: 'orange',
  },
  {
    id: '9054737b-ef2e-4e6c-86ec-47ccaa89ca53',
    value: 'SOLD',
    label: 'Sold',
    position: 3,
    color: 'green',
  },
];

export const POLICY_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: '0bdc091f-cfdb-46ad-8271-5b8ccfa6e339',
    value: 'ACTIVE',
    label: 'Active',
    position: 0,
    color: 'green',
  },
  {
    id: 'f85818e8-b538-4a12-882b-99dc5dcf8e74',
    value: 'ACTIVE_APPROVED',
    label: 'Active - Approved',
    position: 1,
    color: 'green',
  },
  {
    id: 'aef0fc36-fbf8-425a-9351-beb76933aa0d',
    value: 'ACTIVE_PLACED',
    label: 'Active - Placed',
    position: 2,
    color: 'green',
  },
  {
    id: 'c6ee775c-584d-4230-b679-bf486d82d41e',
    value: 'CANCELED',
    label: 'Canceled',
    position: 3,
    color: 'red',
  },
  {
    id: 'cba69263-eb50-49de-be0c-4d0913f227c7',
    value: 'DECLINED',
    label: 'Declined',
    position: 4,
    color: 'red',
  },
  {
    id: '901b0350-a0c5-48a4-b288-8b1b80914780',
    value: 'INCOMPLETE',
    label: 'Incomplete',
    position: 5,
    color: 'red',
  },
  {
    id: '85fd77b3-16f3-48c7-bd0c-b0e33e2c2bd7',
    value: 'PAYMENT_ERROR_ACTIVE_APPROVED',
    label: 'Payment Error - Active Approved',
    position: 6,
    color: 'orange',
  },
  {
    id: '983bce37-0d31-44b1-85fc-02395a9b8f66',
    value: 'PAYMENT_ERROR_ACTIVE_PLACED',
    label: 'Payment Error - Active Placed',
    position: 7,
    color: 'orange',
  },
  {
    id: 'a7b37b19-7687-45f1-9544-c9a5ad8edb6e',
    value: 'PAYMENT_ERROR_CANCELED',
    label: 'Payment Error - Canceled',
    position: 8,
    color: 'orange',
  },
  {
    id: '058a46ec-9f5f-4326-b3fa-be688387c1b8',
    value: 'PENDING',
    label: 'Pending',
    position: 9,
    color: 'yellow',
  },
  {
    id: '9d36e1c0-d851-4b3d-8ff1-ed066177908f',
    value: 'SUBMITTED',
    label: 'Submitted',
    position: 10,
    color: 'blue',
  },
];

export const STATE_OPTIONS: SelectFieldOption[] = [
  {
    id: 'bd816e67-3ea0-4399-b346-9c57ff9ebe99',
    value: 'ALABAMA',
    label: 'Alabama',
    position: 0,
    color: 'green',
  },
  {
    id: 'a86a37de-7d67-4e7c-85ba-e549c3ebad22',
    value: 'ALASKA',
    label: 'Alaska',
    position: 1,
    color: 'turquoise',
  },
  {
    id: 'c799771c-3486-48ec-b19b-400414f15b29',
    value: 'ARIZONA',
    label: 'Arizona',
    position: 2,
    color: 'sky',
  },
  {
    id: '5e14236f-8066-4d75-9e8f-ea64f20932a6',
    value: 'ARKANSAS',
    label: 'Arkansas',
    position: 3,
    color: 'blue',
  },
  {
    id: '9836f836-49b2-43ff-8a5c-a907c6ab5ebe',
    value: 'CALIFORNIA',
    label: 'California',
    position: 4,
    color: 'purple',
  },
  {
    id: '56d19f3d-73d2-48c8-8cf2-cfa9b4a2310e',
    value: 'COLORADO',
    label: 'Colorado',
    position: 5,
    color: 'pink',
  },
  {
    id: '906e1b4c-d158-4baa-b9cb-98bce41ef596',
    value: 'CONNECTICUT',
    label: 'Connecticut',
    position: 6,
    color: 'red',
  },
  {
    id: '2131bb20-4888-442d-a14c-25a05e906da8',
    value: 'DISTRICT_OF_COLUMBIA',
    label: 'District of Columbia',
    position: 7,
    color: 'orange',
  },
  {
    id: 'e790e61d-76f7-4cba-92cd-d2fac3c0b3f9',
    value: 'DELAWARE',
    label: 'Delaware',
    position: 8,
    color: 'yellow',
  },
  {
    id: '83451b2c-cb76-4209-8285-a4e4f599511a',
    value: 'FLORIDA',
    label: 'Florida',
    position: 9,
    color: 'gray',
  },
  {
    id: 'e357b658-7d11-4ca6-82ff-af08559ecaec',
    value: 'GEORGIA',
    label: 'Georgia',
    position: 10,
    color: 'green',
  },
  {
    id: '48c68821-2d27-423a-953b-f5f2fe51e4cb',
    value: 'HAWAII',
    label: 'Hawaii',
    position: 11,
    color: 'turquoise',
  },
  {
    id: 'f6850c3c-2db1-4fbc-826a-abd2dfca0f23',
    value: 'IDAHO',
    label: 'Idaho',
    position: 12,
    color: 'sky',
  },
  {
    id: '8c3ddec7-27a0-44c8-a519-5d4c97b39189',
    value: 'ILLINOIS',
    label: 'Illinois',
    position: 13,
    color: 'blue',
  },
  {
    id: '4ae01efa-879d-4b87-a4df-c277c23565fa',
    value: 'INDIANA',
    label: 'Indiana',
    position: 14,
    color: 'purple',
  },
  {
    id: '971edcaa-002e-4a1d-8471-da9388abb68a',
    value: 'IOWA',
    label: 'Iowa',
    position: 15,
    color: 'pink',
  },
  {
    id: '6c346b0a-5822-4e62-a5f2-a509914e517d',
    value: 'KANSAS',
    label: 'Kansas',
    position: 16,
    color: 'red',
  },
  {
    id: '2a720728-b5aa-485d-8672-ef07ebec7d15',
    value: 'KENTUCKY',
    label: 'Kentucky',
    position: 17,
    color: 'orange',
  },
  {
    id: '3123fe44-4691-4b35-8d48-f09e134f9e1b',
    value: 'LOUISIANA',
    label: 'Louisiana',
    position: 18,
    color: 'yellow',
  },
  {
    id: '056da90b-9b77-4986-b4a1-caac2a6062b8',
    value: 'MAINE',
    label: 'Maine',
    position: 19,
    color: 'gray',
  },
  {
    id: '9cdb1e0c-d8ce-4f44-9af8-cf7cfff86dc0',
    value: 'MARYLAND',
    label: 'Maryland',
    position: 20,
    color: 'green',
  },
  {
    id: '4b9bdc6a-5f95-4e33-aecf-4d1b8d65a48f',
    value: 'MASSACHUSETTS',
    label: 'Massachusetts',
    position: 21,
    color: 'turquoise',
  },
  {
    id: '5efe82ed-a31f-4e2e-8481-2834413bd60c',
    value: 'MICHIGAN',
    label: 'Michigan',
    position: 22,
    color: 'sky',
  },
  {
    id: '52ecb5d5-004b-46e4-a53c-70c0e5fe951d',
    value: 'MINNESOTA',
    label: 'Minnesota',
    position: 23,
    color: 'blue',
  },
  {
    id: '546c6792-2d4a-41a2-b6cc-42534e9be88c',
    value: 'MISSISSIPPI',
    label: 'Mississippi',
    position: 24,
    color: 'purple',
  },
  {
    id: '8899c0f8-20d1-4710-9c2e-0154a5ec51d8',
    value: 'MISSOURI',
    label: 'Missouri',
    position: 25,
    color: 'pink',
  },
  {
    id: 'ee5ac96f-ef5d-486f-acb7-8eb8ea7b8ba8',
    value: 'MONTANA',
    label: 'Montana',
    position: 26,
    color: 'red',
  },
  {
    id: 'e0dcc32d-98d3-43bc-b6a4-6527af2b8cda',
    value: 'NORTH_CAROLINA',
    label: 'North Carolina',
    position: 27,
    color: 'orange',
  },
  {
    id: 'fd9f4490-1e43-4d4e-a2a1-25ead6c97a2d',
    value: 'NORTH_DAKOTA',
    label: 'North Dakota',
    position: 28,
    color: 'yellow',
  },
  {
    id: '882d54ca-3052-42de-827c-42c58f6e585a',
    value: 'NEBRASKA',
    label: 'Nebraska',
    position: 29,
    color: 'gray',
  },
  {
    id: '8952c423-0150-4358-8763-c9a23d614ef3',
    value: 'NEW_HAMPSHIRE',
    label: 'New Hampshire',
    position: 30,
    color: 'green',
  },
  {
    id: 'ad204cd5-9413-4cf9-a991-012393eb4846',
    value: 'NEW_JERSEY',
    label: 'New Jersey',
    position: 31,
    color: 'turquoise',
  },
  {
    id: 'ad560138-825b-44ca-8505-a982873bc81f',
    value: 'NEW_MEXICO',
    label: 'New Mexico',
    position: 32,
    color: 'sky',
  },
  {
    id: '1a991434-d5f7-4aa8-a03d-d965b5facece',
    value: 'NEVADA',
    label: 'Nevada',
    position: 33,
    color: 'blue',
  },
  {
    id: '64b5aa2f-2a63-4fdc-baa4-e6b1b3f8f586',
    value: 'NEW_YORK',
    label: 'New York',
    position: 34,
    color: 'purple',
  },
  {
    id: '1c154b9d-3459-414f-a24d-997da11dc539',
    value: 'OHIO',
    label: 'Ohio',
    position: 35,
    color: 'pink',
  },
  {
    id: '6e59d7b2-c2a9-48c2-99b4-c2253fa0f7b7',
    value: 'OKLAHOMA',
    label: 'Oklahoma',
    position: 36,
    color: 'red',
  },
  {
    id: '17193cc4-5aa1-4bae-b1ad-2185d5185242',
    value: 'OREGON',
    label: 'Oregon',
    position: 37,
    color: 'orange',
  },
  {
    id: '72b36574-cc89-4e91-b8c6-e55bd8c85bd8',
    value: 'PENNSYLVANIA',
    label: 'Pennsylvania',
    position: 38,
    color: 'yellow',
  },
  {
    id: '63a80312-9c22-4f02-94b8-607fcbe1b644',
    value: 'RHODE_ISLAND',
    label: 'Rhode Island',
    position: 39,
    color: 'gray',
  },
  {
    id: 'ae0959d6-b124-4dad-adb8-463dd3a5f364',
    value: 'SOUTH_CAROLINA',
    label: 'South Carolina',
    position: 40,
    color: 'green',
  },
  {
    id: 'ca9b636a-3d1b-4b1c-99aa-895310ae0510',
    value: 'SOUTH_DAKOTA',
    label: 'South Dakota',
    position: 41,
    color: 'turquoise',
  },
  {
    id: 'b8aef2db-d84c-442e-910b-32a0da4e0a6e',
    value: 'TENNESSEE',
    label: 'Tennessee',
    position: 42,
    color: 'sky',
  },
  {
    id: 'c8d00de8-1ca1-428c-baaa-39c0bde0bdcb',
    value: 'TEXAS',
    label: 'Texas',
    position: 43,
    color: 'blue',
  },
  {
    id: '1a580943-17c9-4fff-b560-09862ed31c7d',
    value: 'UTAH',
    label: 'Utah',
    position: 44,
    color: 'purple',
  },
  {
    id: '3d26c4bf-94d7-4b12-87f0-c76993136629',
    value: 'VIRGINIA',
    label: 'Virginia',
    position: 45,
    color: 'pink',
  },
  {
    id: 'f4de991d-357b-45b4-852d-f4da7e0e7527',
    value: 'VERMONT',
    label: 'Vermont',
    position: 46,
    color: 'red',
  },
  {
    id: '7a3a43b3-361f-4c39-8a94-58c1a4a90de9',
    value: 'WASHINGTON',
    label: 'Washington',
    position: 47,
    color: 'orange',
  },
  {
    id: 'd371eb5d-4adf-4176-8b35-8e942a9dbc7b',
    value: 'WISCONSIN',
    label: 'Wisconsin',
    position: 48,
    color: 'yellow',
  },
  {
    id: 'aaffab59-4243-41c3-9437-160bffefc2c7',
    value: 'WEST_VIRGINIA',
    label: 'West Virginia',
    position: 49,
    color: 'gray',
  },
  {
    id: 'ad4768e7-c8c0-4af4-a853-cacc31ddfc47',
    value: 'WYOMING',
    label: 'Wyoming',
    position: 50,
    color: 'green',
  },
];
