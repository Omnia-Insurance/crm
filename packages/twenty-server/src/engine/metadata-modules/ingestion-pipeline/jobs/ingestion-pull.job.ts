import { Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { getOutboundRequestOutcome } from 'src/engine/core-modules/secure-http-client/utils/get-outbound-request-outcome.util';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';
import { type IngestionPullJobData } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';
import { IngestionPreprocessorRegistry } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/ingestion-preprocessor.registry';
import { type SourceAuthConfig } from 'src/engine/metadata-modules/ingestion-pipeline/types/source-auth-config.type';
import { type SourceRequestConfig } from 'src/engine/metadata-modules/ingestion-pipeline/types/source-request-config.type';
import { type PaginationConfig } from 'src/engine/metadata-modules/ingestion-pipeline/types/pagination-config.type';
import { extractValueByPath } from 'src/engine/metadata-modules/ingestion-pipeline/utils/extract-value-by-path.util';
import { getIngestionErrorLogLabel } from 'src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-error-log-label.util';
import { isAllowedIngestionPipelineAuthEnvVar } from 'src/engine/metadata-modules/ingestion-pipeline/utils/is-allowed-ingestion-pipeline-auth-env-var.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

// Bounds each outbound HTTP request to the source API, including paginated
// pages and the body read. Without this, a stalled upstream response leaves
// the ingestion log in `running` forever and blocks subsequent pulls.
const SOURCE_REQUEST_TIMEOUT_MS = 120_000;

@Processor(MessageQueue.ingestionQueue)
export class IngestionPullJob {
  private readonly logger = new Logger(IngestionPullJob.name);

  constructor(
    private readonly pipelineService: IngestionPipelineService,
    private readonly fieldMappingService: IngestionFieldMappingService,
    private readonly logService: IngestionLogService,
    private readonly recordProcessorService: IngestionRecordProcessorService,
    private readonly preprocessorRegistry: IngestionPreprocessorRegistry,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly secureHttpClientService: SecureHttpClientService,
  ) {}

  @Process(IngestionPullJob.name)
  async handle(data: IngestionPullJobData): Promise<void> {
    const {
      pipelineId,
      workspaceId,
      manual,
      startTimeOverride,
      endTimeOverride,
    } = data;

    this.logger.log(`Starting pull ingestion for pipeline ${pipelineId}`);

    const logId =
      data.logId ??
      (await this.logService.createPending(pipelineId, 'pull')).id;

    await this.logService.markRunning(logId);

    try {
      const pipeline = await this.pipelineService.findEntityById(
        pipelineId,
        workspaceId,
      );

      if (!isDefined(pipeline)) {
        await this.logService.markFailed(logId, 'Pipeline not found');

        return;
      }

      // Manual triggers (via the GraphQL mutation) bypass isEnabled so a
      // pipeline can be paused for backfill while still accepting manual
      // pulls. Scheduled jobs are gated upstream by the scheduler service,
      // which removes the cron entry when isEnabled flips to false.
      if (!pipeline.isEnabled && !manual) {
        await this.logService.markFailed(logId, 'Pipeline disabled');

        return;
      }

      if (!isDefined(pipeline.sourceUrl)) {
        await this.logService.markFailed(logId, 'No source URL configured');

        return;
      }

      const mappings = await this.fieldMappingService.findEntitiesByPipelineId(
        pipelineId,
        workspaceId,
      );

      if (mappings.length === 0) {
        await this.logService.markFailed(logId, 'No field mappings configured');

        return;
      }

      // Fetch records from source. Job-data overrides (from triggerIngestionPull)
      // take precedence over pipeline.sourceRequestConfig overrides — that's how
      // parallel backfill chunks pass per-trigger date windows without trampling
      // the shared pipeline config.
      const allRecords = await this.fetchRecords(pipeline, {
        startTimeOverride,
        endTimeOverride,
      });

      if (allRecords.length === 0) {
        await this.logService.markCompleted(logId, {
          totalRecordsReceived: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
        });

        return;
      }

      // Preprocessors read and write workspace records as the system: ingestion is not user-initiated
      const preprocessedRecords =
        await this.workspaceOrmManager.executeInWorkspaceContext(
          () =>
            this.preprocessorRegistry.preProcessRecords(
              allRecords,
              pipeline,
              workspaceId,
            ),
          buildSystemAuthContext(workspaceId),
        );

      this.logger.log(
        `Preprocessed ${preprocessedRecords.length} records for pipeline ${pipelineId}`,
      );

      const result = await this.recordProcessorService.processRecords(
        preprocessedRecords,
        pipeline,
        mappings,
        workspaceId,
      );

      await this.logService.markCompleted(logId, {
        totalRecordsReceived: allRecords.length,
        ...result,
      });

      this.logger.log(
        `Pull ingestion completed: pipeline=${pipelineId}, total=${allRecords.length}, created=${result.recordsCreated}, updated=${result.recordsUpdated}, failed=${result.recordsFailed}`,
      );
    } catch (error) {
      this.logger.error(
        `Pull ingestion failed: pipeline=${pipelineId}, error=${getIngestionErrorLogLabel(error)}`,
      );

      await this.logService.markFailed(
        logId,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async fetchRecords(
    pipeline: {
      id: string;
      sourceUrl: string | null;
      sourceHttpMethod: string | null;
      sourceAuthConfig: SourceAuthConfig | null;
      sourceRequestConfig: SourceRequestConfig | null;
      responseRecordsPath: string | null;
      paginationConfig: PaginationConfig | null;
    },
    triggerOverrides: {
      startTimeOverride?: string;
      endTimeOverride?: string;
    } = {},
  ): Promise<Record<string, unknown>[]> {
    // SSRF-safe: the source URL is admin-configurable
    const httpClient = this.secureHttpClientService.getHttpClient({
      timeout: SOURCE_REQUEST_TIMEOUT_MS,
    });
    const sourceAuthConfig = this.resolveSourceAuthConfig(pipeline);
    const allRecords: Record<string, unknown>[] = [];
    let hasMore = true;
    let page = 0;
    let cursor: string | null = null;

    while (hasMore) {
      const url = new URL(pipeline.sourceUrl!);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...pipeline.sourceRequestConfig?.headers,
      };

      // Apply auth
      if (isDefined(sourceAuthConfig)) {
        applyAuth(url, headers, sourceAuthConfig);
      }

      // Apply query params
      if (isDefined(pipeline.sourceRequestConfig?.queryParams)) {
        for (const [key, value] of Object.entries(
          pipeline.sourceRequestConfig!.queryParams!,
        )) {
          url.searchParams.set(key, value);
        }
      }

      // Apply dynamic date range params. Per-trigger overrides win over the
      // shared pipeline config; falling back to the config covers normal
      // lookback-driven cadence pulls.
      if (isDefined(pipeline.sourceRequestConfig?.dateRangeParams)) {
        const {
          startParam,
          endParam,
          lookbackMinutes,
          timezone,
          snapStartToDay,
        } = pipeline.sourceRequestConfig!.dateRangeParams!;

        const startTimeOverride =
          triggerOverrides.startTimeOverride ??
          pipeline.sourceRequestConfig!.dateRangeParams!.startTimeOverride;
        const endTimeOverride =
          triggerOverrides.endTimeOverride ??
          pipeline.sourceRequestConfig!.dateRangeParams!.endTimeOverride;

        if (isDefined(startTimeOverride) && isDefined(endTimeOverride)) {
          url.searchParams.set(startParam, startTimeOverride);
          url.searchParams.set(endParam, endTimeOverride);
        } else {
          // Normal lookback calculation
          const now = new Date();
          const since = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

          const formatDate = (date: Date): string =>
            date
              .toLocaleString('sv-SE', { timeZone: timezone })
              .replace(' ', 'T');

          // For per-day aggregate pipelines, snap the window start down to the
          // start of its calendar day so every still-in-window day stays fully
          // covered (otherwise the per-(entity,day) upsert overwrites complete
          // days with shrinking tail slices as they age out of the lookback).
          const startValue = snapStartToDay
            ? `${formatDate(since).split('T')[0]}T00:00:00`
            : formatDate(since);

          url.searchParams.set(startParam, startValue);
          url.searchParams.set(endParam, formatDate(now));
        }
      }

      // Apply pagination params
      if (isDefined(pipeline.paginationConfig)) {
        applyPagination(url, pipeline.paginationConfig, page, cursor);
      }

      const method = pipeline.sourceHttpMethod ?? 'GET';

      let responseData: Record<string, unknown>;

      try {
        const response = await httpClient.request<Record<string, unknown>>({
          url: url.toString(),
          method,
          headers,
          data:
            method === 'POST' ? pipeline.sourceRequestConfig?.body : undefined,
          validateStatus: () => true,
        });

        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `Source API returned ${response.status}: ${response.statusText}`,
          );
        }

        if (!isDefined(response.data) || typeof response.data !== 'object') {
          throw new Error('Source API returned a non-JSON response');
        }

        responseData = response.data;
      } catch (error) {
        if (getOutboundRequestOutcome(error) === 'timeout') {
          throw new Error(
            `Source API request timed out after ${SOURCE_REQUEST_TIMEOUT_MS}ms (page=${page})`,
          );
        }
        throw error;
      }

      // Extract records from response
      let records: Record<string, unknown>[];

      if (isDefined(pipeline.responseRecordsPath)) {
        const extracted = extractValueByPath(
          responseData,
          pipeline.responseRecordsPath,
        );

        records = Array.isArray(extracted)
          ? (extracted as Record<string, unknown>[])
          : [];
      } else if (Array.isArray(responseData)) {
        records = responseData as Record<string, unknown>[];
      } else {
        records = [responseData];
      }

      allRecords.push(...records);

      // Check if there are more pages
      if (!isDefined(pipeline.paginationConfig) || records.length === 0) {
        hasMore = false;
      } else {
        const pageSize = pipeline.paginationConfig.pageSize;

        if (records.length < pageSize) {
          hasMore = false;
        } else if (pipeline.paginationConfig.type === 'cursor') {
          const nextCursor = extractValueByPath(
            responseData,
            pipeline.paginationConfig.cursorPath,
          ) as string | null;

          if (!isDefined(nextCursor)) {
            hasMore = false;
          } else {
            cursor = nextCursor;
          }
        } else {
          page++;
        }
      }
    }

    return allRecords;
  }

  // envVar and sourceUrl come from API input: read the server env only for an allowed pair
  private resolveSourceAuthConfig(pipeline: {
    id: string;
    sourceUrl: string | null;
    sourceAuthConfig: SourceAuthConfig | null;
  }): SourceAuthConfig | null {
    const { sourceAuthConfig } = pipeline;

    if (
      sourceAuthConfig?.type !== 'query_param' ||
      !isDefined(sourceAuthConfig.envVar)
    ) {
      return sourceAuthConfig;
    }

    if (
      !isAllowedIngestionPipelineAuthEnvVar({
        envVarName: sourceAuthConfig.envVar,
        sourceUrl: pipeline.sourceUrl,
      })
    ) {
      this.logger.warn(
        `Skipped the query_param auth of pipeline ${pipeline.id}: its env var is not allowed for the source URL`,
      );

      return null;
    }

    return {
      type: 'query_param',
      paramName: sourceAuthConfig.paramName,
      value: process.env[sourceAuthConfig.envVar],
    };
  }
}

const applyAuth = (
  url: URL,
  headers: Record<string, string>,
  auth: SourceAuthConfig,
): void => {
  switch (auth.type) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token}`;
      break;
    case 'api_key':
      headers[auth.headerName] = auth.key;
      break;
    case 'query_param': {
      if (isDefined(auth.value)) {
        url.searchParams.set(auth.paramName, auth.value);
      }
      break;
    }
    case 'basic': {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString(
        'base64',
      );

      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }
  }
};

const applyPagination = (
  url: URL,
  config: PaginationConfig,
  page: number,
  cursor: string | null,
): void => {
  switch (config.type) {
    case 'offset':
      url.searchParams.set(config.paramName, String(page * config.pageSize));
      break;
    case 'page':
      url.searchParams.set(config.paramName, String(page + 1));
      break;
    case 'cursor':
      if (isDefined(cursor)) {
        url.searchParams.set(config.paramName, cursor);
      }
      break;
  }
};
