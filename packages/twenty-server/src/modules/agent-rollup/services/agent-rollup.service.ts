import { Injectable, Logger } from '@nestjs/common';

import chunk from 'lodash.chunk';
import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { getJoinColumnNameForRelationField } from 'src/engine/metadata-modules/field-metadata/utils/get-join-column-name-for-relation-field.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { findFlatFieldMetadataByName } from 'src/engine/metadata-modules/flat-field-metadata/utils/find-flat-field-metadata-by-name.util';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { getFlatFieldsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/utils/get-flat-fields-for-flat-object-metadata.util';
import { TwentyOrmException } from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const AGENT_PROFILE_OBJECT_NAME = 'agentProfile';
const TIME_CARD_OBJECT_NAME = 'timeCard';
const TIME_CARD_AGENT_FIELD_NAME = 'agent';
const PLACED_STATUS = 'ACTIVE_PLACED';

// Trailing windows (revisable). Total policies is all-time; placement rate uses
// a 6-month window by effective date; productivity uses a recent 30-day window.
const PLACEMENT_WINDOW_DAYS = 183; // ~6 months
const PRODUCTIVITY_WINDOW_DAYS = 30;

type AgentMetrics = {
  totalPolicies: number;
  placementRate6mo: number;
  billableHours: number;
  offPhoneHours: number;
  qaEvents: number;
  qaEvents30d: number;
  qaPassed: number;
  qaFailed: number;
  // Null when there is no data to base them on, so the native view shows
  // blank rather than a misleading 0%.
  qaFailedRate: number | null;
  qaLatestScore: number | null;
  qaAvgScore30d: number | null;
  qaSales30d: number;
  qaCoachingRate: number | null;
};

type AgentRollupFieldName = keyof AgentMetrics;

type StoredAgentMetrics = Partial<
  Record<AgentRollupFieldName, number | string | null>
>;

type StoredAgentProfile = StoredAgentMetrics & { id: string };

// Field names are unprefixed: the agentProfile object already gives the context.
const ROLLUP_FIELDS: {
  name: AgentRollupFieldName;
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
  // Compliance QA rollups (power the native QA Agents Dashboard view)
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

const ROLLUP_FIELD_NAMES = ROLLUP_FIELDS.map(({ name }) => name);

// Per-agent leaderboard metrics written onto agentProfile fields, so dashboards
// can rank agents natively (there are no rollup or formula fields upstream).
@Injectable()
export class AgentRollupService {
  private readonly logger = new Logger(AgentRollupService.name);

  constructor(
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  async computeWorkspace(workspaceId: string): Promise<number> {
    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ]);

    const agentProfileFlatObjectMetadata = findFlatObjectMetadataByName({
      objectName: AGENT_PROFILE_OBJECT_NAME,
      flatObjectMetadataMaps,
    });

    if (!isDefined(agentProfileFlatObjectMetadata)) {
      this.logger.warn(
        `Skipping agent rollups: no agentProfile object in workspace ${workspaceId}`,
      );

      return 0;
    }

    await this.ensureRollupFields({
      workspaceId,
      agentProfileFlatObjectMetadata,
      flatFieldMetadataMaps,
    });

    const timeCardAgentJoinColumnName = findTimeCardAgentJoinColumnName({
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    });

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const metricsByAgentId = await this.aggregateMetrics({
        workspaceId,
        timeCardAgentJoinColumnName,
      });

      return this.writeChangedMetrics({ workspaceId, metricsByAgentId });
    }, buildSystemAuthContext(workspaceId));
  }

  private async ensureRollupFields({
    workspaceId,
    agentProfileFlatObjectMetadata,
    flatFieldMetadataMaps,
  }: {
    workspaceId: string;
    agentProfileFlatObjectMetadata: FlatObjectMetadata;
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  }): Promise<void> {
    const existingFieldNames = new Set(
      getFlatFieldsFromFlatObjectMetadata(
        agentProfileFlatObjectMetadata,
        flatFieldMetadataMaps,
      ).map((flatFieldMetadata) => flatFieldMetadata.name),
    );

    const missingRollupFields = ROLLUP_FIELDS.filter(
      (rollupField) => !existingFieldNames.has(rollupField.name),
    );

    if (missingRollupFields.length === 0) {
      return;
    }

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: missingRollupFields.map((rollupField) => ({
        objectMetadataId: agentProfileFlatObjectMetadata.id,
        type: FieldMetadataType.NUMBER,
        name: rollupField.name,
        label: rollupField.label,
        description: rollupField.description,
        icon: rollupField.icon,
        isLabelSyncedWithName: false,
      })),
      workspaceId,
    });

    this.logger.log(
      `Created ${missingRollupFields.length} rollup field(s) on agentProfile in workspace ${workspaceId}`,
    );
  }

  private async aggregateMetrics({
    workspaceId,
    timeCardAgentJoinColumnName,
  }: {
    workspaceId: string;
    timeCardAgentJoinColumnName: string | undefined;
  }): Promise<Map<string, AgentMetrics>> {
    const placementSince = daysAgoIso(PLACEMENT_WINDOW_DAYS);
    const productivitySince = daysAgoIso(PRODUCTIVITY_WINDOW_DAYS);

    const metricsByAgentId = new Map<string, AgentMetrics>();
    const getOrCreateAgentMetrics = (agentId: string): AgentMetrics => {
      const existingMetrics = metricsByAgentId.get(agentId);

      if (isDefined(existingMetrics)) {
        return existingMetrics;
      }

      const freshMetrics: AgentMetrics = {
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

      metricsByAgentId.set(agentId, freshMetrics);

      return freshMetrics;
    };

    // System job: rollups count every agent's records, whatever any role can read
    const policyRows = await this.workspaceOrmManager
      .getRepositoryWithoutPermissionChecks('policy')
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

    for (const policyRow of policyRows) {
      const agentMetrics = getOrCreateAgentMetrics(policyRow.agentId);
      const written = Number(policyRow.written) || 0;
      const placed = Number(policyRow.placed) || 0;

      agentMetrics.totalPolicies = Number(policyRow.total) || 0;
      agentMetrics.qaSales30d = Number(policyRow.sales30d) || 0;
      agentMetrics.placementRate6mo =
        written > 0 ? round1((placed / written) * 100) : 0;
    }

    // Time card: billable hours and login seconds (30d). The object or its
    // agent relation may be absent in a workspace.
    const loginSecondsByAgentId = new Map<string, number>();

    if (!isDefined(timeCardAgentJoinColumnName)) {
      this.logger.warn(
        `timeCard rollups skipped in workspace ${workspaceId}: no timeCard agent relation`,
      );
    } else {
      try {
        const timeCardAgentColumn = `"tc".${escapeIdentifier(
          timeCardAgentJoinColumnName,
        )}`;

        const timeCardRows = await this.workspaceOrmManager
          .getRepositoryWithoutPermissionChecks(TIME_CARD_OBJECT_NAME)
          .createQueryBuilder('tc')
          .select(timeCardAgentColumn, 'agentId')
          .addSelect('SUM(COALESCE("tc"."billableHours", 0))', 'billableHours')
          .addSelect('SUM(COALESCE("tc"."loginSeconds", 0))', 'loginSeconds')
          .where(`${timeCardAgentColumn} IS NOT NULL`)
          .andWhere('"tc"."date" >= :productivitySince', { productivitySince })
          .groupBy(timeCardAgentColumn)
          .getRawMany<{
            agentId: string;
            billableHours: string;
            loginSeconds: string;
          }>();

        for (const timeCardRow of timeCardRows) {
          getOrCreateAgentMetrics(timeCardRow.agentId).billableHours = round1(
            Number(timeCardRow.billableHours) || 0,
          );
          loginSecondsByAgentId.set(
            timeCardRow.agentId,
            Number(timeCardRow.loginSeconds) || 0,
          );
        }
      } catch (error) {
        this.logger.warn(
          `timeCard rollups skipped in workspace ${workspaceId} (${getRollupErrorLogLabel(error)})`,
        );
      }
    }

    // Call: talk seconds (30d), so off-phone = login - talk.
    try {
      const callRows = await this.workspaceOrmManager
        .getRepositoryWithoutPermissionChecks('call')
        .createQueryBuilder('call')
        .select('"call"."agentId"', 'agentId')
        .addSelect('SUM(COALESCE("call"."duration", 0))', 'talkSeconds')
        .where('"call"."agentId" IS NOT NULL')
        .andWhere('"call"."callDate" >= :productivitySince', {
          productivitySince,
        })
        .groupBy('"call"."agentId"')
        .getRawMany<{ agentId: string; talkSeconds: string }>();

      const talkSecondsByAgentId = new Map(
        callRows.map((callRow) => [
          callRow.agentId,
          Number(callRow.talkSeconds) || 0,
        ]),
      );

      for (const [agentId, loginSeconds] of loginSecondsByAgentId) {
        const talkSeconds = talkSecondsByAgentId.get(agentId) ?? 0;
        const offPhoneSeconds = Math.max(0, loginSeconds - talkSeconds);

        getOrCreateAgentMetrics(agentId).offPhoneHours = round1(
          offPhoneSeconds / 3600,
        );
      }
    } catch (error) {
      this.logger.warn(
        `call rollups skipped in workspace ${workspaceId} (${getRollupErrorLogLabel(error)})`,
      );
    }

    // QA scorecards: events, pass/fail, scores (30d), coaching. The QA app may
    // be absent in a workspace.
    try {
      const qaScorecardRepository =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
          'qaScorecard',
        );

      const qaRows = await qaScorecardRepository
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

      for (const qaRow of qaRows) {
        const agentMetrics = getOrCreateAgentMetrics(qaRow.agentId);

        agentMetrics.qaEvents = Number(qaRow.events) || 0;
        agentMetrics.qaEvents30d = Number(qaRow.events30d) || 0;
        agentMetrics.qaPassed = Number(qaRow.passed) || 0;
        agentMetrics.qaFailed = Number(qaRow.failed) || 0;

        const scoredCount = agentMetrics.qaPassed + agentMetrics.qaFailed;

        agentMetrics.qaFailedRate =
          scoredCount > 0
            ? round1((agentMetrics.qaFailed / scoredCount) * 100)
            : null;
        agentMetrics.qaAvgScore30d =
          qaRow.avgScore30 !== null ? round1(Number(qaRow.avgScore30)) : null;
      }

      const latestScoreRows = await qaScorecardRepository
        .createQueryBuilder('qa')
        .distinctOn(['qa.agentId'])
        .select('"qa"."agentId"', 'agentId')
        .addSelect('"qa"."score"', 'score')
        .where('"qa"."agentId" IS NOT NULL')
        .andWhere('"qa"."score" IS NOT NULL')
        .orderBy('"qa"."agentId"')
        .addOrderBy('"qa"."analyzedAt"', 'DESC')
        .getRawMany<{ agentId: string; score: string | number | null }>();

      for (const latestScoreRow of latestScoreRows) {
        if (latestScoreRow.score !== null) {
          getOrCreateAgentMetrics(latestScoreRow.agentId).qaLatestScore =
            round1(Number(latestScoreRow.score));
        }
      }

      // Coaching completion: follow-up tasks done / total, per agent. Tasks
      // link to the scorecard, so statuses come from the task table.
      const taskLinks = await qaScorecardRepository
        .createQueryBuilder('qa')
        .select('"qa"."agentId"', 'agentId')
        .addSelect('"qa"."taskId"', 'taskId')
        .where('"qa"."agentId" IS NOT NULL')
        .andWhere('"qa"."taskId" IS NOT NULL')
        .getRawMany<{ agentId: string; taskId: string }>();

      if (taskLinks.length > 0) {
        const taskIds = [...new Set(taskLinks.map(({ taskId }) => taskId))];

        const taskRows = await this.workspaceOrmManager
          .getRepositoryWithoutPermissionChecks('task')
          .createQueryBuilder('task')
          .select('"task"."id"', 'id')
          .addSelect('"task"."status"::text', 'status')
          .where('"task"."id" IN (:...taskIds)', { taskIds })
          .getRawMany<{ id: string; status: string | null }>();

        const taskStatusById = new Map(
          taskRows.map((taskRow) => [taskRow.id, taskRow.status]),
        );

        const taskCountByAgentId = new Map<string, number>();
        const doneTaskCountByAgentId = new Map<string, number>();

        for (const { agentId, taskId } of taskLinks) {
          taskCountByAgentId.set(
            agentId,
            (taskCountByAgentId.get(agentId) ?? 0) + 1,
          );

          if (taskStatusById.get(taskId) === 'DONE') {
            doneTaskCountByAgentId.set(
              agentId,
              (doneTaskCountByAgentId.get(agentId) ?? 0) + 1,
            );
          }
        }

        for (const [agentId, taskCount] of taskCountByAgentId) {
          if (taskCount > 0) {
            getOrCreateAgentMetrics(agentId).qaCoachingRate = round1(
              ((doneTaskCountByAgentId.get(agentId) ?? 0) / taskCount) * 100,
            );
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `QA rollups skipped in workspace ${workspaceId} (${getRollupErrorLogLabel(error)})`,
      );
    }

    return metricsByAgentId;
  }

  private async writeChangedMetrics({
    workspaceId,
    metricsByAgentId,
  }: {
    workspaceId: string;
    metricsByAgentId: Map<string, AgentMetrics>;
  }): Promise<number> {
    if (metricsByAgentId.size === 0) {
      return 0;
    }

    // System write; without events the hourly run stays out of webhooks, workflows and the timeline
    const agentProfileRepository =
      this.workspaceOrmManager.getRepositoryWithoutPermissionChecks<StoredAgentProfile>(
        AGENT_PROFILE_OBJECT_NAME,
        { shouldSkipEventEmission: true },
      );

    const storedAgentProfiles = await agentProfileRepository.find({
      where: { id: In([...metricsByAgentId.keys()]) },
      select: ['id', ...ROLLUP_FIELD_NAMES],
    });

    const storedMetricsByAgentId = new Map(
      storedAgentProfiles.map((storedAgentProfile) => [
        storedAgentProfile.id,
        storedAgentProfile,
      ]),
    );

    // Agents missing here are deleted, so there is nothing to update
    const changedAgentUpdates = [...metricsByAgentId]
      .filter(([agentId, metrics]) => {
        const storedMetrics = storedMetricsByAgentId.get(agentId);

        return (
          isDefined(storedMetrics) &&
          haveAgentMetricsChanged({ storedMetrics, metrics })
        );
      })
      .map(([agentId, metrics]) => ({
        criteria: agentId,
        partialEntity: metrics,
      }));

    let updatedCount = 0;
    let failedCount = 0;

    for (const agentUpdatesChunk of chunk(
      changedAgentUpdates,
      QUERY_MAX_RECORDS,
    )) {
      try {
        const { affected } =
          await agentProfileRepository.updateMany(agentUpdatesChunk);

        updatedCount += affected ?? 0;
      } catch (error) {
        // A failed chunk is retried by the next run; the others still land
        failedCount += agentUpdatesChunk.length;
        this.logger.warn(
          `Rollup write failed for ${agentUpdatesChunk.length} agent(s) in workspace ${workspaceId} (${getRollupErrorLogLabel(error)})`,
        );
      }
    }

    this.logger.log(
      `Wrote rollups for ${updatedCount} changed agent(s)${
        failedCount > 0 ? ` (${failedCount} failed, re-run to fill)` : ''
      } in workspace ${workspaceId}`,
    );

    return updatedCount;
  }
}

const findFlatObjectMetadataByName = ({
  objectName,
  flatObjectMetadataMaps,
}: {
  objectName: string;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): FlatObjectMetadata | undefined => {
  const objectMetadataId = buildObjectIdByNameMaps(flatObjectMetadataMaps)
    .idByNameSingular[objectName];

  return isDefined(objectMetadataId)
    ? findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: objectMetadataId,
        flatEntityMaps: flatObjectMetadataMaps,
      })
    : undefined;
};

const findTimeCardAgentJoinColumnName = ({
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
}): string | undefined => {
  const timeCardFlatObjectMetadata = findFlatObjectMetadataByName({
    objectName: TIME_CARD_OBJECT_NAME,
    flatObjectMetadataMaps,
  });

  if (!isDefined(timeCardFlatObjectMetadata)) {
    return undefined;
  }

  const agentFlatFieldMetadata = findFlatFieldMetadataByName({
    fieldName: TIME_CARD_AGENT_FIELD_NAME,
    flatObjectMetadata: timeCardFlatObjectMetadata,
    flatFieldMetadataMaps,
  });

  if (
    !isDefined(agentFlatFieldMetadata) ||
    !isFlatFieldMetadataOfType(
      agentFlatFieldMetadata,
      FieldMetadataType.RELATION,
    ) ||
    agentFlatFieldMetadata.settings?.relationType !== RelationType.MANY_TO_ONE
  ) {
    return undefined;
  }

  return getJoinColumnNameForRelationField(agentFlatFieldMetadata);
};

// Stored and computed nulls both mean "no value", so a null metric doesn't churn
const isStoredMetricEqual = (
  storedValue: number | string | null | undefined,
  computedValue: number | null,
): boolean =>
  isDefined(storedValue)
    ? computedValue !== null && Number(storedValue) === computedValue
    : computedValue === null;

const haveAgentMetricsChanged = ({
  storedMetrics,
  metrics,
}: {
  storedMetrics: StoredAgentMetrics;
  metrics: AgentMetrics;
}): boolean =>
  ROLLUP_FIELD_NAMES.some(
    (rollupFieldName) =>
      !isStoredMetricEqual(
        storedMetrics[rollupFieldName],
        metrics[rollupFieldName],
      ),
  );

// ORM messages can quote the values being written, so logs keep only the ORM code
const getRollupErrorLogLabel = (error: unknown): string => {
  if (error instanceof TwentyOrmException) {
    return error.code;
  }

  return error instanceof Error ? error.message : 'Unknown error';
};

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const round1 = (value: number): number => Math.round(value * 10) / 10;
