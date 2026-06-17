type CampaignLeadLockCandidate = {
  id: string;
  status?: string | null;
  lockOwnerToken?: string | null;
};

export type CampaignLeadLockCriteria = {
  id: string;
  status: string;
  lockOwnerToken?: string;
};

export type CampaignLeadLockPatch = {
  status: 'LOCKED';
  lockOwnerToken: string;
  lockedAt: string;
  lockExpiresAt: string;
  lockedByAgentId: string;
  blockedReason: null;
};

export type CampaignLeadLockUpdateResult = {
  affected?: number | null;
};

type TryLockCampaignLeadInput = {
  campaignLead: CampaignLeadLockCandidate;
  sessionId: string;
  agentProfileId: string;
  now: Date;
  lockExpiresAt: Date;
  updateCampaignLeadLock: (
    criteria: CampaignLeadLockCriteria,
    patch: CampaignLeadLockPatch,
  ) => Promise<CampaignLeadLockUpdateResult>;
};

export const tryLockCampaignLead = async ({
  campaignLead,
  sessionId,
  agentProfileId,
  now,
  lockExpiresAt,
  updateCampaignLeadLock,
}: TryLockCampaignLeadInput): Promise<boolean> => {
  if (!campaignLead.status) {
    return false;
  }

  const patch: CampaignLeadLockPatch = {
    status: 'LOCKED',
    lockOwnerToken: sessionId,
    lockedAt: now.toISOString(),
    lockExpiresAt: lockExpiresAt.toISOString(),
    lockedByAgentId: agentProfileId,
    blockedReason: null,
  };

  const updateResult =
    campaignLead.status === 'LOCKED'
      ? await tryReclaimExpiredLock({
          campaignLead,
          patch,
          updateCampaignLeadLock,
        })
      : await updateCampaignLeadLock(
          { id: campaignLead.id, status: campaignLead.status },
          patch,
        );

  return (updateResult?.affected ?? 0) > 0;
};

const tryReclaimExpiredLock = async ({
  campaignLead,
  patch,
  updateCampaignLeadLock,
}: {
  campaignLead: CampaignLeadLockCandidate;
  patch: CampaignLeadLockPatch;
  updateCampaignLeadLock: (
    criteria: CampaignLeadLockCriteria,
    patch: CampaignLeadLockPatch,
  ) => Promise<CampaignLeadLockUpdateResult>;
}): Promise<CampaignLeadLockUpdateResult> => {
  const previousLockOwnerToken = campaignLead.lockOwnerToken;

  if (!campaignLead.status || !previousLockOwnerToken) {
    return { affected: 0 };
  }

  return updateCampaignLeadLock(
    {
      id: campaignLead.id,
      status: campaignLead.status,
      lockOwnerToken: previousLockOwnerToken,
    },
    patch,
  );
};
