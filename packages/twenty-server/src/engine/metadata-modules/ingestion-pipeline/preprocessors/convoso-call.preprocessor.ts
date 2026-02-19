import { Injectable, Logger } from '@nestjs/common';

import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

type ConvosoCallPayload = Record<string, unknown> & {
  // Pull API fields
  id?: string;
  queue?: string;
  campaign?: string;
  // Push (webhook) fields
  uniqueid?: string;
  queue_name?: string;
  source_name?: string;
  campaign_name?: string;
  // Common fields
  lead_id?: string;
  phone_number?: string;
  phone_code?: string;
  call_date?: string;
  call_length?: string;
  status?: string;
  status_name?: string;
  call_type?: string;
  user_id?: string;
  list_id?: string;
};

type BillingRule = {
  name: string;
  costMicros: number;
  minDuration: number;
};

const SYSTEM_USER_IDS = new Set(['666666', '666667', '666671']);

const LIST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class ConvosoCallPreprocessor {
  private readonly logger = new Logger(ConvosoCallPreprocessor.name);
  private listMap: Record<string, string> | null = null;
  private listMapFetchedAt = 0;

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async preProcess(
    payload: ConvosoCallPayload,
    _pipeline: IngestionPipelineEntity,
    workspaceId: string,
  ): Promise<Record<string, unknown> | null> {
    // Filter incomplete payloads — Convoso fires early with minimal data
    // Pull API uses `id`, push webhook uses `uniqueid`
    const callId = payload.id || payload.uniqueid;

    if (!payload.call_type && !payload.status && !callId) {
      this.logger.log(
        `Skipping incomplete call payload (no call_type, status, or id)`,
      );

      return null;
    }

    // Filter system users
    const userId = payload.user_id?.toString();

    if (userId && SYSTEM_USER_IDS.has(userId)) {
      this.logger.log(`Skipping system user call (user_id: ${userId})`);

      return null;
    }

    // Derive direction from call_type
    const callType = (payload.call_type || '').toUpperCase();
    const direction = callType.includes('IN') ? 'INBOUND' : 'OUTBOUND';
    const directionLabel = direction === 'INBOUND' ? 'Inbound' : 'Outbound';

    // Resolve source_name: prefer payload value, fall back to list_id lookup
    // Pull API has no source_name; always resolve via list_id
    let sourceName = payload.source_name || null;

    if (!sourceName && payload.list_id) {
      sourceName = await this.resolveConvosoListName(payload.list_id);
    }

    // Compute call name — pull API uses `queue`/`campaign`, push uses `queue_name`/`campaign_name`
    const queueName = payload.queue_name || payload.queue || null;
    const campaignName = payload.campaign_name || payload.campaign || null;
    const label = queueName || sourceName || campaignName || 'Unknown';
    const name = `${directionLabel} - ${label}`;

    // Resolve person by phone
    const personId = await this.findPersonByPhone(payload, workspaceId);

    // Find or create lead source
    const leadSourceId = await this.findOrCreateLeadSource(
      sourceName,
      workspaceId,
    );

    // Compute billing — use resolved queueName (pull: `queue`, push: `queue_name`)
    const duration = payload.call_length
      ? parseInt(payload.call_length.toString(), 10) || 0
      : 0;
    const billing = await this.computeBilling(
      queueName ?? undefined,
      sourceName,
      direction,
      duration,
      workspaceId,
    );

    return {
      ...payload,
      _direction: direction,
      _name: name,
      _personId: personId,
      _leadSourceId: leadSourceId,
      _billable: billing.billable,
      _costAmountMicros: billing.costAmountMicros,
      _costCurrencyCode: billing.costCurrencyCode,
    };
  }

  private async findPersonByPhone(
    payload: ConvosoCallPayload,
    workspaceId: string,
  ): Promise<string | null> {
    const normalizedPhone = this.normalizePhone(payload.phone_number);

    if (!normalizedPhone) {
      return null;
    }

    const personRepo = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'person',
      { shouldBypassPermissionChecks: true },
    );

    const person = await personRepo.findOne({
      where: {
        phones: {
          primaryPhoneNumber: normalizedPhone,
        },
      },
    });

    if (person) {
      this.logger.log(
        `Matched Person ${(person as Record<string, unknown>).id} by phone`,
      );

      return (person as Record<string, unknown>).id as string;
    }

    return null;
  }

  private async findOrCreateLeadSource(
    sourceName: string | null,
    workspaceId: string,
  ): Promise<string | null> {
    if (!sourceName) {
      return null;
    }

    const leadSourceRepo = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'leadSource',
      { shouldBypassPermissionChecks: true },
    );

    const existing = await leadSourceRepo.findOne({
      where: { name: sourceName },
    });

    if (existing) {
      return (existing as Record<string, unknown>).id as string;
    }

    try {
      const created = await leadSourceRepo.save({ name: sourceName });

      this.logger.log(`Created new Lead Source: "${sourceName}"`);

      return (created as Record<string, unknown>).id as string;
    } catch (error) {
      this.logger.error(
        `Failed to create Lead Source "${sourceName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return null;
    }
  }

  private async computeBilling(
    queueName: string | undefined,
    sourceName: string | null,
    direction: string,
    duration: number,
    workspaceId: string,
  ): Promise<{
    billable: boolean;
    costAmountMicros: number;
    costCurrencyCode: string;
  }> {
    const noBill = {
      billable: false,
      costAmountMicros: 0,
      costCurrencyCode: 'USD',
    };

    if (direction !== 'INBOUND') {
      return noBill;
    }

    const label = (queueName || sourceName || '').toLowerCase();

    if (!label) {
      return noBill;
    }

    const rules = await this.fetchBillingRules(workspaceId);

    // Match queue/source name against lead source names (case-insensitive substring)
    // Prefer the longest matching name (most specific)
    let bestMatch: BillingRule | null = null;

    for (const rule of rules) {
      const ruleName = rule.name.toLowerCase();

      if (label.includes(ruleName) || ruleName.includes(label)) {
        if (!bestMatch || rule.name.length > bestMatch.name.length) {
          bestMatch = rule;
        }
      }
    }

    if (!bestMatch) {
      return noBill;
    }

    const meetsDuration =
      bestMatch.minDuration === 0 || duration >= bestMatch.minDuration;

    return {
      billable: meetsDuration,
      costAmountMicros: meetsDuration ? bestMatch.costMicros : 0,
      costCurrencyCode: 'USD',
    };
  }

  private async fetchBillingRules(workspaceId: string): Promise<BillingRule[]> {
    const leadSourceRepo = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'leadSource',
      { shouldBypassPermissionChecks: true },
    );

    const sources = await leadSourceRepo.find();
    const rules: BillingRule[] = [];

    for (const source of sources) {
      const s = source as Record<string, unknown>;
      const costPerCall = s.costPerCall as
        | { amountMicros?: number }
        | undefined;

      rules.push({
        name: s.name as string,
        costMicros: costPerCall?.amountMicros ?? 0,
        minDuration: (s.minimumCallDuration as number) ?? 0,
      });
    }

    return rules;
  }

  private async resolveConvosoListName(listId: string): Promise<string | null> {
    const now = Date.now();

    // Refresh cache if stale or not yet loaded
    if (!this.listMap || now - this.listMapFetchedAt > LIST_CACHE_TTL_MS) {
      const apiToken = process.env.CONVOSO_API_TOKEN;

      if (!apiToken) {
        this.logger.warn(
          'CONVOSO_API_TOKEN not set, cannot resolve list_id to name',
        );

        return null;
      }

      try {
        const response = await fetch(
          `https://api.convoso.com/v1/lists/search?auth_token=${apiToken}`,
          { headers: { 'Content-Type': 'application/json' } },
        );

        if (!response.ok) {
          this.logger.error(`Convoso Lists API returned ${response.status}`);

          return null;
        }

        const json = (await response.json()) as {
          success: boolean;
          data?: Array<{ id: number; name: string }>;
        };

        if (!json.success || !json.data?.length) {
          return null;
        }

        this.listMap = {};

        for (const list of json.data) {
          this.listMap[String(list.id)] = list.name;
        }

        this.listMapFetchedAt = now;
        this.logger.log(`Cached ${json.data.length} Convoso lists`);
      } catch (error) {
        this.logger.error(
          `Failed to fetch Convoso lists: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );

        return null;
      }
    }

    return this.listMap?.[listId] ?? null;
  }

  private normalizePhone(phone: string | undefined): string | null {
    if (!phone) return null;

    const digits = phone.toString().replace(/\D/g, '');

    // Handle 11-digit numbers starting with 1 (US country code)
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
    }

    return digits.length === 10 ? digits : null;
  }
}
