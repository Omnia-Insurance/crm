import { defineFrontComponent } from 'twenty-sdk/define';
import { targetObjectReadPermissions } from 'twenty-sdk/front-component';

import { Softphone } from 'src/modules/core/components/Softphone/Softphone';

// Wires the Softphone into Twenty's command system as a globally-available
// command. Cmd+K → "Softphone" opens it in a side panel; the panel persists
// across navigation so an in-progress call doesn't drop when the agent
// browses to another record.

const SOFTPHONE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  '31069075-0ea1-4f05-a753-758f3eb2fd80';

const SOFTPHONE_COMMAND_UNIVERSAL_IDENTIFIER =
  '2616cd80-c41b-47ff-a100-d88cf38760e9';

export default defineFrontComponent({
  universalIdentifier: SOFTPHONE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'Softphone',
  description:
    'Browser-based softphone (Twilio Voice JS SDK). Place outbound calls and receive inbound calls without leaving the CRM.',
  component: Softphone,
  command: {
    universalIdentifier: SOFTPHONE_COMMAND_UNIVERSAL_IDENTIFIER,
    label: 'Softphone',
    icon: 'IconPhone',
    isPinned: true,
    availabilityType: 'GLOBAL',
    // Visible to anyone with read access to phoneNumber — i.e. members of
    // the Telephony role. Users outside that role don't see the command in
    // Cmd+K and the click-to-call cell action stays hidden because
    // `canDial` derives from the same Apollo cache lookup.
    conditionalAvailabilityExpression:
      targetObjectReadPermissions.phoneNumber === true,
  },
});
