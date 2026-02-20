import { Test, type TestingModule } from '@nestjs/testing';

import { type IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { IngestionRecordProcessorService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service';
import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

const workspaceId = 'workspace-1';

const mockPipeline = {
  id: 'pipeline-1',
  workspaceId,
  targetObjectNameSingular: 'person',
  dedupFieldName: null,
} as IngestionPipelineEntity;

const mockMappings: IngestionFieldMappingEntity[] = [
  {
    id: 'map-1',
    pipelineId: 'pipeline-1',
    sourceFieldPath: 'firstName',
    targetFieldName: 'name',
    targetCompositeSubField: 'firstName',
    transform: null,
    relationTargetObjectName: null,
    relationMatchFieldName: null,
    relationAutoCreate: false,
    position: 0,
  } as IngestionFieldMappingEntity,
  {
    id: 'map-2',
    pipelineId: 'pipeline-1',
    sourceFieldPath: 'lastName',
    targetFieldName: 'name',
    targetCompositeSubField: 'lastName',
    transform: null,
    relationTargetObjectName: null,
    relationMatchFieldName: null,
    relationAutoCreate: false,
    position: 1,
  } as IngestionFieldMappingEntity,
  {
    id: 'map-3',
    pipelineId: 'pipeline-1',
    sourceFieldPath: 'phone',
    targetFieldName: 'phones',
    targetCompositeSubField: 'primaryPhoneNumber',
    transform: null,
    relationTargetObjectName: null,
    relationMatchFieldName: null,
    relationAutoCreate: false,
    position: 2,
  } as IngestionFieldMappingEntity,
];

describe('IngestionRecordProcessorService', () => {
  let service: IngestionRecordProcessorService;
  let mockRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let mockRelationResolver: jest.Mocked<IngestionRelationResolverService>;
  let mockOrmManager: jest.Mocked<GlobalWorkspaceOrmManager>;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((data) => ({ id: 'new-id', ...data })),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionRecordProcessorService,
        {
          provide: IngestionRelationResolverService,
          useValue: {
            createCache: jest.fn().mockReturnValue(new Map()),
            resolveRelations: jest
              .fn()
              .mockImplementation((record) => Promise.resolve(record)),
          },
        },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getRepository: jest.fn().mockResolvedValue(mockRepository),
          },
        },
      ],
    }).compile();

    service = module.get<IngestionRecordProcessorService>(
      IngestionRecordProcessorService,
    );
    mockRelationResolver = module.get(IngestionRelationResolverService);
    mockOrmManager = module.get(GlobalWorkspaceOrmManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create records when no dedup is configured', async () => {
    const records = [
      { firstName: 'John', lastName: 'Doe', phone: '+15551234567' },
      { firstName: 'Jane', lastName: 'Smith', phone: '+15559876543' },
    ];

    const result = await service.processRecords(
      records,
      mockPipeline,
      mockMappings,
      workspaceId,
    );

    expect(result.recordsCreated).toBe(2);
    expect(result.recordsUpdated).toBe(0);
    expect(result.recordsFailed).toBe(0);
    expect(mockRepository.save).toHaveBeenCalledTimes(2);
    expect(mockOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'person',
      { shouldBypassPermissionChecks: true },
    );
  });

  it('should update existing records when dedup match found', async () => {
    const pipelineWithDedup = {
      ...mockPipeline,
      dedupFieldName: 'phones.primaryPhoneNumber',
    } as IngestionPipelineEntity;

    const records = [
      { firstName: 'John', lastName: 'Doe', phone: '+15551234567' },
    ];

    mockRepository.findOne.mockResolvedValue({
      id: 'existing-person-1',
      name: { firstName: 'Old', lastName: 'Name' },
    });

    const result = await service.processRecords(
      records,
      pipelineWithDedup,
      mockMappings,
      workspaceId,
    );

    expect(result.recordsUpdated).toBe(1);
    expect(result.recordsCreated).toBe(0);
    expect(mockRepository.update).toHaveBeenCalledWith(
      'existing-person-1',
      expect.any(Object),
    );
  });

  it('should create new record when dedup match not found', async () => {
    const pipelineWithDedup = {
      ...mockPipeline,
      dedupFieldName: 'phones.primaryPhoneNumber',
    } as IngestionPipelineEntity;

    const records = [
      { firstName: 'New', lastName: 'Person', phone: '+15559999999' },
    ];

    mockRepository.findOne.mockResolvedValue(null);

    const result = await service.processRecords(
      records,
      pipelineWithDedup,
      mockMappings,
      workspaceId,
    );

    expect(result.recordsCreated).toBe(1);
    expect(result.recordsUpdated).toBe(0);
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should handle processing errors per record', async () => {
    const records = [
      { firstName: 'John', lastName: 'Doe', phone: '+15551234567' },
      { firstName: 'Bad', lastName: 'Record', phone: '+15550000000' },
    ];

    mockRepository.save
      .mockResolvedValueOnce({ id: 'new-1' })
      .mockRejectedValueOnce(new Error('Database constraint violation'));

    const result = await service.processRecords(
      records,
      mockPipeline,
      mockMappings,
      workspaceId,
    );

    expect(result.recordsCreated).toBe(1);
    expect(result.recordsFailed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].recordIndex).toBe(1);
    expect(result.errors[0].message).toBe('Database constraint violation');
  });

  it('should call relation resolver for each record', async () => {
    const records = [
      { firstName: 'John', lastName: 'Doe', phone: '+15551234567' },
    ];

    await service.processRecords(
      records,
      mockPipeline,
      mockMappings,
      workspaceId,
    );

    expect(mockRelationResolver.resolveRelations).toHaveBeenCalledTimes(1);
    expect(mockRelationResolver.resolveRelations).toHaveBeenCalledWith(
      expect.any(Object),
      workspaceId,
      expect.any(Map),
    );
  });

  it('should return empty result for empty records array', async () => {
    const result = await service.processRecords(
      [],
      mockPipeline,
      mockMappings,
      workspaceId,
    );

    expect(result.recordsCreated).toBe(0);
    expect(result.recordsUpdated).toBe(0);
    expect(result.recordsFailed).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
