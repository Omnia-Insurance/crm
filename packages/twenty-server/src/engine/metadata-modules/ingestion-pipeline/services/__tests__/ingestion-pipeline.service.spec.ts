import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { type CreateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-pipeline.input';
import { type UpdateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-pipeline.input';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';

const workspaceId = 'workspace-1';

const mockPipeline: IngestionPipelineEntity = {
  id: 'pipeline-1',
  workspaceId,
  name: 'Test Pipeline',
  description: 'A test pipeline',
  mode: 'push',
  targetObjectNameSingular: 'person',
  webhookSecret: 'secret-abc',
  sourceUrl: null,
  sourceHttpMethod: null,
  sourceAuthConfig: null,
  sourceRequestConfig: null,
  responseRecordsPath: null,
  schedule: null,
  dedupFieldName: 'phones.primaryPhoneNumber',
  paginationConfig: null,
  isEnabled: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
} as IngestionPipelineEntity;

const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('IngestionPipelineService', () => {
  let service: IngestionPipelineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionPipelineService,
        {
          provide: getRepositoryToken(IngestionPipelineEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<IngestionPipelineService>(IngestionPipelineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all pipelines as DTOs', async () => {
      mockRepository.find.mockResolvedValue([mockPipeline]);

      const result = await service.findAll(workspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pipeline-1');
      expect(result[0].name).toBe('Test Pipeline');
      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId }),
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('should return empty array when no pipelines exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAll(workspaceId);

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return pipeline DTO when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);

      const result = await service.findById('pipeline-1', workspaceId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('pipeline-1');
    });

    it('should return null when pipeline not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('nonexistent', workspaceId);

      expect(result).toBeNull();
    });
  });

  describe('findEntityById', () => {
    it('should return the raw entity', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);

      const result = await service.findEntityById('pipeline-1', workspaceId);

      expect(result).toBe(mockPipeline);
    });
  });

  describe('create', () => {
    it('should generate webhook secret for push mode', async () => {
      const input: CreateIngestionPipelineInput = {
        name: 'New Push Pipeline',
        mode: 'push',
        targetObjectNameSingular: 'person',
      };

      mockRepository.create.mockImplementation(
        (data: Record<string, unknown>) =>
          ({ ...data, id: 'new-id' }) as IngestionPipelineEntity,
      );
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve({
          ...(entity as Record<string, unknown>),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } as IngestionPipelineEntity),
      );

      const result = await service.create(input, workspaceId);

      expect(result.id).toBe('new-id');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Push Pipeline',
          workspaceId,
          webhookSecret: expect.any(String),
          isEnabled: false,
        }),
      );
    });

    it('should not generate webhook secret for pull mode', async () => {
      const input: CreateIngestionPipelineInput = {
        name: 'New Pull Pipeline',
        mode: 'pull',
        targetObjectNameSingular: 'person',
        sourceUrl: 'https://api.example.com/data',
      };

      mockRepository.create.mockImplementation(
        (data: Record<string, unknown>) =>
          ({ ...data, id: 'new-id' }) as IngestionPipelineEntity,
      );
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve({
          ...(entity as Record<string, unknown>),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } as IngestionPipelineEntity),
      );

      await service.create(input, workspaceId);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookSecret: null,
        }),
      );
    });
  });

  describe('update', () => {
    it('should update an existing pipeline', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockPipeline });
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity as IngestionPipelineEntity),
      );

      const input: UpdateIngestionPipelineInput = {
        id: 'pipeline-1',
        update: { name: 'Updated Name' },
      };

      const result = await service.update(input, workspaceId);

      expect(result.name).toBe('Updated Name');
    });

    it('should throw when pipeline not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const input: UpdateIngestionPipelineInput = {
        id: 'nonexistent',
        update: { name: 'New' },
      };

      await expect(service.update(input, workspaceId)).rejects.toThrow(
        IngestionPipelineException,
      );

      await expect(service.update(input, workspaceId)).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      });
    });
  });

  describe('delete', () => {
    it('should soft-delete the pipeline', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockPipeline });
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity as IngestionPipelineEntity),
      );

      const result = await service.delete('pipeline-1', workspaceId);

      expect(result.deletedAt).toBeDefined();
      expect(result.deletedAt).not.toBeNull();
    });

    it('should throw when pipeline not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('nonexistent', workspaceId)).rejects.toThrow(
        IngestionPipelineException,
      );
    });
  });
});
