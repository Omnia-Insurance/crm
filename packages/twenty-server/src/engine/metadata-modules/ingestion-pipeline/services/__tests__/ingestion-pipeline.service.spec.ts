import { Test, type TestingModule } from '@nestjs/testing';

import { IsNull } from 'typeorm';

import { type CreateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/create-ingestion-pipeline.input';
import { type UpdateIngestionPipelineInput } from 'src/engine/metadata-modules/ingestion-pipeline/dtos/update-ingestion-pipeline.input';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import {
  IngestionPipelineException,
  IngestionPipelineExceptionCode,
} from 'src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.exception';
import { IngestionPipelineService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';

const workspaceId = 'workspace-1';

const WEBHOOK_SECRET_PATTERN = /^[0-9a-f]{64}$/;

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
  dedupFieldNames: ['phones.primaryPhoneNumber'],
  paginationConfig: null,
  isEnabled: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
} as IngestionPipelineEntity;

const CONVOSO_SOURCE_URL = 'https://api.convoso.com/v1/log/retrieve';

const CONVOSO_AUTH_CONFIG = {
  type: 'query_param',
  paramName: 'auth_token',
  envVar: 'CONVOSO_API_TOKEN',
};

const convosoPullPipeline = {
  ...mockPipeline,
  mode: 'pull',
  webhookSecret: null,
  sourceUrl: CONVOSO_SOURCE_URL,
  sourceAuthConfig: CONVOSO_AUTH_CONFIG,
} as IngestionPipelineEntity;

describe('IngestionPipelineService', () => {
  let service: IngestionPipelineService;
  let mockRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    insertAndReturnOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      insertAndReturnOne: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionPipelineService,
        {
          provide: getWorkspaceScopedRepositoryToken(IngestionPipelineEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<IngestionPipelineService>(IngestionPipelineService);
  });

  describe('findAll', () => {
    it('should return the workspace pipelines as DTOs', async () => {
      mockRepository.find.mockResolvedValue([mockPipeline]);

      const result = await service.findAll(workspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pipeline-1');
      expect(result[0].name).toBe('Test Pipeline');
      expect(mockRepository.find).toHaveBeenCalledWith(workspaceId, {
        where: { deletedAt: IsNull() },
        order: { createdAt: 'ASC' },
      });
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

      expect(result?.id).toBe('pipeline-1');
      expect(mockRepository.findOne).toHaveBeenCalledWith(workspaceId, {
        where: { id: 'pipeline-1', deletedAt: IsNull() },
      });
    });

    it('should return null when pipeline not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('nonexistent', workspaceId);

      expect(result).toBeNull();
    });
  });

  describe('findEntityByIdOrThrow', () => {
    it('should return the raw entity', async () => {
      mockRepository.findOne.mockResolvedValue(mockPipeline);

      const result = await service.findEntityByIdOrThrow(
        'pipeline-1',
        workspaceId,
      );

      expect(result).toBe(mockPipeline);
    });

    it('should throw PIPELINE_NOT_FOUND for a pipeline outside the workspace', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findEntityByIdOrThrow('foreign-pipeline', workspaceId),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.PIPELINE_NOT_FOUND,
      });
    });
  });

  describe('create', () => {
    it('should generate webhook secret for push mode', async () => {
      const input: CreateIngestionPipelineInput = {
        name: 'New Push Pipeline',
        mode: 'push',
        targetObjectNameSingular: 'person',
      };

      mockRepository.insertAndReturnOne.mockImplementation(
        async (_workspaceId: string, entity: Record<string, unknown>) => ({
          ...mockPipeline,
          ...entity,
          id: 'new-id',
        }),
      );

      const result = await service.create(input, workspaceId);

      expect(result.id).toBe('new-id');
      expect(mockRepository.insertAndReturnOne).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          name: 'New Push Pipeline',
          webhookSecret: expect.stringMatching(WEBHOOK_SECRET_PATTERN),
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

      mockRepository.insertAndReturnOne.mockResolvedValue({
        ...mockPipeline,
        mode: 'pull',
        webhookSecret: null,
      });

      await service.create(input, workspaceId);

      expect(mockRepository.insertAndReturnOne).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ webhookSecret: null }),
      );
    });

    it('should accept the Convoso token for the Convoso API', async () => {
      mockRepository.insertAndReturnOne.mockResolvedValue({
        ...mockPipeline,
        mode: 'pull',
        webhookSecret: null,
      });

      await service.create(
        {
          name: 'Convoso Calls',
          mode: 'pull',
          targetObjectNameSingular: 'call',
          sourceUrl: CONVOSO_SOURCE_URL,
          sourceAuthConfig: CONVOSO_AUTH_CONFIG,
        },
        workspaceId,
      );

      expect(mockRepository.insertAndReturnOne).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'a server env var outside the allowlist',
        CONVOSO_SOURCE_URL,
        { type: 'query_param', paramName: 'token', envVar: 'APP_SECRET' },
      ],
      [
        'the Convoso token for another host',
        'https://collector.example.com/data',
        CONVOSO_AUTH_CONFIG,
      ],
      [
        'a non-string env var',
        CONVOSO_SOURCE_URL,
        { type: 'query_param', paramName: 'token', envVar: ['APP_SECRET'] },
      ],
    ])(
      'should reject a query_param auth reading %s',
      async (_description, sourceUrl, sourceAuthConfig) => {
        await expect(
          service.create(
            {
              name: 'New Pull Pipeline',
              mode: 'pull',
              targetObjectNameSingular: 'person',
              sourceUrl,
              sourceAuthConfig,
            },
            workspaceId,
          ),
        ).rejects.toMatchObject({
          code: IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT,
        });
        expect(mockRepository.insertAndReturnOne).not.toHaveBeenCalled();
      },
    );
  });

  describe('update', () => {
    it('should update an existing pipeline in its workspace', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce({ ...mockPipeline })
        .mockResolvedValueOnce({ ...mockPipeline, name: 'Updated Name' });

      const input: UpdateIngestionPipelineInput = {
        id: 'pipeline-1',
        update: { name: 'Updated Name' },
      };

      const result = await service.update(input, workspaceId);

      expect(mockRepository.update).toHaveBeenCalledWith(
        workspaceId,
        { id: 'pipeline-1' },
        { name: 'Updated Name' },
      );
      expect(result.name).toBe('Updated Name');
    });

    it('should give a push pipeline without a secret a new one', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPipeline,
        mode: 'pull',
        webhookSecret: null,
      });

      await service.update(
        { id: 'pipeline-1', update: { mode: 'push' } },
        workspaceId,
      );

      expect(mockRepository.update).toHaveBeenCalledWith(
        workspaceId,
        { id: 'pipeline-1' },
        {
          mode: 'push',
          webhookSecret: expect.stringMatching(WEBHOOK_SECRET_PATTERN),
        },
      );
    });

    it('should keep the existing secret of a push pipeline', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockPipeline });

      await service.update(
        { id: 'pipeline-1', update: { isEnabled: false } },
        workspaceId,
      );

      expect(mockRepository.update).toHaveBeenCalledWith(
        workspaceId,
        { id: 'pipeline-1' },
        { isEnabled: false },
      );
    });

    it('should reject pointing a pipeline that sends the Convoso token at another host', async () => {
      mockRepository.findOne.mockResolvedValue(convosoPullPipeline);

      await expect(
        service.update(
          {
            id: 'pipeline-1',
            update: { sourceUrl: 'https://collector.example.com/data' },
          },
          workspaceId,
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT,
      });
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should reject a new auth config reading a server env var outside the allowlist', async () => {
      mockRepository.findOne.mockResolvedValue(convosoPullPipeline);

      await expect(
        service.update(
          {
            id: 'pipeline-1',
            update: {
              sourceAuthConfig: {
                type: 'query_param',
                paramName: 'auth_token',
                envVar: 'PG_DATABASE_URL',
              },
            },
          },
          workspaceId,
        ),
      ).rejects.toMatchObject({
        code: IngestionPipelineExceptionCode.INVALID_PIPELINE_INPUT,
      });
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should allow moving to another host with an auth config that reads no env var', async () => {
      mockRepository.findOne.mockResolvedValue(convosoPullPipeline);

      await service.update(
        {
          id: 'pipeline-1',
          update: {
            sourceUrl: 'https://collector.example.com/data',
            sourceAuthConfig: { type: 'bearer', token: 'collector-token' },
          },
        },
        workspaceId,
      );

      expect(mockRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should still disable a legacy pipeline whose env var is not allowed', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...convosoPullPipeline,
        sourceAuthConfig: {
          type: 'query_param',
          paramName: 'auth_token',
          envVar: 'APP_SECRET',
        },
      });

      await service.update(
        { id: 'pipeline-1', update: { isEnabled: false } },
        workspaceId,
      );

      expect(mockRepository.update).toHaveBeenCalledWith(
        workspaceId,
        { id: 'pipeline-1' },
        { isEnabled: false },
      );
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
      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft-delete the pipeline', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockPipeline });

      const result = await service.delete('pipeline-1', workspaceId);

      expect(mockRepository.update).toHaveBeenCalledWith(
        workspaceId,
        { id: 'pipeline-1' },
        { deletedAt: expect.any(Date) },
      );
      expect(result.deletedAt).toBeInstanceOf(Date);
    });

    it('should throw when pipeline not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('nonexistent', workspaceId)).rejects.toThrow(
        IngestionPipelineException,
      );
      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });
});
