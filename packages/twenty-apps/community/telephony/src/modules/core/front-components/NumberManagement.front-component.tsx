import { defineFrontComponent } from 'twenty-sdk/define';
import { targetObjectWritePermissions } from 'twenty-sdk/front-component';

import { NumberManagement } from 'src/modules/core/components/NumberManagement/NumberManagement';

// CSO-facing settings UI for buying / assigning / reassigning telephony
// numbers. Mounted as a GLOBAL command (Cmd+K → "Manage telephony
// numbers"). Lives in a side panel because the SDK's primary mount
// surfaces are side panels and command-driven flows; if this grows beyond
// the panel width we can promote it to a full page layout in v1.1.

const NUMBER_MANAGEMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  '13a7bf2f-9fa0-4158-82a8-b9e5c41603d7';

const NUMBER_MANAGEMENT_COMMAND_UNIVERSAL_IDENTIFIER =
  '746768c3-0427-483d-b8b9-857c0232de8b';

export default defineFrontComponent({
  universalIdentifier:
    NUMBER_MANAGEMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'Telephony Numbers',
  description:
    'Buy phone numbers from the configured provider and assign / reassign them to workspace members. Append-only assignment history preserves call + SMS attribution across reassignments.',
  component: NumberManagement,
  command: {
    universalIdentifier: NUMBER_MANAGEMENT_COMMAND_UNIVERSAL_IDENTIFIER,
    label: 'Manage telephony numbers',
    icon: 'IconUserPlus',
    isPinned: false,
    availabilityType: 'GLOBAL',
    // Gate to roles with write access to phoneNumber. The Telephony default
    // role grants this; member-only roles don't, so non-admins won't see
    // the command in Cmd+K. The underlying mutations would also be denied
    // server-side, but hiding the UI prevents confused clicks.
    conditionalAvailabilityExpression:
      targetObjectWritePermissions.phoneNumber === true,
  },
});
