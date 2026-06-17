import { defineView, ViewSortDirection } from 'twenty-sdk/define';

import {
  TAP_AGENT_FIELD_ID,
  TAP_CURRENT_CALL_SESSION_FIELD_ID,
  TAP_LAST_HEARTBEAT_AT_FIELD_ID,
  TAP_NAME_FIELD_ID,
  TAP_STATUS_FIELD_ID,
  TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  TELEPHONY_AGENT_PRESENCE_VIEW_ID,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: TELEPHONY_AGENT_PRESENCE_VIEW_ID,
  name: 'Agent Presence',
  objectUniversalIdentifier: TELEPHONY_AGENT_PRESENCE_OBJECT_ID,
  icon: 'IconUserCheck',
  position: 1,
  fields: [
    {
      universalIdentifier: 'ee3e0a2e-aa6e-4ea1-a8a5-72280096f4a8',
      fieldMetadataUniversalIdentifier: TAP_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '8e116fc0-5c1a-4eb8-994b-accc27c4ca81',
      fieldMetadataUniversalIdentifier: TAP_STATUS_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: 'ec56443e-3597-4174-b195-81b15424c449',
      fieldMetadataUniversalIdentifier: TAP_LAST_HEARTBEAT_AT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 2,
    },
    {
      universalIdentifier: 'ea7c8204-a5c6-45f4-a9b3-bc0a78ffa9b9',
      fieldMetadataUniversalIdentifier: TAP_AGENT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 3,
    },
    {
      universalIdentifier: '98bf2efe-3d67-4c16-abe9-43eb8b9552fd',
      fieldMetadataUniversalIdentifier: TAP_CURRENT_CALL_SESSION_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
  ],
  sorts: [
    {
      universalIdentifier: 'caa22274-5c7c-4524-949c-25300d57a3c2',
      fieldMetadataUniversalIdentifier: TAP_LAST_HEARTBEAT_AT_FIELD_ID,
      direction: ViewSortDirection.DESC,
    },
  ],
});
