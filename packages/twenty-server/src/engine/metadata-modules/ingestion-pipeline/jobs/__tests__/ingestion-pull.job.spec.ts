import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { isUndefined } from '@sniptt/guards';
import { AxiosError } from 'axios';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { type IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { IngestionPreprocessorRegistry } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/ingestion-preprocessor.registry';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const pipelineId = 'pipeline-1';
const workspaceId = 'workspace-1';

const mockPipeline = {
  id: pipelineId,
  workspaceId,
  targetObjectNameSingular: 'person',
  mode: 'pull',
  isEnabled: true,
  sourceUrl: 'https://api.example.com/leads',
  sourceHttpMethod: 'GET',
  sourceAuthConfig: null,
  sourceRequestConfig: null,
  responseRecordsPath: 'data.entries',
  paginationConfig: null,
  dedupFieldNames: null,
} as unknown as IngestionPipelineEntity;

const mockMappings = [
  {
    id: 'map-1',
    pipelineId,
    sourceFieldPath: 'name',
    targetFieldName: 'name',
    targetCompositeSubField: 'firstName',
  } as IngestionFieldMappingEntity,
];

const mockLog = { id: 'log-1' };

const buildSourceResponse = (data: unknown) => ({
  status: 200,
  statusText: 'OK',
  data,
});

describe('IngestionPullJob', () => {
  let job: IngestionPullJob;
  let pipelineService: jest.Mocked<IngestionPipelineService>;
  let fieldMappingService: jest.Mocked<IngestionFieldMappingService>;
  let logService: jest.Mocked<IngestionLogService>;
  let recordProcessorService: jest.Mocked<IngestionRecordProcessorService>;
  let secureHttpClientService: { getHttpClient: jest.Mock };
  let workspaceOrmManager: { executeInWorkspaceContext: jest.Mock };
  let mockRequest: jest.Mock;

  beforeEach(async () => {
    mockRequest = jest.fn();
    secureHttpClientService = {
      getHttpClient: jest.fn().mockReturnValue({ request: mockRequest }),
    };
    workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback) => callback()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionPullJob,
        {
          provide: IngestionPipelineService,
          useValue: {
            findEntityById: jest.fn(),
          },
        },
        {
          provide: IngestionFieldMappingService,
          useValue: {
            findEntitiesByPipelineId: jest.fn(),
          },
        },
        {
          provide: IngestionLogService,
          useValue: {
            createPending: jest.fn().mockResolvedValue(mockLog),
            markRunning: jest.fn(),
            markCompleted: jest.fn(),
            markFailed: jest.fn(),
          },
        },
        {
          provide: IngestionRecordProcessorService,
          useValue: {
            processRecords: jest.fn(),
          },
        },
        {
          provide: IngestionPreprocessorRegistry,
          useValue: {
            preProcessRecords: jest
              .fn()
              .mockImplementation((records) => records),
          },
        },
        {
          provide: WorkspaceOrmManager,
          useValue: workspaceOrmManager,
        },
        {
          provide: SecureHttpClientService,
          useValue: secureHttpClientService,
        },
      ],
    }).compile();

    job = module.get<IngestionPullJob>(IngestionPullJob);
    pipelineService = module.get(IngestionPipelineService);
    fieldMappingService = module.get(IngestionFieldMappingService);
    logService = module.get(IngestionLogService);
    recordProcessorService = module.get(IngestionRecordProcessorService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fetch and process records from source API', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockResolvedValue(
      buildSourceResponse({
        data: { entries: [{ name: 'John' }, { name: 'Jane' }] },
      }),
    );
    recordProcessorService.processRecords.mockResolvedValue({
      recordsCreated: 2,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });

    await job.handle({ pipelineId, workspaceId });

    expect(logService.createPending).toHaveBeenCalledWith(pipelineId, 'pull');
    expect(logService.markRunning).toHaveBeenCalledWith('log-1');
    expect(fieldMappingService.findEntitiesByPipelineId).toHaveBeenCalledWith(
      pipelineId,
      workspaceId,
    );
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('https://api.example.com/leads'),
        method: 'GET',
      }),
    );
    expect(recordProcessorService.processRecords).toHaveBeenCalledWith(
      [{ name: 'John' }, { name: 'Jane' }],
      mockPipeline,
      mockMappings,
      workspaceId,
    );
    expect(logService.markCompleted).toHaveBeenCalledWith('log-1', {
      totalRecordsReceived: 2,
      recordsCreated: 2,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });
  });

  it('should complete the log of a manual trigger instead of creating a second one', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockResolvedValue(
      buildSourceResponse({ data: { entries: [{ name: 'John' }] } }),
    );
    recordProcessorService.processRecords.mockResolvedValue({
      recordsCreated: 1,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });

    await job.handle({
      pipelineId,
      workspaceId,
      manual: true,
      logId: 'trigger-log',
    });

    expect(logService.createPending).not.toHaveBeenCalled();
    expect(logService.markRunning).toHaveBeenCalledWith('trigger-log');
    expect(logService.markCompleted).toHaveBeenCalledTimes(1);
    expect(logService.markCompleted).toHaveBeenCalledWith('trigger-log', {
      totalRecordsReceived: 1,
      recordsCreated: 1,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });
    expect(logService.markFailed).not.toHaveBeenCalled();
  });

  it('should fail the log of a manual trigger instead of creating a second one', async () => {
    pipelineService.findEntityById.mockResolvedValue(null);

    await job.handle({
      pipelineId,
      workspaceId,
      manual: true,
      logId: 'trigger-log',
    });

    expect(logService.createPending).not.toHaveBeenCalled();
    expect(logService.markFailed).toHaveBeenCalledTimes(1);
    expect(logService.markFailed).toHaveBeenCalledWith(
      'trigger-log',
      'Pipeline not found',
    );
  });

  it('should call the source through the SSRF-safe client, never global fetch', async () => {
    const globalFetchSpy = jest.spyOn(global, 'fetch');

    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockResolvedValue(
      buildSourceResponse({ data: { entries: [] } }),
    );

    await job.handle({ pipelineId, workspaceId });

    expect(secureHttpClientService.getHttpClient).toHaveBeenCalledWith({
      timeout: 120_000,
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });

  it('should run preprocessors as the system in the pipeline workspace', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockResolvedValue(
      buildSourceResponse({ data: { entries: [{ name: 'John' }] } }),
    );
    recordProcessorService.processRecords.mockResolvedValue({
      recordsCreated: 1,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });

    await job.handle({ pipelineId, workspaceId });

    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      { type: 'system', workspace: { id: workspaceId } },
    );
  });

  it('should fail when pipeline not found', async () => {
    pipelineService.findEntityById.mockResolvedValue(null);

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'Pipeline not found',
    );
  });

  it('should fail when pipeline is disabled and trigger is not manual', async () => {
    pipelineService.findEntityById.mockResolvedValue({
      ...mockPipeline,
      isEnabled: false,
    } as IngestionPipelineEntity);

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'Pipeline disabled',
    );
  });

  it('should run when pipeline is disabled but trigger is manual', async () => {
    pipelineService.findEntityById.mockResolvedValue({
      ...mockPipeline,
      isEnabled: false,
    } as IngestionPipelineEntity);

    await job.handle({ pipelineId, workspaceId, manual: true });

    expect(logService.markFailed).not.toHaveBeenCalledWith(
      'log-1',
      'Pipeline disabled',
    );
  });

  it('should fail when no source URL configured', async () => {
    pipelineService.findEntityById.mockResolvedValue({
      ...mockPipeline,
      sourceUrl: null,
    } as IngestionPipelineEntity);

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'No source URL configured',
    );
  });

  it('should fail when no field mappings configured', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue([]);

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'No field mappings configured',
    );
  });

  it('should complete with zero records when API returns empty', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockResolvedValue(
      buildSourceResponse({ data: { entries: [] } }),
    );

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markCompleted).toHaveBeenCalledWith('log-1', {
      totalRecordsReceived: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
    });
    expect(recordProcessorService.processRecords).not.toHaveBeenCalled();
  });

  it('should handle source API errors gracefully', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      data: 'Internal Server Error',
    });

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'Source API returned 500: Internal Server Error',
    );
  });

  it('should fail a source request that times out', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockRejectedValue(
      new AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED'),
    );

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'Source API request timed out after 120000ms (page=0)',
    );
  });

  it('should apply bearer auth when configured', async () => {
    pipelineService.findEntityById.mockResolvedValue({
      ...mockPipeline,
      sourceAuthConfig: { type: 'bearer', token: 'my-token' },
      responseRecordsPath: null,
    } as unknown as IngestionPipelineEntity);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    mockRequest.mockResolvedValue(buildSourceResponse([{ name: 'John' }]));
    recordProcessorService.processRecords.mockResolvedValue({
      recordsCreated: 1,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });

    await job.handle({ pipelineId, workspaceId });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  });

  describe('query_param auth read from a server env var', () => {
    const originalEnv = {
      CONVOSO_API_TOKEN: process.env.CONVOSO_API_TOKEN,
      APP_SECRET: process.env.APP_SECRET,
    };

    const pullWithAuth = async ({
      sourceUrl,
      envVar,
    }: {
      sourceUrl: string;
      envVar: string;
    }) => {
      pipelineService.findEntityById.mockResolvedValue({
        ...mockPipeline,
        sourceUrl,
        sourceAuthConfig: {
          type: 'query_param',
          paramName: 'auth_token',
          envVar,
        },
      } as unknown as IngestionPipelineEntity);
      fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
        mockMappings,
      );
      mockRequest.mockResolvedValue(
        buildSourceResponse({ data: { entries: [] } }),
      );

      await job.handle({ pipelineId, workspaceId });

      return new URL(mockRequest.mock.calls[0][0].url);
    };

    beforeEach(() => {
      process.env.CONVOSO_API_TOKEN = 'test-convoso-token';
      process.env.APP_SECRET = 'test-app-secret';
    });

    afterEach(() => {
      for (const [envVarName, value] of Object.entries(originalEnv)) {
        if (isUndefined(value)) {
          delete process.env[envVarName];
        } else {
          process.env[envVarName] = value;
        }
      }
    });

    it('should send the Convoso token to the Convoso API', async () => {
      const requestUrl = await pullWithAuth({
        sourceUrl: 'https://api.convoso.com/v1/log/retrieve',
        envVar: 'CONVOSO_API_TOKEN',
      });

      expect(requestUrl.searchParams.get('auth_token')).toBe(
        'test-convoso-token',
      );
    });

    it.each([
      [
        'a server env var outside the allowlist',
        'https://api.convoso.com/v1',
        'APP_SECRET',
      ],
      [
        'the Convoso token for another host',
        'https://collector.example.com/data',
        'CONVOSO_API_TOKEN',
      ],
    ])(
      'should not send %s and warn with the pipeline id only',
      async (_description, sourceUrl, envVar) => {
        const warnSpy = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);

        const requestUrl = await pullWithAuth({ sourceUrl, envVar });

        expect(requestUrl.searchParams.has('auth_token')).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(`pipeline ${pipelineId}`),
        );
        expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(
          /test-app-secret|test-convoso-token/,
        );
      },
    );
  });
});
