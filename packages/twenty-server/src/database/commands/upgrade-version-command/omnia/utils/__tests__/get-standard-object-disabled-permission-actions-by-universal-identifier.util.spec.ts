import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { getStandardObjectDisabledPermissionActionsByUniversalIdentifier } from 'src/database/commands/upgrade-version-command/omnia/utils/get-standard-object-disabled-permission-actions-by-universal-identifier.util';
import {
  PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS,
  PLATFORM_WRITTEN_DISABLED_OBJECT_PERMISSION_ACTIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-disabled-object-permission-actions.constant';

describe('getStandardObjectDisabledPermissionActionsByUniversalIdentifier', () => {
  const expectedDisabledActionsByUniversalIdentifier =
    getStandardObjectDisabledPermissionActionsByUniversalIdentifier();

  it.each([
    'recordShare',
    'shortLink',
    'agentMessageReaction',
    'campaignDelivery',
    'messageSuppression',
  ] as const)('locks every record action on %s', (objectName) => {
    expect(
      expectedDisabledActionsByUniversalIdentifier[
        STANDARD_OBJECTS[objectName].universalIdentifier
      ],
    ).toEqual(PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS);
  });

  it('locks writes on agentChatThreadParticipant', () => {
    expect(
      expectedDisabledActionsByUniversalIdentifier[
        STANDARD_OBJECTS.agentChatThreadParticipant.universalIdentifier
      ],
    ).toEqual(PLATFORM_WRITTEN_DISABLED_OBJECT_PERMISSION_ACTIONS);
  });

  it('leaves objects users work with out of the map', () => {
    expect(
      expectedDisabledActionsByUniversalIdentifier[
        STANDARD_OBJECTS.person.universalIdentifier
      ],
    ).toBeUndefined();
  });
});
