import { Injectable, Logger } from '@nestjs/common';

import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

type ConvosoCallPayload = Record<string, unknown> & {
  // Pull API fields
  id?: string;
  queue?: string;
  campaign?: string;
  term_reason?: string;
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

    // Filter in-progress calls (pull API only) — no term_reason means call hasn't ended.
    // But if the call has a status (e.g. XDROP, WAITTO), it's completed even without
    // a term_reason (e.g. "Call Abandoned In Queue" never connected to an agent).
    const termReason = payload.term_reason?.toString();
    const hasStatus = !!payload.status;

    if (
      termReason !== undefined &&
      (!termReason || termReason === 'NONE') &&
      !hasStatus
    ) {
      this.logger.log(`Skipping in-progress call (term_reason: ${termReason})`);

      return null;
    }

    // Filter system users (outbound only — inbound calls abandoned in queue
    // are assigned to system users like "System DID User" by Convoso)
    const callType = (payload.call_type || '').toUpperCase();
    const userId = payload.user_id?.toString();

    if (userId && SYSTEM_USER_IDS.has(userId) && !callType.includes('IN')) {
      this.logger.log(`Skipping system user call (user_id: ${userId})`);

      return null;
    }

    // Assign calls to the System agent profile when no human agent handled them:
    // - Calls from known Convoso system user IDs (e.g. "System DID User")
    // - Calls with an "After Hours" status (queue was closed, no agent available)
    const statusName = (payload.status_name || '').toLowerCase();
    const isSystemUser = userId ? SYSTEM_USER_IDS.has(userId) : false;
    const isAfterHours = statusName.includes('after hours');

    if ((isSystemUser || isAfterHours) && callType.includes('IN')) {
      payload.user_id = '666666';
    }

    // Derive direction from call_type
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

    // Find or create lead source
    const leadSourceId = await this.findOrCreateLeadSource(
      sourceName,
      payload.list_id,
      workspaceId,
    );

    // Resolve person by phone, create if not found
    const personId = await this.findOrCreatePersonByPhone(
      payload,
      leadSourceId,
      workspaceId,
    );

    // Compute billing by matching queue/source name against Lead Source names
    // (same logic as old Cloudflare Worker: bill based on which queue handled the call)
    const duration = payload.call_length
      ? parseInt(payload.call_length.toString(), 10) || 0
      : 0;
    const billingLabel = queueName || sourceName || null;
    const billing = await this.computeBillingByQueueName(
      billingLabel,
      direction,
      duration,
      workspaceId,
    );

    // Convert call_date from LA local time to UTC ISO string
    const callDateISO = this.convertConvosoDateToISO(payload.call_date);

    return {
      ...payload,
      _callDate: callDateISO,
      _direction: direction,
      _name: name,
      _personId: personId,
      _leadSourceId: leadSourceId,
      _billable: billing.billable,
      _costAmountMicros: billing.costAmountMicros,
      _costCurrencyCode: billing.costCurrencyCode,
    };
  }

  private async findOrCreatePersonByPhone(
    payload: ConvosoCallPayload,
    leadSourceId: string | null,
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

    const existing = await personRepo.findOne({
      where: {
        phones: {
          primaryPhoneNumber: normalizedPhone,
        },
      },
    });

    if (existing) {
      this.logger.log(
        `Matched Person ${(existing as Record<string, unknown>).id} by phone`,
      );

      return (existing as Record<string, unknown>).id as string;
    }

    // Create person from call data if not found
    try {
      const personData: Record<string, unknown> = {
        phones: {
          primaryPhoneNumber: normalizedPhone,
          primaryPhoneCallingCode: '+1',
          primaryPhoneCountryCode: 'US',
        },
        name: {
          firstName: '',
          lastName: '',
        },
      };

      if (leadSourceId) {
        personData.leadSourceId = leadSourceId;
      }

      const created = await personRepo.save(personData);
      const createdId = (created as Record<string, unknown>).id as string;

      this.logger.log(
        `Created Person ${createdId} from call phone ${normalizedPhone}`,
      );

      return createdId;
    } catch (error) {
      this.logger.error(
        `Failed to create Person for phone ${normalizedPhone}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return null;
    }
  }

  private async findOrCreateLeadSource(
    sourceName: string | null,
    listId: string | undefined,
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
      const data: Record<string, unknown> = { name: sourceName };

      if (listId) {
        data.convosoListId = listId;
      }

      const created = await leadSourceRepo.save(data);

      this.logger.log(`Created new Lead Source: "${sourceName}"`);

      return (created as Record<string, unknown>).id as string;
    } catch (error) {
      this.logger.error(
        `Failed to create Lead Source "${sourceName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return null;
    }
  }

  // Compute billing by matching queue/source name against Lead Source names.
  // Mirrors old Cloudflare Worker logic: the queue name determines the cost,
  // not the person's assigned lead source. Only inbound calls are billable.
  private async computeBillingByQueueName(
    billingLabel: string | null,
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

    if (direction !== 'INBOUND' || !billingLabel) {
      return noBill;
    }

    const leadSourceRepo = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'leadSource',
      { shouldBypassPermissionChecks: true },
    );

    // Fetch all lead sources and find one whose name matches the queue/source label
    const allSources = (await leadSourceRepo.find()) as Array<
      Record<string, unknown>
    >;

    const labelLower = billingLabel.toLowerCase();
    const labelWords = labelLower.split(/\s+/);
    let matchedSource: Record<string, unknown> | null = null;
    let bestMatchWords = 0;

    for (const source of allSources) {
      const sourceName = ((source.name as string) || '').toLowerCase();

      if (!sourceName) continue;

      // Exact match — highest priority
      if (sourceName === labelLower) {
        matchedSource = source;
        break;
      }

      // Substring match (full name contained in the other)
      if (labelLower.includes(sourceName) || sourceName.includes(labelLower)) {
        matchedSource = source;
        bestMatchWords = 999;
        continue;
      }

      // Word-prefix match: count how many leading words are identical
      // e.g. "Slate U65 Live Transfers" matches "Slate U65 Leads" (2 words: "slate", "u65")
      const sourceWords = sourceName.split(/\s+/);
      let matchingWords = 0;

      for (
        let i = 0;
        i < Math.min(labelWords.length, sourceWords.length);
        i++
      ) {
        if (labelWords[i] === sourceWords[i]) {
          matchingWords++;
        } else {
          break;
        }
      }

      // Require at least 2 matching leading words to avoid false positives
      if (matchingWords >= 2 && matchingWords > bestMatchWords) {
        matchedSource = source;
        bestMatchWords = matchingWords;
      }
    }

    if (!matchedSource) {
      return noBill;
    }

    const costPerCall = matchedSource.costPerCall as
      | { amountMicros?: number }
      | undefined;
    const costMicros = costPerCall?.amountMicros ?? 0;
    const minDuration = (matchedSource.minimumCallDuration as number) ?? 0;

    if (costMicros === 0) {
      return noBill;
    }

    const meetsDuration = minDuration === 0 || duration >= minDuration;

    return {
      billable: meetsDuration,
      costAmountMicros: meetsDuration ? costMicros : 0,
      costCurrencyCode: 'USD',
    };
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

  // Convoso API returns dates in America/Los_Angeles local time (e.g. "2026-02-19 09:45:09").
  // Convert to UTC ISO string, handling PST (UTC-8) and PDT (UTC-7) correctly.
  private convertConvosoDateToISO(dateStr: string | undefined): string | null {
    if (!dateStr) return null;

    const match = dateStr.match(
      /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
    );

    if (!match) {
      // Already ISO or unknown format — parse as-is
      const d = new Date(dateStr);

      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
    const [year, month, day, hour, minute, second] = [
      yearStr,
      monthStr,
      dayStr,
      hourStr,
      minuteStr,
      secondStr,
    ].map(Number);

    // Try PST (UTC-8) first — standard time (Nov–Mar)
    const asPst = new Date(
      Date.UTC(year, month - 1, day, hour + 8, minute, second),
    );

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(asPst);

    const laHour = parseInt(
      parts.find((p) => p.type === 'hour')?.value || '0',
      10,
    );

    if (laHour === hour) {
      return asPst.toISOString();
    }

    // Fall back to PDT (UTC-7)
    return new Date(
      Date.UTC(year, month - 1, day, hour + 7, minute, second),
    ).toISOString();
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
