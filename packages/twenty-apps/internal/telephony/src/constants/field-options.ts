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

export const TELEPHONY_CAMPAIGN_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: '14e4f8c9-616e-41b9-b399-707c71067049',
    value: 'DRAFT',
    label: 'Draft',
    position: 0,
    color: 'gray',
  },
  {
    id: 'ef0b4f96-df37-41dd-a78c-3f1b8ce0ab47',
    value: 'ACTIVE',
    label: 'Active',
    position: 1,
    color: 'green',
  },
  {
    id: 'a022c4c6-55d6-4844-b194-c6dee6074198',
    value: 'PAUSED',
    label: 'Paused',
    position: 2,
    color: 'yellow',
  },
  {
    id: 'e34c1ee4-9aa0-4724-8581-3419da0bc64e',
    value: 'COMPLETED',
    label: 'Completed',
    position: 3,
    color: 'blue',
  },
  {
    id: '63be8731-cef7-428a-a5d2-6507b0eecf75',
    value: 'ARCHIVED',
    label: 'Archived',
    position: 4,
    color: 'gray',
  },
];

export const TELEPHONY_CAMPAIGN_LEAD_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: '877a5e20-fad3-4e0f-9252-9f034ca573dc',
    value: 'READY',
    label: 'Ready',
    position: 0,
    color: 'green',
  },
  {
    id: '636858d9-d295-4009-ab18-b9149a5bca9f',
    value: 'LOCKED',
    label: 'Locked',
    position: 1,
    color: 'yellow',
  },
  {
    id: 'cd8397e3-740c-4305-ade3-eed7bc7d0b33',
    value: 'CALLING',
    label: 'Calling',
    position: 2,
    color: 'blue',
  },
  {
    id: '63620c8b-4c90-45a3-a393-12b39c6a339e',
    value: 'CALLBACK',
    label: 'Callback',
    position: 3,
    color: 'purple',
  },
  {
    id: 'c54794ff-9e41-4e72-bbd4-ab4e922fe3e0',
    value: 'RETRY_WAIT',
    label: 'Retry wait',
    position: 4,
    color: 'orange',
  },
  {
    id: 'ce8090af-fe31-4f86-9e8e-79183b453141',
    value: 'COMPLETED',
    label: 'Completed',
    position: 5,
    color: 'green',
  },
  {
    id: '294df275-7304-4c79-a832-43b8d4aa8dce',
    value: 'DNC_BLOCKED',
    label: 'DNC blocked',
    position: 6,
    color: 'red',
  },
  {
    id: '10931f49-b268-493f-8f48-74d6c201a114',
    value: 'TIME_WINDOW_BLOCKED',
    label: 'Time blocked',
    position: 7,
    color: 'orange',
  },
  {
    id: 'e637e4ed-b7e0-4eed-93d3-d2a38756c6e0',
    value: 'EXHAUSTED',
    label: 'Exhausted',
    position: 8,
    color: 'gray',
  },
];

export const TELEPHONY_DISPOSITION_CATEGORY_OPTIONS: SelectFieldOption[] = [
  {
    id: '5fde0164-4e69-4e06-9fda-7098136599a3',
    value: 'CONTACT',
    label: 'Contact',
    position: 0,
    color: 'green',
  },
  {
    id: 'd760cbed-4448-4487-ae8a-d4b6be732f12',
    value: 'NO_CONTACT',
    label: 'No contact',
    position: 1,
    color: 'gray',
  },
  {
    id: 'fa7809e2-b725-4d37-a939-ed2e660b7e7e',
    value: 'CALLBACK',
    label: 'Callback',
    position: 2,
    color: 'purple',
  },
  {
    id: 'b28f6046-dbff-480c-acfe-8e4177a73d73',
    value: 'DNC',
    label: 'DNC',
    position: 3,
    color: 'red',
  },
  {
    id: '6287bcba-050a-4e69-906f-a6502f999f03',
    value: 'SALE',
    label: 'Sale',
    position: 4,
    color: 'green',
  },
  {
    id: 'c4f5afbb-bb33-4b28-97da-42c99bb56019',
    value: 'NOT_INTERESTED',
    label: 'Not interested',
    position: 5,
    color: 'orange',
  },
  {
    id: '9475dc38-d747-4d94-b760-79b4985104d1',
    value: 'BAD_NUMBER',
    label: 'Bad number',
    position: 6,
    color: 'red',
  },
];

export const TELEPHONY_CALL_DIRECTION_OPTIONS: SelectFieldOption[] = [
  {
    id: 'c9829efe-73e0-4c4e-afc8-5d9b9f7ecfbd',
    value: 'OUTBOUND',
    label: 'Outbound',
    position: 0,
    color: 'blue',
  },
  {
    id: 'a2d30481-6520-4c2f-b334-118829431668',
    value: 'INBOUND',
    label: 'Inbound',
    position: 1,
    color: 'green',
  },
];

export const TELEPHONY_CALL_SESSION_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: '4bd54011-38e4-4144-83c1-ddbb8a175327',
    value: 'RESERVED',
    label: 'Reserved',
    position: 0,
    color: 'gray',
  },
  {
    id: '1b8e0ea7-98f7-4a08-b893-ec14cf3298ce',
    value: 'OFFERED',
    label: 'Offered',
    position: 1,
    color: 'yellow',
  },
  {
    id: 'c9fb3d07-12ef-4357-85bf-4ff87e888062',
    value: 'DIALING',
    label: 'Dialing',
    position: 2,
    color: 'blue',
  },
  {
    id: 'e2f352e8-4a2b-4d0f-9ef1-46344df2962f',
    value: 'RINGING',
    label: 'Ringing',
    position: 3,
    color: 'yellow',
  },
  {
    id: '1d4f538a-7a5d-4e87-9be8-c4511f739735',
    value: 'IN_PROGRESS',
    label: 'In progress',
    position: 4,
    color: 'blue',
  },
  {
    id: '59230e8e-b189-4be7-89c5-4be41f6d3af5',
    value: 'COMPLETED',
    label: 'Completed',
    position: 5,
    color: 'green',
  },
  {
    id: '242e3c80-7898-4f63-8dc4-fb0ff5d76d12',
    value: 'FAILED',
    label: 'Failed',
    position: 6,
    color: 'red',
  },
  {
    id: '17959ed2-ce19-46a5-b5a7-45dcd55e6647',
    value: 'MISSED',
    label: 'Missed',
    position: 7,
    color: 'orange',
  },
  {
    id: 'f14671f9-05da-4cab-888c-cc54bd884586',
    value: 'DISPOSITIONED',
    label: 'Dispositioned',
    position: 8,
    color: 'green',
  },
];

export const TELEPHONY_CALL_EVENT_TYPE_OPTIONS: SelectFieldOption[] = [
  {
    id: 'cb95ba37-4565-46d3-b82e-7f13783b86e5',
    value: 'ROUTED',
    label: 'Routed',
    position: 0,
    color: 'blue',
  },
  {
    id: '4bb8804b-33f6-427b-ae20-b2709bcd3104',
    value: 'LOCKED',
    label: 'Locked',
    position: 1,
    color: 'yellow',
  },
  {
    id: '11b88b79-d984-4381-8080-a2907148cd33',
    value: 'RELEASED',
    label: 'Released',
    position: 2,
    color: 'gray',
  },
  {
    id: 'ff9371e9-efc3-4d9b-adf0-852ec7e95fe1',
    value: 'DIALING',
    label: 'Dialing',
    position: 3,
    color: 'blue',
  },
  {
    id: '6702e3ca-2c95-4df6-a6c1-fd1506c8c8b3',
    value: 'RINGING',
    label: 'Ringing',
    position: 4,
    color: 'yellow',
  },
  {
    id: '87af17f3-bc18-48d2-bbe4-1ebfd01cad8e',
    value: 'ANSWERED',
    label: 'Answered',
    position: 5,
    color: 'green',
  },
  {
    id: 'a5b93ba0-4889-4ce9-b198-a1ba6a1a15bf',
    value: 'COMPLETED',
    label: 'Completed',
    position: 6,
    color: 'green',
  },
  {
    id: '2703680d-a6d7-44df-b81c-42e75e7f11ea',
    value: 'FAILED',
    label: 'Failed',
    position: 7,
    color: 'red',
  },
  {
    id: '6e842f0b-6078-4324-b55d-34d651d5c095',
    value: 'RECORDING_READY',
    label: 'Recording ready',
    position: 8,
    color: 'purple',
  },
  {
    id: 'b5d8540c-30a8-4ce4-8bb6-f65308e904df',
    value: 'BLOCKED_ATTEMPT',
    label: 'Blocked attempt',
    position: 9,
    color: 'red',
  },
  {
    id: 'a297a008-2ffd-4510-9147-3130f0d6a8b5',
    value: 'INBOUND_OFFERED',
    label: 'Inbound offered',
    position: 10,
    color: 'turquoise',
  },
  {
    id: '63d7ba05-3bc6-4345-b9d6-a1f859f253ce',
    value: 'INBOUND_MISSED',
    label: 'Inbound missed',
    position: 11,
    color: 'orange',
  },
  {
    id: '540325b6-4fde-43ad-8a48-52f8c170ce21',
    value: 'DISPOSITION_SUBMITTED',
    label: 'Disposition submitted',
    position: 12,
    color: 'green',
  },
];

export const TELEPHONY_AGENT_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: 'f0b7b665-0604-4b5d-a8bc-188301671633',
    value: 'READY',
    label: 'Ready',
    position: 0,
    color: 'green',
  },
  {
    id: '1daed8db-f9c5-4376-91ce-ef6e9675af01',
    value: 'BREAK',
    label: 'Break',
    position: 1,
    color: 'yellow',
  },
  {
    id: 'fd163327-e927-43c1-aec2-0db1fbe69f2c',
    value: 'LUNCH',
    label: 'Lunch',
    position: 2,
    color: 'orange',
  },
  {
    id: 'c25a09ef-38ec-4c13-b790-1ac75e9a0634',
    value: 'TRAINING',
    label: 'Training',
    position: 3,
    color: 'purple',
  },
  {
    id: '1362eca5-aa9c-4322-bcee-042514c3ac2e',
    value: 'OFFLINE',
    label: 'Offline',
    position: 4,
    color: 'gray',
  },
];

export const TELEPHONY_INBOUND_QUEUE_STATUS_OPTIONS: SelectFieldOption[] = [
  {
    id: 'bd5cb081-303b-49a5-b240-54acdb8288d0',
    value: 'ACTIVE',
    label: 'Active',
    position: 0,
    color: 'green',
  },
  {
    id: '8ef3c31c-8b9e-477d-8b24-27f6f4b3a989',
    value: 'PAUSED',
    label: 'Paused',
    position: 1,
    color: 'yellow',
  },
  {
    id: '9fa65785-8da6-4c76-ab44-9f1455e640c0',
    value: 'DISABLED',
    label: 'Disabled',
    position: 2,
    color: 'gray',
  },
];

export const TELEPHONY_RECORDING_POLICY_OPTIONS: SelectFieldOption[] = [
  {
    id: '77e5c926-310e-4041-9f07-b72b29fed198',
    value: 'RECORD_ALL',
    label: 'Record all',
    position: 0,
    color: 'green',
  },
  {
    id: 'bf510ac3-5457-4053-b873-0722ed352df5',
    value: 'DO_NOT_RECORD',
    label: 'Do not record',
    position: 1,
    color: 'gray',
  },
];
