import {
  type CampaignLeadLockCriteria,
  type CampaignLeadLockPatch,
  type CampaignLeadLockUpdateResult,
  tryLockCampaignLead,
} from 'src/modules/telephony/utils/try-lock-campaign-lead.util';

type CampaignLeadLockState = {
  id: string;
  status: string;
  lockOwnerToken?: string | null;
  lockedAt?: string | null;
  lockExpiresAt?: string | null;
  lockedByAgentId?: string | null;
  blockedReason?: string | null;
};

class InMemoryCampaignLeadLockRepository {
  constructor(private record: CampaignLeadLockState) {}

  async update(
    criteria: CampaignLeadLockCriteria,
    patch: CampaignLeadLockPatch,
  ): Promise<CampaignLeadLockUpdateResult> {
    if (this.record.id !== criteria.id) {
      return { affected: 0 };
    }

    if (this.record.status !== criteria.status) {
      return { affected: 0 };
    }

    if (
      criteria.lockOwnerToken !== undefined &&
      this.record.lockOwnerToken !== criteria.lockOwnerToken
    ) {
      return { affected: 0 };
    }

    this.record = {
      ...this.record,
      ...patch,
    };

    return { affected: 1 };
  }

  getRecord(): CampaignLeadLockState {
    return this.record;
  }
}

describe('tryLockCampaignLead', () => {
  const now = new Date('2026-05-20T15:00:00.000Z');
  const lockExpiresAt = new Date('2026-05-20T15:05:00.000Z');

  it('prevents double assignment for fresh routable leads', async () => {
    const campaignLead = {
      id: 'campaign-lead-1',
      status: 'READY',
      lockOwnerToken: null,
    };
    const repository = new InMemoryCampaignLeadLockRepository(campaignLead);

    const firstLockSucceeded = await tryLockCampaignLead({
      campaignLead,
      sessionId: 'session-a',
      agentProfileId: 'agent-a',
      now,
      lockExpiresAt,
      updateCampaignLeadLock: (criteria, patch) =>
        repository.update(criteria, patch),
    });
    const secondLockSucceeded = await tryLockCampaignLead({
      campaignLead,
      sessionId: 'session-b',
      agentProfileId: 'agent-b',
      now,
      lockExpiresAt,
      updateCampaignLeadLock: (criteria, patch) =>
        repository.update(criteria, patch),
    });

    expect(firstLockSucceeded).toBe(true);
    expect(secondLockSucceeded).toBe(false);
    expect(repository.getRecord()).toMatchObject({
      status: 'LOCKED',
      lockOwnerToken: 'session-a',
      lockedByAgentId: 'agent-a',
    });
  });

  it('prevents double reclaim for expired locked leads', async () => {
    const campaignLead = {
      id: 'campaign-lead-1',
      status: 'LOCKED',
      lockOwnerToken: 'expired-session',
    };
    const repository = new InMemoryCampaignLeadLockRepository(campaignLead);

    const firstLockSucceeded = await tryLockCampaignLead({
      campaignLead,
      sessionId: 'session-a',
      agentProfileId: 'agent-a',
      now,
      lockExpiresAt,
      updateCampaignLeadLock: (criteria, patch) =>
        repository.update(criteria, patch),
    });
    const secondLockSucceeded = await tryLockCampaignLead({
      campaignLead,
      sessionId: 'session-b',
      agentProfileId: 'agent-b',
      now,
      lockExpiresAt,
      updateCampaignLeadLock: (criteria, patch) =>
        repository.update(criteria, patch),
    });

    expect(firstLockSucceeded).toBe(true);
    expect(secondLockSucceeded).toBe(false);
    expect(repository.getRecord()).toMatchObject({
      status: 'LOCKED',
      lockOwnerToken: 'session-a',
      lockedByAgentId: 'agent-a',
    });
  });

  it('does not reclaim locked leads missing the previous owner token', async () => {
    const campaignLead = {
      id: 'campaign-lead-1',
      status: 'LOCKED',
      lockOwnerToken: null,
    };
    const repository = new InMemoryCampaignLeadLockRepository(campaignLead);

    const lockSucceeded = await tryLockCampaignLead({
      campaignLead,
      sessionId: 'session-a',
      agentProfileId: 'agent-a',
      now,
      lockExpiresAt,
      updateCampaignLeadLock: (criteria, patch) =>
        repository.update(criteria, patch),
    });

    expect(lockSucceeded).toBe(false);
    expect(repository.getRecord()).toMatchObject({
      status: 'LOCKED',
      lockOwnerToken: null,
    });
  });
});
