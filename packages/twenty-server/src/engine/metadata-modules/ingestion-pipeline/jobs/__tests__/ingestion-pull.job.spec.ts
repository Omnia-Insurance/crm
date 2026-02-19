import { Test, type TestingModule } from '@nestjs/testing';

import { type IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPullJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job';
import { IngestionPreprocessorRegistry } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/ingestion-preprocessor.registry';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

// Mock global fetch
const mockFetch = jest.fn();

global.fetch = mockFetch;

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
  dedupFieldName: null,
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

describe('IngestionPullJob', () => {
  let job: IngestionPullJob;
  let pipelineService: jest.Mocked<IngestionPipelineService>;
  let fieldMappingService: jest.Mocked<IngestionFieldMappingService>;
  let logService: jest.Mocked<IngestionLogService>;
  let recordProcessorService: jest.Mocked<IngestionRecordProcessorService>;

  beforeEach(async () => {
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
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((fn) => fn()),
          },
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
    jest.clearAllMocks();
  });

  it('should fetch and process records from source API', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            entries: [{ name: 'John' }, { name: 'Jane' }],
          },
        }),
    });

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
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.example.com/leads'),
      expect.objectContaining({ method: 'GET' }),
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

  it('should fail when pipeline not found', async () => {
    pipelineService.findEntityById.mockResolvedValue(null);

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'Pipeline not found or disabled',
    );
  });

  it('should fail when pipeline is disabled', async () => {
    pipelineService.findEntityById.mockResolvedValue({
      ...mockPipeline,
      isEnabled: false,
    } as IngestionPipelineEntity);

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'Pipeline not found or disabled',
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

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { entries: [] } }),
    });

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

  it('should handle fetch errors gracefully', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await job.handle({ pipelineId, workspaceId });

    expect(logService.markFailed).toHaveBeenCalledWith(
      'log-1',
      'Source API returned 500: Internal Server Error',
    );
  });

  it('should apply bearer auth when configured', async () => {
    const pipelineWithAuth = {
      ...mockPipeline,
      sourceAuthConfig: { type: 'bearer', token: 'my-token' },
      responseRecordsPath: null,
    } as unknown as IngestionPipelineEntity;

    pipelineService.findEntityById.mockResolvedValue(pipelineWithAuth);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: 'John' }]),
    });

    recordProcessorService.processRecords.mockResolvedValue({
      recordsCreated: 1,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });

    await job.handle({ pipelineId, workspaceId });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  });
});
