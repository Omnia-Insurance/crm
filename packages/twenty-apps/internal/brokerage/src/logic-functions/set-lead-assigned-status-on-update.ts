import { defineLogicFunction } from 'twenty-sdk/define';
import {
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/logic-function';

import { BROKERAGE_SET_LEAD_ASSIGNED_STATUS_ON_UPDATE_FUNCTION_ID } from 'src/constants/universal-identifiers';
import { setLeadStatusToAssignedWhenAgentPresent } from 'src/utils/lead-status';

type LeadEventRecord = {
  id: string;
  assignedAgentId?: string | null;
  leadStatus?: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<LeadEventRecord>>,
) => {
  await setLeadStatusToAssignedWhenAgentPresent(payload.recordId);
};

export default defineLogicFunction({
  universalIdentifier: BROKERAGE_SET_LEAD_ASSIGNED_STATUS_ON_UPDATE_FUNCTION_ID,
  name: 'set-lead-assigned-status-on-update',
  description:
    'Sets Lead status to Assigned when Assigned Agent is added to an idle Lead.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'person.updated',
    updatedFields: ['assignedAgentId'],
  },
});
