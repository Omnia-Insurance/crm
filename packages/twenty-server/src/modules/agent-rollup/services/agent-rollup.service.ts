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
  // --- Compliance QA rollups (power the native QA Agents Dashboard view) ---
  {
    name: 'qaEvents',
    label: 'QA Events (All Time)',
    icon: 'IconClipboardCheck',
    description: 'Total QA scorecards generated for this agent (all-time).',
  },
  {
    name: 'qaEvents30d',
    label: 'QA Events (30d)',
    icon: 'IconClipboardCheck',
    description: 'QA scorecards analyzed for this agent over the last 30 days.',
  },
  {
    name: 'qaPassed',
    label: 'QA Passed (All Time)',
    icon: 'IconCircleCheck',
    description: 'QA scorecards with a Pass result (all-time).',
  },
  {
    name: 'qaFailed',
    label: 'QA Failed (All Time)',
    icon: 'IconCircleX',
    description: 'QA scorecards with a Fail result (all-time).',
  },
  {
    name: 'qaFailedRate',
    label: 'QA Failed % (All Time)',
    icon: 'IconChartPie',
    description:
      'Share of scored (Pass + Fail) QA scorecards that failed, all-time. Blank when the agent has no scored calls.',
  },
  {
    name: 'qaLatestScore',
    label: 'QA Latest Score (%)',
    icon: 'IconPercentage',
    description: 'Score of the agent’s most recently analyzed QA scorecard.',
  },
  {
    name: 'qaAvgScore30d',
    label: 'QA Avg Score 30d (%)',
    icon: 'IconPercentage',
    description:
      'Average QA score over the last 30 days (scorecards with a numeric score).',
  },
  {
    name: 'qaSales30d',
    label: 'Sales (30d)',
    icon: 'IconFileText',
    description:
      'Policies submitted by this agent over the last 30 days (by submitted date).',
  },
  {
    name: 'qaCoachingRate',
    label: 'Coaching Completion % (All Time)',
    icon: 'IconChecklist',
    description:
      'Share of the agent’s QA follow-up tasks that are completed. Blank when no follow-up tasks exist.',
  },
];

type AgentMetrics = {
  totalPolicies: number;
  placementRate6mo: number;
  billableHours: number;
  offPhoneHours: number;
  qaEvents: number;
  qaEvents30d: number;
  qaPassed: number;
  qaFailed: number;
  // Rates/scores are null when there is no data to base them on, so the native
  // view shows blank rather than a misleading 0%.
  qaFailedRate: number | null;
  qaLatestScore: number | null;
  qaAvgScore30d: number | null;
  qaSales30d: number;
  qaCoachingRate: number | null;
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
            qaEvents: 0,
            qaEvents30d: 0,
            qaPassed: 0,
            qaFailed: 0,
            qaFailedRate: null,
            qaLatestScore: null,
            qaAvgScore30d: null,
            qaSales30d: 0,
            qaCoachingRate: null,
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
          .addSelect(
            `COUNT(*) FILTER (WHERE "policy"."submittedDate" >= :productivitySince)`,
            'sales30d',
          )
          .where('"policy"."agentId" IS NOT NULL')
          .setParameters({
            placementSince,
            placedStatus: PLACED_STATUS,
            productivitySince,
          })
          .groupBy('"policy"."agentId"')
          .getRawMany<{
            agentId: string;
            total: string;
            written: string;
            placed: string;
            sales30d: string;
          }>();

        for (const row of policyRows) {
          const m = ensure(row.agentId);

          m.totalPolicies = Number(row.total) || 0;
          m.qaSales30d = Number(row.sales30d) || 0;
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

        // --- QA scorecards: events, pass/fail, scores (30d), coaching. The QA
        // app may be absent in a workspace, so this is defensive. ---
        try {
          const qaRepo = await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            'qaScorecard',
            { shouldBypassPermissionChecks: true },
          );

          const qaRows = await qaRepo
            .createQueryBuilder('qa')
            .select('"qa"."agentId"', 'agentId')
            .addSelect('COUNT(*)', 'events')
            .addSelect(
              `COUNT(*) FILTER (WHERE "qa"."analyzedAt" >= :productivitySince)`,
              'events30d',
            )
            .addSelect(
              `COUNT(*) FILTER (WHERE "qa"."result"::text = 'PASS')`,
              'passed',
            )
            .addSelect(
              `COUNT(*) FILTER (WHERE "qa"."result"::text = 'FAIL')`,
              'failed',
            )
            .addSelect(
              `AVG("qa"."score") FILTER (WHERE "qa"."analyzedAt" >= :productivitySince AND "qa"."score" IS NOT NULL)`,
              'avgScore30',
            )
            .where('"qa"."agentId" IS NOT NULL')
            .setParameters({ productivitySince })
            .groupBy('"qa"."agentId"')
            .getRawMany<{
              agentId: string;
              events: string;
              events30d: string;
              passed: string;
              failed: string;
              avgScore30: string | null;
            }>();

          for (const row of qaRows) {
            const m = ensure(row.agentId);

            m.qaEvents = Number(row.events) || 0;
            m.qaEvents30d = Number(row.events30d) || 0;
            m.qaPassed = Number(row.passed) || 0;
            m.qaFailed = Number(row.failed) || 0;

            const scored = m.qaPassed + m.qaFailed;

            m.qaFailedRate =
              scored > 0 ? round1((m.qaFailed / scored) * 100) : null;
            m.qaAvgScore30d =
              row.avgScore30 !== null ? round1(Number(row.avgScore30)) : null;
          }

          // Latest score: the most recent analyzed scorecard with a score.
          const latestRows = await qaRepo
            .createQueryBuilder('qa')
            .select('DISTINCT ON ("qa"."agentId") "qa"."agentId"', 'agentId')
            .addSelect('"qa"."score"', 'score')
            .where('"qa"."agentId" IS NOT NULL')
            .andWhere('"qa"."score" IS NOT NULL')
            .orderBy('"qa"."agentId"')
            .addOrderBy('"qa"."analyzedAt"', 'DESC')
            .getRawMany<{ agentId: string; score: string | null }>();

          for (const row of latestRows) {
            if (row.score !== null) {
              ensure(row.agentId).qaLatestScore = round1(Number(row.score));
            }
          }

          // Coaching completion: follow-up tasks done / total, per agent. Tasks
          // link to the scorecard, so resolve statuses from the task table.
          const taskLinks = await qaRepo
            .createQueryBuilder('qa')
            .select('"qa"."agentId"', 'agentId')
            .addSelect('"qa"."taskId"', 'taskId')
            .where('"qa"."agentId" IS NOT NULL')
            .andWhere('"qa"."taskId" IS NOT NULL')
            .getRawMany<{ agentId: string; taskId: string }>();

          if (taskLinks.length > 0) {
            const taskRepo = await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'task',
              { shouldBypassPermissionChecks: true },
            );
            const taskIds = [...new Set(taskLinks.map((link) => link.taskId))];
            const taskRows = await taskRepo
              .createQueryBuilder('task')
              .select('"task"."id"', 'id')
              .addSelect('"task"."status"::text', 'status')
              .where('"task"."id" IN (:...taskIds)', { taskIds })
              .getRawMany<{ id: string; status: string | null }>();
            const statusById = new Map(
              taskRows.map((row) => [row.id, row.status]),
            );

            const totalByAgent = new Map<string, number>();
            const doneByAgent = new Map<string, number>();

            for (const link of taskLinks) {
              totalByAgent.set(
                link.agentId,
                (totalByAgent.get(link.agentId) ?? 0) + 1,
              );
              if (statusById.get(link.taskId) === 'DONE') {
                doneByAgent.set(
                  link.agentId,
                  (doneByAgent.get(link.agentId) ?? 0) + 1,
                );
              }
            }

            for (const [agentId, total] of totalByAgent) {
              if (total > 0) {
                ensure(agentId).qaCoachingRate = round1(
                  ((doneByAgent.get(agentId) ?? 0) / total) * 100,
                );
              }
            }
          }
        } catch (error) {
          this.logger.warn(
            `  QA rollups skipped (${
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

        // Load current values so we only write agents whose metrics actually
        // changed — avoids churning every agent record (and its change
        // webhooks) on every scheduled run.
        const agentIds = [...metricsByAgentId.keys()];
        const currentRows = await agentRepo
          .createQueryBuilder('agentProfile')
          .select('agentProfile.id', 'id')
          .addSelect('agentProfile.totalPolicies', 'totalPolicies')
          .addSelect('agentProfile.placementRate6mo', 'placementRate6mo')
          .addSelect('agentProfile.billableHours', 'billableHours')
          .addSelect('agentProfile.offPhoneHours', 'offPhoneHours')
          .addSelect('agentProfile.qaEvents', 'qaEvents')
          .addSelect('agentProfile.qaEvents30d', 'qaEvents30d')
          .addSelect('agentProfile.qaPassed', 'qaPassed')
          .addSelect('agentProfile.qaFailed', 'qaFailed')
          .addSelect('agentProfile.qaFailedRate', 'qaFailedRate')
          .addSelect('agentProfile.qaLatestScore', 'qaLatestScore')
          .addSelect('agentProfile.qaAvgScore30d', 'qaAvgScore30d')
          .addSelect('agentProfile.qaSales30d', 'qaSales30d')
          .addSelect('agentProfile.qaCoachingRate', 'qaCoachingRate')
          .where('agentProfile.id IN (:...agentIds)', { agentIds })
          .getRawMany<Record<string, number | string | null>>();
        const currentByAgentId = new Map(
          currentRows.map((row) => [row.id as string, row]),
        );

        // Nullable-aware numeric equality: treats null/undefined as "no value"
        // so a genuine null metric doesn't churn against a stored null.
        const numEq = (
          stored: number | string | null | undefined,
          computed: number | null,
        ): boolean =>
          stored === null || stored === undefined
            ? computed === null
            : computed !== null && Number(stored) === computed;

        const isUnchanged = (
          current: Record<string, number | string | null> | undefined,
          metrics: AgentMetrics,
        ): boolean =>
          isDefined(current) &&
          current.totalPolicies !== null &&
          numEq(current.totalPolicies, metrics.totalPolicies) &&
          numEq(current.placementRate6mo, metrics.placementRate6mo) &&
          numEq(current.billableHours, metrics.billableHours) &&
          numEq(current.offPhoneHours, metrics.offPhoneHours) &&
          numEq(current.qaEvents, metrics.qaEvents) &&
          numEq(current.qaEvents30d, metrics.qaEvents30d) &&
          numEq(current.qaPassed, metrics.qaPassed) &&
          numEq(current.qaFailed, metrics.qaFailed) &&
          numEq(current.qaFailedRate, metrics.qaFailedRate) &&
          numEq(current.qaLatestScore, metrics.qaLatestScore) &&
          numEq(current.qaAvgScore30d, metrics.qaAvgScore30d) &&
          numEq(current.qaSales30d, metrics.qaSales30d) &&
          numEq(current.qaCoachingRate, metrics.qaCoachingRate);

        let updated = 0;
        let failed = 0;

        for (const [agentId, metrics] of metricsByAgentId) {
          if (isUnchanged(currentByAgentId.get(agentId), metrics)) {
            continue;
          }

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
          `  Wrote rollups for ${updated} changed agent(s)${
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
