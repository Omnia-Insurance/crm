import { areDashboardAudienceOptionsEqual } from 'src/modules/dashboard/dashboard-audience/utils/are-dashboard-audience-options-equal.util';
import { computeDashboardAudienceOptions } from 'src/modules/dashboard/dashboard-audience/utils/compute-dashboard-audience-options.util';
import { encodeDashboardAudienceRoleToken } from 'src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util';

const MEMBER_ROLE_ID = '46ef98b6-3677-444a-add7-2264376ba153';
const AGENT_ROLE_ID = 'e4c88d8f-2bf4-4890-8996-1515e9201319';
const DELETED_ROLE_ID = '259aa826-241b-42a2-a770-7bb6d4362231';
const NEW_ROLE_ID = 'b240485b-55d2-4d2e-8eda-d37a3b6b7a5f';

describe('computeDashboardAudienceOptions', () => {
  it('encodes a role id as an upper snake case option value', () => {
    expect(encodeDashboardAudienceRoleToken(AGENT_ROLE_ID)).toBe(
      'ROLE_E4C88D8F2BF4489089961515E9201319',
    );
  });

  it('keeps surviving options in place, follows renames, drops removed roles and appends new ones', () => {
    const currentOptions = [
      {
        id: 'agent-option-id',
        value: encodeDashboardAudienceRoleToken(AGENT_ROLE_ID),
        label: 'Agent',
        position: 0,
        color: 'orange' as const,
      },
      {
        id: 'deleted-option-id',
        value: encodeDashboardAudienceRoleToken(DELETED_ROLE_ID),
        label: 'Suspended',
        position: 1,
        color: 'gray' as const,
      },
      {
        id: 'member-option-id',
        value: encodeDashboardAudienceRoleToken(MEMBER_ROLE_ID),
        label: 'Member',
        position: 2,
        color: 'yellow' as const,
      },
    ];

    const desiredOptions = computeDashboardAudienceOptions({
      gatedFlatRoles: [
        { id: MEMBER_ROLE_ID, label: 'Members' },
        { id: NEW_ROLE_ID, label: 'Investor' },
        { id: AGENT_ROLE_ID, label: 'Agent' },
      ],
      currentOptions,
    });

    expect(desiredOptions).toEqual([
      { ...currentOptions[0], position: 0 },
      { ...currentOptions[2], label: 'Members', position: 1 },
      {
        value: encodeDashboardAudienceRoleToken(NEW_ROLE_ID),
        label: 'Investor',
        position: 2,
        color: expect.any(String),
      },
    ]);
    expect(
      areDashboardAudienceOptionsEqual(currentOptions, desiredOptions),
    ).toBe(false);
  });

  it('reports equal options once synced, whatever order they are stored in', () => {
    const desiredOptions = computeDashboardAudienceOptions({
      gatedFlatRoles: [
        { id: MEMBER_ROLE_ID, label: 'Member' },
        { id: AGENT_ROLE_ID, label: 'Agent' },
      ],
      currentOptions: [],
    });

    expect(
      areDashboardAudienceOptionsEqual(
        [...desiredOptions].reverse(),
        computeDashboardAudienceOptions({
          gatedFlatRoles: [
            { id: AGENT_ROLE_ID, label: 'Agent' },
            { id: MEMBER_ROLE_ID, label: 'Member' },
          ],
          currentOptions: desiredOptions,
        }),
      ),
    ).toBe(true);
  });
});
