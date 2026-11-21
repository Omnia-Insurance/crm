import { OmniaCurrentAgentProfileIdEffect } from '@/object-record/record-form/components/OmniaCurrentAgentProfileIdEffect';
import { omniaCurrentAgentProfileState } from '@/object-record/record-form/states/omniaCurrentAgentProfileState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { act, render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';

const mockUseFindManyRecords = jest.fn();

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (params: unknown) => mockUseFindManyRecords(params),
}));

const WORKSPACE_MEMBER_ID = 'workspace-member-id';

const renderEffect = () => {
  const store = createStore();

  render(
    <Provider store={store}>
      <OmniaCurrentAgentProfileIdEffect
        workspaceMemberId={WORKSPACE_MEMBER_ID}
      />
    </Provider>,
  );

  const completeLookup = (agentProfiles: ObjectRecord[]) =>
    act(() =>
      mockUseFindManyRecords.mock.lastCall[0].onCompleted(agentProfiles),
    );

  return { store, completeLookup };
};

describe('OmniaCurrentAgentProfileIdEffect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('looks up only the id of the AgentProfile linked to the member', () => {
    renderEffect();

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'agentProfile',
        filter: { workspaceMemberId: { eq: WORKSPACE_MEMBER_ID } },
        recordGqlFields: { id: true },
        limit: 1,
      }),
    );
  });

  it('remembers the AgentProfile of the member, or that none is linked', () => {
    const { store, completeLookup } = renderEffect();

    completeLookup([{ __typename: 'AgentProfile', id: 'agent-profile-id' }]);

    expect(store.get(omniaCurrentAgentProfileState.atom)).toEqual({
      workspaceMemberId: WORKSPACE_MEMBER_ID,
      agentProfileId: 'agent-profile-id',
    });

    completeLookup([]);

    expect(store.get(omniaCurrentAgentProfileState.atom)).toEqual({
      workspaceMemberId: WORKSPACE_MEMBER_ID,
      agentProfileId: null,
    });
  });
});
