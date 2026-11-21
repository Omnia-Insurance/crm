import { applyAgentProfileJoinColumnDefaults } from '@/object-record/record-form/utils/applyAgentProfileJoinColumnDefaults';

const AGENT_PROFILE_ID = 'agent-profile-id';

describe('applyAgentProfileJoinColumnDefaults', () => {
  it('fills an Agent the draft leaves out', () => {
    expect(
      applyAgentProfileJoinColumnDefaults({
        draftRecord: { name: 'Policy', agentId: undefined },
        agentProfileJoinColumnNames: ['agentId'],
        agentProfileId: AGENT_PROFILE_ID,
        shouldKeepNullValues: false,
      }),
    ).toEqual({ name: 'Policy', agentId: AGENT_PROFILE_ID });
  });

  it('keeps an Agent the caller or a row level rule already set', () => {
    const draftRecord = { agentId: 'agent-profile-from-rls' };

    expect(
      applyAgentProfileJoinColumnDefaults({
        draftRecord,
        agentProfileJoinColumnNames: ['agentId'],
        agentProfileId: AGENT_PROFILE_ID,
        shouldKeepNullValues: false,
      }),
    ).toBe(draftRecord);
  });

  it('fills an empty Agent of the request but keeps one the user cleared', () => {
    expect(
      applyAgentProfileJoinColumnDefaults({
        draftRecord: { agentId: null },
        agentProfileJoinColumnNames: ['agentId'],
        agentProfileId: AGENT_PROFILE_ID,
        shouldKeepNullValues: false,
      }),
    ).toEqual({ agentId: AGENT_PROFILE_ID });

    expect(
      applyAgentProfileJoinColumnDefaults({
        draftRecord: { agentId: null },
        agentProfileJoinColumnNames: ['agentId'],
        agentProfileId: AGENT_PROFILE_ID,
        shouldKeepNullValues: true,
      }),
    ).toEqual({ agentId: null });
  });

  it('leaves the draft alone until the AgentProfile is known', () => {
    const draftRecord = { name: 'Policy' };

    expect(
      applyAgentProfileJoinColumnDefaults({
        draftRecord,
        agentProfileJoinColumnNames: ['agentId'],
        agentProfileId: null,
        shouldKeepNullValues: false,
      }),
    ).toBe(draftRecord);
  });
});
