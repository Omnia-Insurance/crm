import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DeleteResult } from 'typeorm';

import { type CreateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-field-mapping.input';
import { type UpdateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-field-mapping.input';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';

const pipelineId = 'pipeline-1';

const mockMapping: IngestionFieldMappingEntity = {
  id: 'mapping-1',
  pipelineId,
  sourceFieldPath: 'data.firstName',
  targetFieldName: 'name',
  targetCompositeSubField: 'firstName',
  transform: null,
  relationTargetObjectName: null,
  relationMatchFieldName: null,
  relationAutoCreate: false,
  position: 0,
} as IngestionFieldMappingEntity;

const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
};

describe('IngestionFieldMappingService', () => {
  let service: IngestionFieldMappingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionFieldMappingService,
        {
          provide: getRepositoryToken(IngestionFieldMappingEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<IngestionFieldMappingService>(
      IngestionFieldMappingService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByPipelineId', () => {
    it('should return mappings as DTOs', async () => {
      mockRepository.find.mockResolvedValue([mockMapping]);

      const result = await service.findByPipelineId(pipelineId);

      expect(result).toHaveLength(1);
      expect(result[0].sourceFieldPath).toBe('data.firstName');
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { pipelineId },
        order: { position: 'ASC' },
      });
    });

    it('should return empty array when no mappings exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findByPipelineId(pipelineId);

      expect(result).toEqual([]);
    });
  });

  describe('findEntitiesByPipelineId', () => {
    it('should return raw entities', async () => {
      mockRepository.find.mockResolvedValue([mockMapping]);

      const result = await service.findEntitiesByPipelineId(pipelineId);

      expect(result).toEqual([mockMapping]);
    });
  });

  describe('create', () => {
    it('should create a mapping with defaults', async () => {
      const input: CreateIngestionFieldMappingInput = {
        pipelineId,
        sourceFieldPath: 'data.email',
        targetFieldName: 'emails',
        targetCompositeSubField: 'primaryEmail',
      };

      mockRepository.create.mockReturnValue({
        ...input,
        id: 'new-mapping-id',
        relationAutoCreate: false,
        position: 0,
      });
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity),
      );

      const result = await service.create(input);

      expect(result.id).toBe('new-mapping-id');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pipelineId,
          sourceFieldPath: 'data.email',
          relationAutoCreate: false,
          position: 0,
        }),
      );
    });

    it('should preserve explicit position and relationAutoCreate', async () => {
      const input: CreateIngestionFieldMappingInput = {
        pipelineId,
        sourceFieldPath: 'data.leadSource',
        targetFieldName: 'leadSourceId',
        relationAutoCreate: true,
        position: 5,
      };

      mockRepository.create.mockReturnValue({ ...input, id: 'id-1' });
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity),
      );

      await service.create(input);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          relationAutoCreate: true,
          position: 5,
        }),
      );
    });
  });

  describe('createMany', () => {
    it('should create multiple mappings', async () => {
      const inputs: CreateIngestionFieldMappingInput[] = [
        {
          pipelineId,
          sourceFieldPath: 'data.firstName',
          targetFieldName: 'name',
        },
        {
          pipelineId,
          sourceFieldPath: 'data.phone',
          targetFieldName: 'phones',
        },
      ];

      let callCount = 0;

      mockRepository.create.mockImplementation(
        (data: Record<string, unknown>) => {
          callCount++;

          return { ...data, id: `id-${callCount}` };
        },
      );
      mockRepository.save.mockImplementation((entities: unknown) =>
        Promise.resolve(entities),
      );

      const result = await service.createMany(inputs);

      expect(result).toHaveLength(2);
      expect(mockRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    it('should update an existing mapping', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockMapping });
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity),
      );

      const input: UpdateIngestionFieldMappingInput = {
        id: 'mapping-1',
        update: { sourceFieldPath: 'data.name' },
      };

      const result = await service.update(input);

      expect(result.sourceFieldPath).toBe('data.name');
    });

    it('should throw when mapping not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const input: UpdateIngestionFieldMappingInput = {
        id: 'nonexistent',
        update: { sourceFieldPath: 'x' },
      };

      await expect(service.update(input)).rejects.toThrow(
        IngestionPipelineException,
      );

      await expect(service.update(input)).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.FIELD_MAPPING_NOT_FOUND,
      });
    });
  });

  describe('delete', () => {
    it('should return true when mapping deleted', async () => {
      const deleteResult = new DeleteResult();

      deleteResult.affected = 1;
      mockRepository.delete.mockResolvedValue(deleteResult);

      const result = await service.delete('mapping-1');

      expect(result).toBe(true);
    });

    it('should return false when nothing deleted', async () => {
      const deleteResult = new DeleteResult();

      deleteResult.affected = 0;
      mockRepository.delete.mockResolvedValue(deleteResult);

      const result = await service.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteByPipelineId', () => {
    it('should delete all mappings for a pipeline', async () => {
      const deleteResult = new DeleteResult();

      deleteResult.affected = 3;
      mockRepository.delete.mockResolvedValue(deleteResult);

      await service.deleteByPipelineId(pipelineId);

      expect(mockRepository.delete).toHaveBeenCalledWith({ pipelineId });
    });
  });
});
