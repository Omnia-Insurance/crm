import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

const AGENT_PROFILE_OBJECT = 'agentProfile';
const PLACED_STATUS = 'ACTIVE_PLACED';

// Trailing windows (revisable). Total policies is all-time; placement rate uses
// a 6-month window by effective date; productivity uses a recent 30-day window.
const PLACEMENT_WINDOW_DAYS = 183; // ~6 months
const PRODUCTIVITY_WINDOW_DAYS = 30;

// Rollup fields created on agentProfile (idempotent). Field names are unprefixed
// — the agentProfile object already provides the context.
const ROLLUP_FIELDS: {
  name: string;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    name: 'totalPolicies',
    label: 'Total Policies',
    icon: 'IconFileText',
    description: 'Total policies attributed to this agent (all-time).',
  },
  {
    name: 'placementRate6mo',
    label: 'Placement Rate 6mo (%)',
    icon: 'IconChartPie',
    description:
      'Share of the agent’s policies placed (ACTIVE_PLACED) over the last 6 months, by effective date.',
  },
  {
    name: 'billableHours',
    label: 'Billable Hours (30d)',
    icon: 'IconClockHour4',
    description: 'Sum of billable hours from time cards over the last 30 days.',
  },
  {
    name: 'offPhoneHours',
    label: 'Off-Phone Hours (30d)',
    icon: 'IconPhoneOff',
    description:
      'Logged-in time minus call talk time over the last 30 days (idle while logged in).',
  },
];

type AgentMetrics = {
  totalPolicies: number;
  placementRate6mo: number;
  billableHours: number;
  offPhoneHours: number;
};

/**
 * Computes per-agent performance rollups (total policies, 6-month placement
 * rate, billable hours, off-phone idle hours) and writes them onto agentProfile
 * fields, so they can be displayed/ranked natively in a leaderboard dashboard.
 * Idempotent: ensures the fields exist, then recomputes and overwrites.
 */
@Injectable()
export class AgentRollupService {
  private readonly logger = new Logger(AgentRollupService.name);

  constructor(
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async computeWorkspace(workspaceId: string): Promise<number> {
    const agentObject = await this.objectMetadataRepository.findOne({
      where: { workspaceId, nameSingular: AGENT_PROFILE_OBJECT },
    });

    if (!isDefined(agentObject)) {
      this.logger.warn(
        `  Skipping: agentProfile object not found in workspace ${workspaceId}`,
      );

      return 0;
    }

    await this.ensureRollupFields({
      workspaceId,
      objectMetadataId: agentObject.id,
    });

    const metricsByAgentId = await this.aggregateMetrics(workspaceId);

    return this.writeBack(workspaceId, metricsByAgentId);
  }

  private async ensureRollupFields({
    workspaceId,
    objectMetadataId,
  }: {
    workspaceId: string;
    objectMetadataId: string;
  }): Promise<void> {
    const existing = await this.fieldMetadataRepository.find({
      where: { workspaceId, objectMetadataId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((field) => field.name));

    const missing = ROLLUP_FIELDS.filter(
      (field) => !existingNames.has(field.name),
    );

    if (missing.length === 0) {
      return;
    }

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: missing.map((field) => ({
        objectMetadataId,
        type: FieldMetadataType.NUMBER,
        name: field.name,
        label: field.label,
        description: field.description,
        icon: field.icon,
        isLabelSyncedWithName: false,
      })),
      workspaceId,
    });

    this.logger.log(
      `  Created ${missing.length} rollup field(s) on agentProfile: ${missing
        .map((field) => field.name)
        .join(', ')}`,
    );
  }

  private async aggregateMetrics(
    workspaceId: string,
  ): Promise<Map<string, AgentMetrics>> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const placementSince = daysAgoIso(PLACEMENT_WINDOW_DAYS);
        const productivitySince = daysAgoIso(PRODUCTIVITY_WINDOW_DAYS);

        const metrics = new Map<string, AgentMetrics>();
        const ensure = (agentId: string): AgentMetrics => {
          const current = metrics.get(agentId);

          if (isDefined(current)) {
            return current;
          }

          const fresh: AgentMetrics = {
            totalPolicies: 0,
            placementRate6mo: 0,
            billableHours: 0,
            offPhoneHours: 0,
          };

          metrics.set(agentId, fresh);

          return fresh;
        };

        // --- Policy: all-time count + 6-month written/placed ---
        const policyRepo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'policy',
          { shouldBypassPermissionChecks: true },
        );
        const policyRows = await policyRepo
          .createQueryBuilder('policy')
          .select('"policy"."agentId"', 'agentId')
          .addSelect('COUNT(*)', 'total')
          .addSelect(
            `COUNT(*) FILTER (WHERE "policy"."effectiveDate" >= :placementSince)`,
            'written',
          )
          .addSelect(
            // status is a Postgres enum; cast to text so the bound string
            // parameter compares cleanly (avoids "enum = text" operator errors).
            `COUNT(*) FILTER (WHERE "policy"."effectiveDate" >= :placementSince AND "policy"."status"::text = :placedStatus)`,
            'placed',
          )
          .where('"policy"."agentId" IS NOT NULL')
          .setParameters({ placementSince, placedStatus: PLACED_STATUS })
          .groupBy('"policy"."agentId"')
          .getRawMany<{
            agentId: string;
            total: string;
            written: string;
            placed: string;
          }>();

        for (const row of policyRows) {
          const m = ensure(row.agentId);

          m.totalPolicies = Number(row.total) || 0;
          const written = Number(row.written) || 0;
          const placed = Number(row.placed) || 0;

          m.placementRate6mo =
            written > 0 ? round1((placed / written) * 100) : 0;
        }

        // --- Time card: billable hours + login seconds (30d). Defensive: the
        // timeCard object / agent relation may be absent in a workspace. ---
        const loginSecondsByAgent = new Map<string, number>();

        try {
          const timeCardRepo =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'timeCard',
              { shouldBypassPermissionChecks: true },
            );
          const agentColumn = resolveAgentColumn(timeCardRepo);

          const timeCardRows = await timeCardRepo
            .createQueryBuilder('tc')
            .select(`"tc".${agentColumn}`, 'agentId')
            .addSelect(
              'SUM(COALESCE("tc"."billableHours", 0))',
              'billableHours',
            )
            .addSelect('SUM(COALESCE("tc"."loginSeconds", 0))', 'loginSeconds')
            .where(`"tc".${agentColumn} IS NOT NULL`)
            .andWhere('"tc"."date" >= :productivitySince', {
              productivitySince,
            })
            .groupBy(`"tc".${agentColumn}`)
            .getRawMany<{
              agentId: string;
              billableHours: string;
              loginSeconds: string;
            }>();

          for (const row of timeCardRows) {
            const m = ensure(row.agentId);

            m.billableHours = round1(Number(row.billableHours) || 0);
            loginSecondsByAgent.set(row.agentId, Number(row.loginSeconds) || 0);
          }
        } catch (error) {
          this.logger.warn(
            `  timeCard rollups skipped (${
              error instanceof Error ? error.message : String(error)
            })`,
          );
        }

        // --- Call: talk seconds (30d) → off-phone = login - talk. Defensive. ---
        try {
          const callRepo = await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            'call',
            { shouldBypassPermissionChecks: true },
          );
          const callRows = await callRepo
            .createQueryBuilder('call')
            .select('"call"."agentId"', 'agentId')
            .addSelect('SUM(COALESCE("call"."duration", 0))', 'talkSeconds')
            .where('"call"."agentId" IS NOT NULL')
            .andWhere('"call"."callDate" >= :productivitySince', {
              productivitySince,
            })
            .groupBy('"call"."agentId"')
            .getRawMany<{ agentId: string; talkSeconds: string }>();

          const talkByAgent = new Map<string, number>();

          for (const row of callRows) {
            talkByAgent.set(row.agentId, Number(row.talkSeconds) || 0);
          }

          for (const [agentId, loginSeconds] of loginSecondsByAgent) {
            const talkSeconds = talkByAgent.get(agentId) ?? 0;
            const offPhoneSeconds = Math.max(0, loginSeconds - talkSeconds);

            ensure(agentId).offPhoneHours = round1(offPhoneSeconds / 3600);
          }
        } catch (error) {
          this.logger.warn(
            `  call rollups skipped (${
              error instanceof Error ? error.message : String(error)
            })`,
          );
        }

        return metrics;
      },
      authContext,
    );
  }

  private async writeBack(
    workspaceId: string,
    metricsByAgentId: Map<string, AgentMetrics>,
  ): Promise<number> {
    if (metricsByAgentId.size === 0) {
      return 0;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const agentRepo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          AGENT_PROFILE_OBJECT,
          { shouldBypassPermissionChecks: true },
        );

        let updated = 0;
        let failed = 0;

        for (const [agentId, metrics] of metricsByAgentId) {
          try {
            await agentRepo.update(agentId, metrics);
            updated += 1;
          } catch (error) {
            // The rollup fields were just created this run; if the repository
            // metadata is momentarily stale, a re-run fills them. Log, continue.
            failed += 1;
            this.logger.warn(
              `  write failed for agent ${agentId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        this.logger.log(
          `  Wrote rollups for ${updated} agent(s)${
            failed > 0 ? ` (${failed} failed — re-run to fill)` : ''
          } in workspace ${workspaceId}`,
        );

        return updated;
      },
      authContext,
    );
  }
}

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const round1 = (value: number): number => Math.round(value * 10) / 10;

// timeCard's agent FK column has historically been created as either `agentId`
// or `agentsId` depending on the workspace; pick whichever the entity exposes.
const resolveAgentColumn = (repo: {
  metadata: { columns: { databaseName: string }[] };
}): string => {
  const columnNames = repo.metadata.columns.map(
    (column) => column.databaseName,
  );

  if (columnNames.includes('agentId')) {
    return '"agentId"';
  }

  if (columnNames.includes('agentsId')) {
    return '"agentsId"';
  }

  throw new Error('timeCard has no agentId/agentsId column');
};
