import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'crypto';
import { In, LessThan, type ObjectLiteral } from 'typeorm';

import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';
import { TelephonyCallSessionDTO } from 'src/modules/telephony/dtos/telephony-call-session.dto';
import { TelephonyNextCampaignLeadDTO } from 'src/modules/telephony/dtos/telephony-next-campaign-lead.dto';
import { TelephonySessionDTO } from 'src/modules/telephony/dtos/telephony-session.dto';
import { TelephonyProviderRegistryService } from 'src/modules/telephony/services/telephony-provider-registry.service';
import {
  type TelephonyAgentStatus,
  type TelephonyCallEventType,
  type TelephonyCallSessionStatus,
  type TelephonyCampaignLeadStatus,
  type TelephonyProviderWebhookEvent,
} from 'src/modules/telephony/types/telephony.type';
import { isWithinAllowedCallingWindow } from 'src/modules/telephony/utils/local-calling-window.util';
import { normalizePhoneNumber } from 'src/modules/telephony/utils/normalize-phone-number.util';

type DateValue = string | Date | null | undefined;

interface WorkspaceRecord {
  id: string;
}

interface RelationRecord extends WorkspaceRecord {}

interface LinksValue {
  primaryLinkLabel: string;
  primaryLinkUrl: string;
  secondaryLinks: null;
}

interface AgentPoolRulesRecord {
  agentProfileIds?: unknown;
}

interface PersonPhonesValue {
  primaryPhoneNumber?: string | null;
  additionalPhones?: { number?: string | null }[] | null;
}

interface PersonAddressValue {
  addressState?: string | null;
  state?: string | null;
  timeZone?: string | null;
}

interface PersonRecord extends WorkspaceRecord {
  phones?: PersonPhonesValue | null;
  doNotCall?: boolean | null;
  timeZone?: string | null;
  addressCustom?: PersonAddressValue | null;
  leadStatus?: string | null;
}

interface TelephonyCampaignRecord extends WorkspaceRecord {
  name?: string | null;
  status?: string | null;
  priority?: number | null;
  allowedStartLocalTime?: string | null;
  allowedEndLocalTime?: string | null;
  defaultTimeZone?: string | null;
  recordingPolicy?: string | null;
  agentPoolRules?: unknown;
  maxAttempts?: number | null;
}

interface TelephonyCampaignLeadRecord extends WorkspaceRecord {
  name?: string | null;
  status?: string | null;
  priority?: number | null;
  attempts?: number | null;
  nextCallAt?: DateValue;
  lastAttemptAt?: DateValue;
  callbackAt?: DateValue;
  lockOwnerToken?: string | null;
  lockedAt?: DateValue;
  lockExpiresAt?: DateValue;
  blockedReason?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
  lockedByAgentId?: string | null;
  lastDispositionId?: string | null;
  campaign?: TelephonyCampaignRecord | null;
  lead?: PersonRecord | null;
}

interface TelephonyDispositionRecord extends WorkspaceRecord {
  category?: string | null;
  retryDelayMinutes?: number | null;
  requiresCallback?: boolean | null;
  isTerminal?: boolean | null;
  mapsLeadStatusTo?: string | null;
}

interface TelephonyCallSessionRecord extends WorkspaceRecord {
  name?: string | null;
  status?: string | null;
  provider?: string | null;
  providerCallId?: string | null;
  providerParentCallId?: string | null;
  providerRecordingId?: string | null;
  recordingUrl?: LinksValue | null;
  recordingStatus?: string | null;
  durationSeconds?: number | null;
  answeredAt?: DateValue;
  endedAt?: DateValue;
  notes?: string | null;
  campaignLeadId?: string | null;
  campaignId?: string | null;
  agentId?: string | null;
  leadId?: string | null;
  dispositionId?: string | null;
  campaignLead?: TelephonyCampaignLeadRecord | null;
  agent?: RelationRecord | null;
  lead?: PersonRecord | null;
}

interface TelephonyCallEventRecord extends WorkspaceRecord {
  name?: string | null;
  eventType?: string | null;
  eventTime?: DateValue;
}

interface TelephonyAgentPresenceRecord extends WorkspaceRecord {
  name?: string | null;
  status?: string | null;
  sessionId?: string | null;
  lastHeartbeatAt?: DateValue;
  statusChangedAt?: DateValue;
  agentId?: string | null;
  workspaceMemberId?: string | null;
  currentCallSessionId?: string | null;
  agent?: RelationRecord | null;
}

const LOCK_TTL_MS = 5 * 60 * 1000;
const CANDIDATE_PAGE_SIZE = 100;
const ROUTABLE_STATUSES: TelephonyCampaignLeadStatus[] = [
  'READY',
  'CALLBACK',
  'RETRY_WAIT',
];
const VALID_AGENT_STATUSES: TelephonyAgentStatus[] = [
  'READY',
  'BREAK',
  'LUNCH',
  'TRAINING',
  'OFFLINE',
];

const isObjectRecord = (value: unknown): value is AgentPoolRulesRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getRelationId = (
  relationId?: string | null,
  relation?: RelationRecord | null,
): string | null => relationId ?? relation?.id ?? null;

const getDate = (value: DateValue): Date | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
};

const getLeadPrimaryPhone = (
  lead: PersonRecord | null | undefined,
): string | null =>
  normalizePhoneNumber(
    lead?.phones?.primaryPhoneNumber ??
      lead?.phones?.additionalPhones?.[0]?.number,
  );

const isAgentEligibleForCampaign = (
  campaign: TelephonyCampaignRecord,
  agentProfileId: string,
): boolean => {
  const rules = campaign.agentPoolRules;

  if (!rules) {
    return true;
  }

  if (Array.isArray(rules)) {
    return rules.includes(agentProfileId);
  }

  if (isObjectRecord(rules) && Array.isArray(rules.agentProfileIds)) {
    return rules.agentProfileIds.includes(agentProfileId);
  }

  return true;
};

const isDue = (
  campaignLead: TelephonyCampaignLeadRecord,
  now: Date,
): boolean => {
  const nextCallAt = getDate(campaignLead.nextCallAt);
  const callbackAt = getDate(campaignLead.callbackAt);

  if (campaignLead.status === 'CALLBACK' && callbackAt) {
    return callbackAt.getTime() <= now.getTime();
  }

  if (nextCallAt) {
    return nextCallAt.getTime() <= now.getTime();
  }

  return true;
};

const getWebhookUrl = (workspaceId: string, provider: string): string | null => {
  const baseUrl = process.env.TELEPHONY_WEBHOOK_PUBLIC_URL?.replace(/\/$/, '');

  return baseUrl
    ? `${baseUrl}/webhooks/telephony/${workspaceId}/${provider}`
    : null;
};

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly agentProfileResolverService: AgentProfileResolverService,
    private readonly telephonyProviderRegistryService: TelephonyProviderRegistryService,
  ) {}

  async startTelephonySession({
    workspace,
    workspaceMemberId,
  }: {
    workspace: WorkspaceEntity;
    workspaceMemberId: string;
  }): Promise<TelephonySessionDTO> {
    const agentProfileId = await this.resolveAgentProfileId(
      workspace,
      workspaceMemberId,
    );
    const sessionId = randomUUID();
    const accessToken = this.telephonyProviderRegistryService
      .getAdapter()
      .createAccessToken({
        workspaceId: workspace.id,
        workspaceMemberId,
        agentProfileId,
      });

    await this.upsertPresence({
      workspaceId: workspace.id,
      workspaceMemberId,
      agentProfileId,
      sessionId,
      status: 'OFFLINE',
    });

    return {
      sessionId,
      status: 'OFFLINE',
      agentProfileId,
      accessToken: accessToken.token,
      provider: accessToken.provider,
      expiresAt: accessToken.expiresAt,
    };
  }

  async setAgentTelephonyStatus({
    workspace,
    workspaceMemberId,
    status,
  }: {
    workspace: WorkspaceEntity;
    workspaceMemberId: string;
    status: string;
  }): Promise<TelephonySessionDTO> {
    this.assertAgentStatus(status);

    const presence = await this.getOrCreatePresence({
      workspace,
      workspaceMemberId,
    });
    const now = new Date().toISOString();

    await this.runInWorkspace(workspace.id, async () => {
      const presenceRepo =
        await this.getWorkspaceRepository<TelephonyAgentPresenceRecord>(
          workspace.id,
          'telephonyAgentPresence',
        );

      await presenceRepo.update(
        { id: presence.id },
        {
          status,
          lastHeartbeatAt: now,
          statusChangedAt: now,
        },
      );
    });

    return {
      sessionId: presence.sessionId ?? '',
      status,
      agentProfileId: getRelationId(presence.agentId, presence.agent),
    };
  }

  async endTelephonySession({
    workspace,
    workspaceMemberId,
  }: {
    workspace: WorkspaceEntity;
    workspaceMemberId: string;
  }): Promise<boolean> {
    const presence = await this.findPresence(workspace.id, workspaceMemberId);

    if (!presence) {
      return true;
    }

    await this.runInWorkspace(workspace.id, async () => {
      const presenceRepo =
        await this.getWorkspaceRepository<TelephonyAgentPresenceRecord>(
          workspace.id,
          'telephonyAgentPresence',
        );

      await presenceRepo.update(
        { id: presence.id },
        {
          status: 'OFFLINE',
          sessionId: null,
          currentCallSessionId: null,
          lastHeartbeatAt: new Date().toISOString(),
          statusChangedAt: new Date().toISOString(),
        },
      );
    });

    return true;
  }

  async requestNextCampaignLead({
    workspace,
    workspaceMemberId,
  }: {
    workspace: WorkspaceEntity;
    workspaceMemberId: string;
  }): Promise<TelephonyNextCampaignLeadDTO | null> {
    const presence = await this.getReadyPresence(workspace, workspaceMemberId);
    const agentProfileId = getRelationId(presence.agentId, presence.agent);

    if (!agentProfileId) {
      throw new BadRequestException('Telephony agent profile is required.');
    }

    if (!presence.sessionId) {
      throw new BadRequestException('Telephony session is required.');
    }

    return this.runInWorkspace(workspace.id, async () => {
      const campaignLeadRepo =
        await this.getWorkspaceRepository<TelephonyCampaignLeadRecord>(
          workspace.id,
          'telephonyCampaignLead',
        );
      const eventRepo =
        await this.getWorkspaceRepository<TelephonyCallEventRecord>(
          workspace.id,
          'telephonyCallEvent',
        );
      const now = new Date();
      const candidates = await campaignLeadRepo.find({
        where: [
          { status: In(ROUTABLE_STATUSES) },
          { status: 'LOCKED', lockExpiresAt: LessThan(now) },
        ],
        relations: ['campaign', 'lead'],
        order: {
          priority: 'ASC',
          nextCallAt: 'ASC',
        },
        take: CANDIDATE_PAGE_SIZE,
      });

      for (const candidate of candidates) {
        const campaign = candidate.campaign;
        const lead = candidate.lead;

        if (!campaign || campaign.status !== 'ACTIVE') {
          continue;
        }

        if (!isAgentEligibleForCampaign(campaign, agentProfileId)) {
          continue;
        }

        if (!isDue(candidate, now)) {
          continue;
        }

        const attempts = candidate.attempts ?? 0;
        const maxAttempts = campaign.maxAttempts ?? 6;

        if (attempts >= maxAttempts) {
          await campaignLeadRepo.update(
            { id: candidate.id },
            { status: 'EXHAUSTED' },
          );
          continue;
        }

        if (lead?.doNotCall === true) {
          await this.blockCampaignLead({
            campaignLeadRepo,
            eventRepo,
            campaignLead: candidate,
            agentProfileId,
            status: 'DNC_BLOCKED',
            blockedReason: 'DNC',
          });
          continue;
        }

        if (!getLeadPrimaryPhone(lead)) {
          await this.blockCampaignLead({
            campaignLeadRepo,
            eventRepo,
            campaignLead: candidate,
            agentProfileId,
            status: 'EXHAUSTED',
            blockedReason: 'MISSING_PHONE',
          });
          continue;
        }

        const callingWindow = isWithinAllowedCallingWindow({
          lead,
          campaign,
          now,
        });

        if (!callingWindow.allowed) {
          await this.blockCampaignLead({
            campaignLeadRepo,
            eventRepo,
            campaignLead: candidate,
            agentProfileId,
            status: 'TIME_WINDOW_BLOCKED',
            blockedReason: `LOCAL_TIME_WINDOW:${callingWindow.timeZone}`,
          });
          continue;
        }

        const lockExpiresAt = new Date(now.getTime() + LOCK_TTL_MS);
        if (!candidate.status) {
          continue;
        }

        const previousLockOwnerToken = candidate.lockOwnerToken;
        const lockCriteria = { id: candidate.id, status: candidate.status };

        const updateResult =
          candidate.status === 'LOCKED'
            ? previousLockOwnerToken
              ? await campaignLeadRepo.update(
                  {
                    ...lockCriteria,
                    lockOwnerToken: previousLockOwnerToken,
                  },
                  {
                    status: 'LOCKED',
                    lockOwnerToken: presence.sessionId,
                    lockedAt: now.toISOString(),
                    lockExpiresAt: lockExpiresAt.toISOString(),
                    lockedByAgentId: agentProfileId,
                    blockedReason: null,
                  },
                )
              : undefined
            : await campaignLeadRepo.update(lockCriteria, {
            status: 'LOCKED',
            lockOwnerToken: presence.sessionId,
            lockedAt: now.toISOString(),
            lockExpiresAt: lockExpiresAt.toISOString(),
            lockedByAgentId: agentProfileId,
            blockedReason: null,
          });

        if (!updateResult?.affected) {
          continue;
        }

        await this.createCallEvent(eventRepo, {
          eventType: 'LOCKED',
          campaignLeadId: candidate.id,
          agentId: agentProfileId,
          payload: {
            route: 'requestNextCampaignLead',
            sessionId: presence.sessionId,
          },
        });

        return {
          campaignLeadId: candidate.id,
          leadId: getRelationId(candidate.leadId, candidate.lead),
          campaignId: getRelationId(candidate.campaignId, candidate.campaign),
          lockExpiresAt: lockExpiresAt.toISOString(),
          blockedReason: null,
        };
      }

      return null;
    });
  }

  async releaseCampaignLead({
    workspace,
    workspaceMemberId,
    reason,
  }: {
    workspace: WorkspaceEntity;
    workspaceMemberId: string;
    reason: string;
  }): Promise<boolean> {
    const presence = await this.findPresence(workspace.id, workspaceMemberId);

    if (!presence?.sessionId) {
      return true;
    }

    const sessionId = presence.sessionId;

    await this.runInWorkspace(workspace.id, async () => {
      const campaignLeadRepo =
        await this.getWorkspaceRepository<TelephonyCampaignLeadRecord>(
          workspace.id,
          'telephonyCampaignLead',
        );
      const eventRepo =
        await this.getWorkspaceRepository<TelephonyCallEventRecord>(
          workspace.id,
          'telephonyCallEvent',
        );
      const lockedLeads = await campaignLeadRepo.find({
        where: { lockOwnerToken: sessionId, status: In(['LOCKED']) },
      });

      for (const lockedLead of lockedLeads) {
        await campaignLeadRepo.update(
          { id: lockedLead.id },
          {
            status: 'READY',
            lockOwnerToken: null,
            lockedAt: null,
            lockExpiresAt: null,
            lockedByAgentId: null,
          },
        );
        await this.createCallEvent(eventRepo, {
          eventType: 'RELEASED',
          campaignLeadId: lockedLead.id,
          agentId: getRelationId(presence.agentId, presence.agent),
          payload: { reason },
        });
      }
    });

    return true;
  }

  async startOutboundCall({
    workspace,
    workspaceMemberId,
    campaignLeadId,
  }: {
    workspace: WorkspaceEntity;
    workspaceMemberId: string;
    campaignLeadId: string;
  }): Promise<TelephonyCallSessionDTO> {
    const presence = await this.getReadyPresence(workspace, workspaceMemberId);
    const agentProfileId = getRelationId(presence.agentId, presence.agent);

    if (!presence.sessionId || !agentProfileId) {
      throw new BadRequestException('Telephony session is required.');
    }

    return this.runInWorkspace(workspace.id, async () => {
      const campaignLeadRepo =
        await this.getWorkspaceRepository<TelephonyCampaignLeadRecord>(
          workspace.id,
          'telephonyCampaignLead',
        );
      const callSessionRepo =
        await this.getWorkspaceRepository<TelephonyCallSessionRecord>(
          workspace.id,
          'telephonyCallSession',
        );
      const eventRepo =
        await this.getWorkspaceRepository<TelephonyCallEventRecord>(
          workspace.id,
          'telephonyCallEvent',
        );
      const presenceRepo =
        await this.getWorkspaceRepository<TelephonyAgentPresenceRecord>(
          workspace.id,
          'telephonyAgentPresence',
        );
      const campaignLead = await campaignLeadRepo.findOne({
        where: { id: campaignLeadId },
        relations: ['campaign', 'lead'],
      });

      if (!campaignLead) {
        throw new NotFoundException('Campaign lead not found.');
      }

      if (
        campaignLead.lockOwnerToken !== presence.sessionId ||
        campaignLead.status !== 'LOCKED'
      ) {
        throw new ForbiddenException('Campaign lead is not reserved.');
      }

      const lockExpiresAt = getDate(campaignLead.lockExpiresAt);

      if (!lockExpiresAt || lockExpiresAt.getTime() < Date.now()) {
        throw new ForbiddenException('Campaign lead reservation expired.');
      }

      const campaign = campaignLead.campaign;
      const lead = campaignLead.lead;
      const toNumber = getLeadPrimaryPhone(lead);

      if (!toNumber) {
        throw new BadRequestException('Lead has no callable phone number.');
      }

      const providerAdapter =
        this.telephonyProviderRegistryService.getAdapter();
      const callSession = await callSessionRepo.save({
        name: `Outbound ${campaignLead.name ?? campaignLead.id}`,
        direction: 'OUTBOUND',
        status: 'DIALING',
        provider: providerAdapter.key,
        fromNumber: process.env.TELEPHONY_DEFAULT_FROM_NUMBER ?? null,
        toNumber,
        startedAt: new Date().toISOString(),
        campaignLeadId: campaignLead.id,
        campaignId: getRelationId(campaignLead.campaignId, campaign),
        agentId: agentProfileId,
        leadId: getRelationId(campaignLead.leadId, lead),
      });
      const providerCall = providerAdapter.createOutboundCall({
        workspaceId: workspace.id,
        callSessionId: callSession.id,
        agentProfileId,
        fromNumber: process.env.TELEPHONY_DEFAULT_FROM_NUMBER ?? null,
        toNumber,
        recordingEnabled: campaign?.recordingPolicy !== 'DO_NOT_RECORD',
        webhookUrl: getWebhookUrl(workspace.id, providerAdapter.key),
      });

      await callSessionRepo.update(
        { id: callSession.id },
        {
          providerCallId: providerCall.providerCallId,
          providerParentCallId: providerCall.providerParentCallId ?? null,
        },
      );
      await campaignLeadRepo.update(
        { id: campaignLead.id },
        {
          status: 'CALLING',
          attempts: (campaignLead.attempts ?? 0) + 1,
          lastAttemptAt: new Date().toISOString(),
        },
      );
      await presenceRepo.update(
        { id: presence.id },
        { currentCallSessionId: callSession.id },
      );
      await this.createCallEvent(eventRepo, {
        eventType: 'DIALING',
        callSessionId: callSession.id,
        campaignLeadId: campaignLead.id,
        agentId: agentProfileId,
        provider: providerAdapter.key,
        providerCallId: providerCall.providerCallId,
        payload: providerCall.instruction,
      });

      return {
        callSessionId: callSession.id,
        provider: providerAdapter.key,
        providerCallId: providerCall.providerCallId,
        status: 'DIALING',
        instruction: JSON.stringify(providerCall.instruction),
      };
    });
  }

  async submitCallDisposition({
    workspace,
    callSessionId,
    dispositionId,
    notes,
    callbackAt,
  }: {
    workspace: WorkspaceEntity;
    callSessionId: string;
    dispositionId: string;
    notes?: string | null;
    callbackAt?: string | null;
  }): Promise<TelephonyCallSessionDTO> {
    return this.runInWorkspace(workspace.id, async () => {
      const callSessionRepo =
        await this.getWorkspaceRepository<TelephonyCallSessionRecord>(
          workspace.id,
          'telephonyCallSession',
        );
      const campaignLeadRepo =
        await this.getWorkspaceRepository<TelephonyCampaignLeadRecord>(
          workspace.id,
          'telephonyCampaignLead',
        );
      const dispositionRepo =
        await this.getWorkspaceRepository<TelephonyDispositionRecord>(
          workspace.id,
          'telephonyDisposition',
        );
      const leadRepo = await this.getWorkspaceRepository<PersonRecord>(
        workspace.id,
        'person',
      );
      const eventRepo =
        await this.getWorkspaceRepository<TelephonyCallEventRecord>(
          workspace.id,
          'telephonyCallEvent',
        );
      const callSession = await callSessionRepo.findOne({
        where: { id: callSessionId },
        relations: ['campaignLead', 'lead'],
      });
      const disposition = await dispositionRepo.findOne({
        where: { id: dispositionId },
      });

      if (!callSession) {
        throw new NotFoundException('Call session not found.');
      }

      if (!disposition) {
        throw new NotFoundException('Disposition not found.');
      }

      const nextStatus = this.resolveDispositionCampaignLeadStatus(
        disposition,
        callbackAt,
      );
      const nextCallAt = this.resolveDispositionNextCallAt(
        disposition,
        callbackAt,
      );
      const campaignLeadId = getRelationId(
        callSession.campaignLeadId,
        callSession.campaignLead,
      );
      const leadId = getRelationId(callSession.leadId, callSession.lead);

      await callSessionRepo.update(
        { id: callSession.id },
        {
          status: 'DISPOSITIONED',
          dispositionId,
          notes: notes ?? null,
        },
      );

      if (campaignLeadId) {
        await campaignLeadRepo.update(
          { id: campaignLeadId },
          {
            status: nextStatus,
            lastDispositionId: dispositionId,
            callbackAt: callbackAt ?? null,
            nextCallAt,
            lockOwnerToken: null,
            lockedAt: null,
            lockExpiresAt: null,
            lockedByAgentId: null,
          },
        );
      }

      if (leadId) {
        const leadPatch: Partial<PersonRecord> = {};

        if (disposition.mapsLeadStatusTo) {
          leadPatch.leadStatus = disposition.mapsLeadStatusTo;
        }

        if (disposition.category === 'DNC') {
          leadPatch.doNotCall = true;
        }

        if (Object.keys(leadPatch).length > 0) {
          await leadRepo.update({ id: leadId }, leadPatch);
        }
      }

      await this.createCallEvent(eventRepo, {
        eventType: 'DISPOSITION_SUBMITTED',
        callSessionId: callSession.id,
        campaignLeadId,
        agentId: getRelationId(callSession.agentId, callSession.agent),
        payload: {
          dispositionId,
          notes,
          callbackAt,
          campaignLeadStatus: nextStatus,
        },
      });

      return {
        callSessionId: callSession.id,
        provider: callSession.provider ?? 'unknown',
        providerCallId: callSession.providerCallId ?? null,
        status: 'DISPOSITIONED',
      };
    });
  }

  async transferOrEndInboundCall({
    workspace,
    callSessionId,
    action,
  }: {
    workspace: WorkspaceEntity;
    callSessionId: string;
    action: string;
  }): Promise<boolean> {
    await this.runInWorkspace(workspace.id, async () => {
      const callSessionRepo =
        await this.getWorkspaceRepository<TelephonyCallSessionRecord>(
          workspace.id,
          'telephonyCallSession',
        );
      const eventRepo =
        await this.getWorkspaceRepository<TelephonyCallEventRecord>(
          workspace.id,
          'telephonyCallEvent',
        );
      const status: TelephonyCallSessionStatus =
        action === 'MISS' ? 'MISSED' : 'COMPLETED';

      await callSessionRepo.update(
        { id: callSessionId },
        { status, endedAt: new Date().toISOString() },
      );
      await this.createCallEvent(eventRepo, {
        eventType: status === 'MISSED' ? 'INBOUND_MISSED' : 'COMPLETED',
        callSessionId,
        payload: { action },
      });
    });

    return true;
  }

  async handleProviderWebhook({
    workspaceId,
    provider,
    headers,
    payload,
    rawBody,
  }: {
    workspaceId: string;
    provider: string;
    headers: Record<string, string | string[] | undefined>;
    payload: Record<string, unknown>;
    rawBody?: Buffer;
  }): Promise<{ success: boolean; eventType: string }> {
    const adapter = this.telephonyProviderRegistryService.getAdapter(provider);

    if (
      !adapter.validateWebhook({
        headers,
        payload,
        rawBody,
        webhookSecret: process.env.TELEPHONY_PROVIDER_WEBHOOK_SECRET ?? null,
      })
    ) {
      throw new ForbiddenException('Invalid telephony webhook signature.');
    }

    const event = adapter.normalizeWebhookEvent(payload);

    await this.persistProviderWebhookEvent(workspaceId, event);

    return { success: true, eventType: event.eventType };
  }

  private async getOrCreatePresence({
    workspace,
    workspaceMemberId,
  }: {
    workspace: WorkspaceEntity;
    workspaceMemberId: string;
  }): Promise<TelephonyAgentPresenceRecord> {
    const existingPresence = await this.findPresence(
      workspace.id,
      workspaceMemberId,
    );

    if (existingPresence) {
      return existingPresence;
    }

    await this.startTelephonySession({
      workspace,
      workspaceMemberId,
    });

    const createdPresence = await this.findPresence(
      workspace.id,
      workspaceMemberId,
    );

    if (!createdPresence) {
      throw new NotFoundException('Telephony presence was not created.');
    }

    return createdPresence;
  }

  private async getReadyPresence(
    workspace: WorkspaceEntity,
    workspaceMemberId: string,
  ): Promise<TelephonyAgentPresenceRecord> {
    const presence = await this.getOrCreatePresence({
      workspace,
      workspaceMemberId,
    });

    if (presence.status !== 'READY') {
      throw new ForbiddenException('Agent must be READY for routing.');
    }

    return presence;
  }

  private async findPresence(
    workspaceId: string,
    workspaceMemberId: string,
  ): Promise<TelephonyAgentPresenceRecord | null> {
    return this.runInWorkspace(workspaceId, async () => {
      const presenceRepo =
        await this.getWorkspaceRepository<TelephonyAgentPresenceRecord>(
          workspaceId,
          'telephonyAgentPresence',
        );

      return presenceRepo.findOne({
        where: { workspaceMemberId },
      });
    });
  }

  private async upsertPresence({
    workspaceId,
    workspaceMemberId,
    agentProfileId,
    sessionId,
    status,
  }: {
    workspaceId: string;
    workspaceMemberId: string;
    agentProfileId: string | null;
    sessionId: string;
    status: TelephonyAgentStatus;
  }): Promise<void> {
    await this.runInWorkspace(workspaceId, async () => {
      const presenceRepo =
        await this.getWorkspaceRepository<TelephonyAgentPresenceRecord>(
          workspaceId,
          'telephonyAgentPresence',
        );
      const existing = await presenceRepo.findOne({
        where: { workspaceMemberId },
      });
      const now = new Date().toISOString();

      if (existing) {
        await presenceRepo.update(
          { id: existing.id },
          {
            name: `Telephony Session ${workspaceMemberId}`,
            status,
            sessionId,
            lastHeartbeatAt: now,
            statusChangedAt: now,
            agentId: agentProfileId,
            workspaceMemberId,
          },
        );

        return;
      }

      await presenceRepo.save({
        name: `Telephony Session ${workspaceMemberId}`,
        status,
        sessionId,
        lastHeartbeatAt: now,
        statusChangedAt: now,
        agentId: agentProfileId,
        workspaceMemberId,
      });
    });
  }

  private async resolveAgentProfileId(
    workspace: WorkspaceEntity,
    workspaceMemberId: string,
  ): Promise<string | null> {
    return this.agentProfileResolverService.resolveAgentProfileId(
      workspace.id,
      workspaceMemberId,
      buildSystemAuthContext(workspace.id),
    );
  }

  private async blockCampaignLead({
    campaignLeadRepo,
    eventRepo,
    campaignLead,
    agentProfileId,
    status,
    blockedReason,
  }: {
    campaignLeadRepo: WorkspaceRepository<TelephonyCampaignLeadRecord>;
    eventRepo: WorkspaceRepository<TelephonyCallEventRecord>;
    campaignLead: TelephonyCampaignLeadRecord;
    agentProfileId: string;
    status: TelephonyCampaignLeadStatus;
    blockedReason: string;
  }): Promise<void> {
    await campaignLeadRepo.update(
      { id: campaignLead.id },
      {
        status,
        blockedReason,
        lockOwnerToken: null,
        lockedAt: null,
        lockExpiresAt: null,
        lockedByAgentId: null,
      },
    );
    await this.createCallEvent(eventRepo, {
      eventType: 'BLOCKED_ATTEMPT',
      campaignLeadId: campaignLead.id,
      agentId: agentProfileId,
      blockedReason,
      payload: {
        previousStatus: campaignLead.status,
        nextStatus: status,
      },
    });
  }

  private async persistProviderWebhookEvent(
    workspaceId: string,
    event: TelephonyProviderWebhookEvent,
  ): Promise<void> {
    await this.runInWorkspace(workspaceId, async () => {
      const callSessionRepo =
        await this.getWorkspaceRepository<TelephonyCallSessionRecord>(
          workspaceId,
          'telephonyCallSession',
        );
      const eventRepo =
        await this.getWorkspaceRepository<TelephonyCallEventRecord>(
          workspaceId,
          'telephonyCallEvent',
        );
      const callSession = event.providerCallId
        ? await callSessionRepo.findOne({
            where: { providerCallId: event.providerCallId },
          })
        : null;

      if (callSession) {
        await callSessionRepo.update(
          { id: callSession.id },
          {
            status: event.callSessionStatus ?? callSession.status,
            providerParentCallId:
              event.providerParentCallId ?? callSession.providerParentCallId,
            providerRecordingId:
              event.providerRecordingId ?? callSession.providerRecordingId,
            recordingUrl: event.recordingUrl
              ? {
                  primaryLinkLabel: '',
                  primaryLinkUrl: event.recordingUrl,
                  secondaryLinks: null,
                }
              : callSession.recordingUrl,
            recordingStatus:
              event.recordingStatus ?? callSession.recordingStatus,
            durationSeconds:
              event.durationSeconds ?? callSession.durationSeconds,
            answeredAt:
              event.eventType === 'ANSWERED'
                ? event.eventTime.toISOString()
                : callSession.answeredAt,
            endedAt: ['COMPLETED', 'FAILED'].includes(event.eventType)
              ? event.eventTime.toISOString()
              : callSession.endedAt,
          },
        );
      } else if (event.providerCallId) {
        this.logger.warn(
          `Telephony webhook for provider call ${event.providerCallId} did not match an active call session`,
        );
      }

      await this.createCallEvent(eventRepo, {
        eventType: event.eventType,
        callSessionId: callSession?.id,
        campaignLeadId: getRelationId(
          callSession?.campaignLeadId,
          callSession?.campaignLead,
        ),
        agentId: getRelationId(callSession?.agentId, callSession?.agent),
        provider: event.provider,
        providerEventId: event.providerEventId,
        providerCallId: event.providerCallId,
        eventTime: event.eventTime,
        payload: event.payload,
      });
    });
  }

  private resolveDispositionCampaignLeadStatus(
    disposition: TelephonyDispositionRecord,
    callbackAt?: string | null,
  ): TelephonyCampaignLeadStatus {
    if (disposition.isTerminal === true) {
      return 'COMPLETED';
    }

    if (callbackAt || disposition.requiresCallback === true) {
      return 'CALLBACK';
    }

    return (disposition.retryDelayMinutes ?? 0) > 0 ? 'RETRY_WAIT' : 'READY';
  }

  private resolveDispositionNextCallAt(
    disposition: TelephonyDispositionRecord,
    callbackAt?: string | null,
  ): string | null {
    if (callbackAt) {
      return callbackAt;
    }

    const retryDelayMinutes = disposition.retryDelayMinutes ?? 0;

    if (retryDelayMinutes <= 0 || disposition.isTerminal === true) {
      return null;
    }

    return new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString();
  }

  private async createCallEvent(
    eventRepo: WorkspaceRepository<TelephonyCallEventRecord>,
    {
      eventType,
      callSessionId,
      campaignLeadId,
      agentId,
      provider,
      providerEventId,
      providerCallId,
      eventTime,
      blockedReason,
      payload,
    }: {
      eventType: TelephonyCallEventType;
      callSessionId?: string | null;
      campaignLeadId?: string | null;
      agentId?: string | null;
      provider?: string | null;
      providerEventId?: string | null;
      providerCallId?: string | null;
      eventTime?: Date;
      blockedReason?: string | null;
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    const eventTimestamp = (eventTime ?? new Date()).toISOString();

    await eventRepo.save({
      name: `${eventType} ${eventTimestamp}`,
      eventType,
      eventTime: eventTimestamp,
      provider: provider ?? null,
      providerEventId: providerEventId ?? null,
      providerCallId: providerCallId ?? null,
      blockedReason: blockedReason ?? null,
      callSessionId: callSessionId ?? null,
      campaignLeadId: campaignLeadId ?? null,
      agentId: agentId ?? null,
      payload: payload ?? {},
    });
  }

  private assertAgentStatus(
    status: string,
  ): asserts status is TelephonyAgentStatus {
    if (!VALID_AGENT_STATUSES.some((validStatus) => validStatus === status)) {
      throw new BadRequestException(`Invalid telephony status: ${status}`);
    }
  }

  private async getWorkspaceRepository<T extends ObjectLiteral>(
    workspaceId: string,
    objectMetadataName: string,
  ): Promise<WorkspaceRepository<T>> {
    return this.globalWorkspaceOrmManager.getRepository<T>(
      workspaceId,
      objectMetadataName,
      { shouldBypassPermissionChecks: true },
    );
  }

  private async runInWorkspace<T>(
    workspaceId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      operation,
      buildSystemAuthContext(workspaceId),
    );
  }
}
