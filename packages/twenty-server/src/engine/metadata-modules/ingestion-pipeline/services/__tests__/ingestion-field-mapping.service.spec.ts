import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DeleteResult, IsNull } from 'typeorm';

import { type CreateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-field-mapping.input';
import { type UpdateIngestionFieldMappingInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-field-mapping.input';
import { IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionFieldMappingService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';

const pipelineId = 'pipeline-1';
const workspaceId = 'workspace-1';

const workspaceScope = { workspaceId, deletedAt: IsNull() };

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

const buildPipelineNotFoundException = () =>
  new IngestionPipelineException(
    `Pipeline ${pipelineId} not found`,
    IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
  );

describe('IngestionFieldMappingService', () => {
  let service: IngestionFieldMappingService;
  let mockRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let mockPipelineService: { findEntityByIdOrThrow: jest.Mock };

  beforeEach(async () => {
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    mockPipelineService = {
      findEntityByIdOrThrow: jest.fn().mockResolvedValue({ id: pipelineId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionFieldMappingService,
        {
          provide: getRepositoryToken(IngestionFieldMappingEntity),
          useValue: mockRepository,
        },
        {
          provide: IngestionPipelineService,
          useValue: mockPipelineService,
        },
      ],
    }).compile();

    service = module.get<IngestionFieldMappingService>(
      IngestionFieldMappingService,
    );
  });

  describe('findByPipelineId', () => {
    it('should return the workspace pipeline mappings as DTOs', async () => {
      mockRepository.find.mockResolvedValue([mockMapping]);

      const result = await service.findByPipelineId(pipelineId, workspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].sourceFieldPath).toBe('data.firstName');
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { pipelineId, pipeline: workspaceScope },
        order: { position: 'ASC' },
      });
    });

    it('should return empty array when no mappings exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findByPipelineId(pipelineId, workspaceId);

      expect(result).toEqual([]);
    });
  });

  describe('findEntitiesByPipelineId', () => {
    it('should return raw entities scoped to the workspace', async () => {
      mockRepository.find.mockResolvedValue([mockMapping]);

      const result = await service.findEntitiesByPipelineId(
        pipelineId,
        workspaceId,
      );

      expect(result).toEqual([mockMapping]);
      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { pipelineId, pipeline: workspaceScope },
        }),
      );
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

      const result = await service.create(input, workspaceId);

      expect(mockPipelineService.findEntityByIdOrThrow).toHaveBeenCalledWith(
        pipelineId,
        workspaceId,
      );
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

      await service.create(input, workspaceId);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          relationAutoCreate: true,
          position: 5,
        }),
      );
    });

    it('should refuse a pipeline from another workspace', async () => {
      mockPipelineService.findEntityByIdOrThrow.mockRejectedValue(
        buildPipelineNotFoundException(),
      );

      await expect(
        service.create(
          { pipelineId, sourceFieldPath: 'a', targetFieldName: 'b' },
          workspaceId,
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      });
      expect(mockRepository.save).not.toHaveBeenCalled();
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

      const result = await service.createMany(inputs, workspaceId);

      expect(result).toHaveLength(2);
      expect(mockRepository.create).toHaveBeenCalledTimes(2);
      expect(mockPipelineService.findEntityByIdOrThrow).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should save nothing when one pipeline belongs to another workspace', async () => {
      mockPipelineService.findEntityByIdOrThrow
        .mockResolvedValueOnce({ id: pipelineId })
        .mockRejectedValueOnce(buildPipelineNotFoundException());

      await expect(
        service.createMany(
          [
            { pipelineId, sourceFieldPath: 'a', targetFieldName: 'b' },
            {
              pipelineId: 'foreign-pipeline',
              sourceFieldPath: 'a',
              targetFieldName: 'b',
            },
          ],
          workspaceId,
        ),
      ).rejects.toBeInstanceOf(IngestionPipelineException);
      expect(mockRepository.save).not.toHaveBeenCalled();
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

      const result = await service.update(input, workspaceId);

      expect(result.sourceFieldPath).toBe('data.name');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'mapping-1', pipeline: workspaceScope },
      });
    });

    it('should throw when mapping not found in the workspace', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const input: UpdateIngestionFieldMappingInput = {
        id: 'nonexistent',
        update: { sourceFieldPath: 'x' },
      };

      await expect(service.update(input, workspaceId)).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.FIELD_MAPPING_NOT_FOUND,
      });
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should return true when mapping deleted', async () => {
      const deleteResult = new DeleteResult();

      deleteResult.affected = 1;
      mockRepository.findOne.mockResolvedValue({ ...mockMapping });
      mockRepository.delete.mockResolvedValue(deleteResult);

      const result = await service.delete('mapping-1', workspaceId);

      expect(result).toBe(true);
      expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'mapping-1' });
    });

    it('should not delete a mapping outside the workspace', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.delete('foreign-mapping', workspaceId);

      expect(result).toBe(false);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'foreign-mapping', pipeline: workspaceScope },
      });
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });
  });
});
