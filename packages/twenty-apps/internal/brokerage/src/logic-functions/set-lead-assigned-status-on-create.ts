import { defineLogicFunction } from 'twenty-sdk/define';
import {
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/logic-function';

import { BROKERAGE_SET_LEAD_ASSIGNED_STATUS_ON_CREATE_FUNCTION_ID } from 'src/constants/universal-identifiers';
import { setLeadStatusToAssignedWhenAgentPresent } from 'src/utils/lead-status';

type LeadEventRecord = {
  id: string;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<LeadEventRecord>>,
) => {
  await setLeadStatusToAssignedWhenAgentPresent(payload.recordId);
};

export default defineLogicFunction({
  universalIdentifier: BROKERAGE_SET_LEAD_ASSIGNED_STATUS_ON_CREATE_FUNCTION_ID,
  name: 'set-lead-assigned-status-on-create',
  description:
    'Sets Lead status to Assigned when a created Lead has an assigned Agent.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'person.created',
  },
});
