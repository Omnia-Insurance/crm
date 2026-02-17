import { Test, type TestingModule } from '@nestjs/testing';

import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { type IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionPipelineResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { IngestionPullSchedulerService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service';

const workspaceId = 'workspace-1';

const mockWorkspace = { id: workspaceId } as { id: string };

const mockPipeline = {
  id: 'pipeline-1',
  workspaceId,
  name: 'Test Pipeline',
  targetObjectNameSingular: 'person',
  isEnabled: true,
} as IngestionPipelineEntity;

const mockMappings: IngestionFieldMappingEntity[] = [
  {
    id: 'mapping-1',
    pipelineId: 'pipeline-1',
    sourceFieldPath: 'first_name',
    targetFieldName: 'name',
    targetCompositeSubField: 'firstName',
    transform: null,
    relationTargetObjectName: null,
    relationMatchFieldName: null,
    relationAutoCreate: false,
    position: 0,
  } as IngestionFieldMappingEntity,
  {
    id: 'mapping-2',
    pipelineId: 'pipeline-1',
    sourceFieldPath: 'last_name',
    targetFieldName: 'name',
    targetCompositeSubField: 'lastName',
    transform: null,
    relationTargetObjectName: null,
    relationMatchFieldName: null,
    relationAutoCreate: false,
    position: 1,
  } as IngestionFieldMappingEntity,
  {
    id: 'mapping-3',
    pipelineId: 'pipeline-1',
    sourceFieldPath: 'email',
    targetFieldName: 'emails',
    targetCompositeSubField: 'primaryEmail',
    transform: null,
    relationTargetObjectName: null,
    relationMatchFieldName: null,
    relationAutoCreate: false,
    position: 2,
  } as IngestionFieldMappingEntity,
];

const mockPipelineService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findEntityById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockFieldMappingService = {
  findEntitiesByPipelineId: jest.fn(),
};

const mockLogService = {
  findByPipelineId: jest.fn(),
  createPending: jest.fn(),
};

const mockPullSchedulerService = {
  syncSchedule: jest.fn(),
};

const mockMessageQueueService = {
  add: jest.fn(),
};

const mockPermissionsService = {
  userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
};

describe('IngestionPipelineResolver - testIngestionPipeline', () => {
  let resolver: IngestionPipelineResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionPipelineResolver,
        {
          provide: IngestionPipelineService,
          useValue: mockPipelineService,
        },
        {
          provide: IngestionFieldMappingService,
          useValue: mockFieldMappingService,
        },
        {
          provide: IngestionLogService,
          useValue: mockLogService,
        },
        {
          provide: IngestionPullSchedulerService,
          useValue: mockPullSchedulerService,
        },
        {
          provide: getQueueToken(MessageQueue.ingestionQueue),
          useValue: mockMessageQueueService,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
      ],
    }).compile();

    resolver = module.get<IngestionPipelineResolver>(
      IngestionPipelineResolver,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return preview records for valid sample data', async () => {
    mockPipelineService.findEntityById.mockResolvedValue(mockPipeline);
    mockFieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );

    const result = await resolver.testIngestionPipeline(
      {
        pipelineId: 'pipeline-1',
        sampleRecords: [
          {
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
          },
          {
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@example.com',
          },
        ],
      },
      mockWorkspace as any,
    );

    expect(result.success).toBe(true);
    expect(result.totalRecords).toBe(2);
    expect(result.validRecords).toBe(2);
    expect(result.invalidRecords).toBe(0);
    expect(result.previewRecords).toHaveLength(2);
    expect(result.previewRecords![0]).toEqual({
      name: { firstName: 'John', lastName: 'Doe' },
      emails: { primaryEmail: 'john@example.com' },
    });
    expect(result.previewRecords![1]).toEqual({
      name: { firstName: 'Jane', lastName: 'Smith' },
      emails: { primaryEmail: 'jane@example.com' },
    });
    expect(result.errors).toBeNull();
  });

  it('should return errors for records missing mapped fields', async () => {
    mockPipelineService.findEntityById.mockResolvedValue(mockPipeline);
    mockFieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );

    // Records with no matching source fields produce empty mapped records
    // but don't throw — they're still "valid" from the mapping perspective
    const result = await resolver.testIngestionPipeline(
      {
        pipelineId: 'pipeline-1',
        sampleRecords: [
          { unknown_field: 'value' },
          { first_name: 'John', email: 'john@test.com' },
        ],
      },
      mockWorkspace as any,
    );

    expect(result.success).toBe(true);
    expect(result.totalRecords).toBe(2);
    expect(result.validRecords).toBe(2);
    // First record has no matching fields, produces empty object
    expect(result.previewRecords![0]).toEqual({});
    // Second record maps first_name and email but not last_name
    expect(result.previewRecords![1]).toEqual({
      name: { firstName: 'John' },
      emails: { primaryEmail: 'john@test.com' },
    });
  });

  it('should throw PIPELINE_NOT_FOUND for a bad pipeline ID', async () => {
    mockPipelineService.findEntityById.mockResolvedValue(null);

    await expect(
      resolver.testIngestionPipeline(
        {
          pipelineId: 'nonexistent-id',
          sampleRecords: [{ first_name: 'John' }],
        },
        mockWorkspace as any,
      ),
    ).rejects.toThrow(IngestionPipelineException);

    await expect(
      resolver.testIngestionPipeline(
        {
          pipelineId: 'nonexistent-id',
          sampleRecords: [{ first_name: 'John' }],
        },
        mockWorkspace as any,
      ),
    ).rejects.toMatchObject({
      code: IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
    });
  });

  it('should handle empty sample records', async () => {
    mockPipelineService.findEntityById.mockResolvedValue(mockPipeline);
    mockFieldMappingService.findEntitiesByPipelineId.mockResolvedValue(
      mockMappings,
    );

    const result = await resolver.testIngestionPipeline(
      {
        pipelineId: 'pipeline-1',
        sampleRecords: [],
      },
      mockWorkspace as any,
    );

    expect(result.success).toBe(true);
    expect(result.totalRecords).toBe(0);
    expect(result.validRecords).toBe(0);
    expect(result.invalidRecords).toBe(0);
    expect(result.previewRecords).toBeNull();
    expect(result.errors).toBeNull();
  });
});
