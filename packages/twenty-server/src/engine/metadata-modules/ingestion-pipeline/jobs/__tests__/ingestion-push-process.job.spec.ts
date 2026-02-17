import { Test, type TestingModule } from '@nestjs/testing';

import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionPushProcessJob } from 'src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-push-process.job';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';

const pipelineId = 'pipeline-1';
const workspaceId = 'workspace-1';
const logId = 'log-1';

const mockPipeline = {
  id: pipelineId,
  workspaceId,
  targetObjectNameSingular: 'person',
  dedupFieldName: null,
} as IngestionPipelineEntity;

const mockMappings = [
  {
    id: 'map-1',
    pipelineId,
    sourceFieldPath: 'firstName',
    targetFieldName: 'name',
    targetCompositeSubField: 'firstName',
  } as IngestionFieldMappingEntity,
];

describe('IngestionPushProcessJob', () => {
  let job: IngestionPushProcessJob;
  let pipelineService: jest.Mocked<IngestionPipelineService>;
  let fieldMappingService: jest.Mocked<IngestionFieldMappingService>;
  let logService: jest.Mocked<IngestionLogService>;
  let recordProcessorService: jest.Mocked<IngestionRecordProcessorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionPushProcessJob,
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
      ],
    }).compile();

    job = module.get<IngestionPushProcessJob>(IngestionPushProcessJob);
    pipelineService = module.get(IngestionPipelineService);
    fieldMappingService = module.get(IngestionFieldMappingService);
    logService = module.get(IngestionLogService);
    recordProcessorService = module.get(IngestionRecordProcessorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process records successfully', async () => {
    const records = [{ firstName: 'John' }, { firstName: 'Jane' }];

    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    recordProcessorService.processRecords.mockResolvedValue({
      recordsCreated: 2,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
    });

    await job.handle({ pipelineId, workspaceId, logId, records });

    expect(logService.markRunning).toHaveBeenCalledWith(logId);
    expect(recordProcessorService.processRecords).toHaveBeenCalledWith(
      records,
      mockPipeline,
      mockMappings,
      workspaceId,
    );
    expect(logService.markCompleted).toHaveBeenCalledWith(logId, {
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

    await job.handle({
      pipelineId,
      workspaceId,
      logId,
      records: [{ name: 'test' }],
    });

    expect(logService.markFailed).toHaveBeenCalledWith(
      logId,
      'Pipeline not found',
    );
    expect(recordProcessorService.processRecords).not.toHaveBeenCalled();
  });

  it('should fail when no field mappings configured', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue([]);

    await job.handle({
      pipelineId,
      workspaceId,
      logId,
      records: [{ name: 'test' }],
    });

    expect(logService.markFailed).toHaveBeenCalledWith(
      logId,
      'No field mappings configured',
    );
    expect(recordProcessorService.processRecords).not.toHaveBeenCalled();
  });

  it('should catch and log processing errors', async () => {
    pipelineService.findEntityById.mockResolvedValue(mockPipeline);
    fieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );
    recordProcessorService.processRecords.mockRejectedValue(
      new Error('Database connection lost'),
    );

    await job.handle({
      pipelineId,
      workspaceId,
      logId,
      records: [{ name: 'test' }],
    });

    expect(logService.markFailed).toHaveBeenCalledWith(
      logId,
      'Database connection lost',
    );
  });
});
