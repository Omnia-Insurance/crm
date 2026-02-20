import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { IngestionLogEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-log.entity';
import { IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';

const pipelineId = 'pipeline-1';

const mockLog: IngestionLogEntity = {
  id: 'log-1',
  pipelineId,
  status: 'pending',
  triggerType: 'push',
  totalRecordsReceived: 0,
  recordsCreated: 0,
  recordsUpdated: 0,
  recordsSkipped: 0,
  recordsFailed: 0,
  errors: null,
  startedAt: new Date('2025-01-01T00:00:00Z'),
  completedAt: null,
  durationMs: null,
} as IngestionLogEntity;

const mockRepository = {
  find: jest.fn(),
  findOneByOrFail: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

describe('IngestionLogService', () => {
  let service: IngestionLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionLogService,
        {
          provide: getRepositoryToken(IngestionLogEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<IngestionLogService>(IngestionLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByPipelineId', () => {
    it('should return logs as DTOs ordered by startedAt DESC', async () => {
      mockRepository.find.mockResolvedValue([mockLog]);

      const result = await service.findByPipelineId(pipelineId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { pipelineId },
        order: { startedAt: 'DESC' },
        take: 50,
      });
    });

    it('should respect custom limit', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.findByPipelineId(pipelineId, 10);

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('createPending', () => {
    it('should create a pending log entry', async () => {
      mockRepository.create.mockImplementation(
        (data: Record<string, unknown>) =>
          ({ ...data, id: 'new-log' }) as IngestionLogEntity,
      );
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity as IngestionLogEntity),
      );

      const result = await service.createPending(pipelineId, 'push');

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pipelineId,
          status: 'pending',
          triggerType: 'push',
          startedAt: expect.any(Date),
        }),
      );
      expect(result.id).toBe('new-log');
    });
  });

  describe('markRunning', () => {
    it('should update status to running', async () => {
      await service.markRunning('log-1');

      expect(mockRepository.update).toHaveBeenCalledWith('log-1', {
        status: 'running',
        startedAt: expect.any(Date),
      });
    });
  });

  describe('markCompleted', () => {
    it('should set status to completed when no failures', async () => {
      const logEntity = {
        ...mockLog,
        startedAt: new Date(Date.now() - 1000),
      };

      mockRepository.findOneByOrFail.mockResolvedValue(logEntity);
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity as IngestionLogEntity),
      );

      const result = await service.markCompleted('log-1', {
        totalRecordsReceived: 10,
        recordsCreated: 8,
        recordsUpdated: 2,
        recordsSkipped: 0,
        recordsFailed: 0,
      });

      expect(result.status).toBe('completed');
      expect(result.totalRecordsReceived).toBe(10);
      expect(result.recordsCreated).toBe(8);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should set status to partial when some records fail', async () => {
      const logEntity = {
        ...mockLog,
        startedAt: new Date(Date.now() - 500),
      };

      mockRepository.findOneByOrFail.mockResolvedValue(logEntity);
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity as IngestionLogEntity),
      );

      const result = await service.markCompleted('log-1', {
        totalRecordsReceived: 10,
        recordsCreated: 7,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsFailed: 3,
        errors: [
          { recordIndex: 2, message: 'Bad data' },
          { recordIndex: 5, message: 'Invalid phone' },
        ],
      });

      expect(result.status).toBe('partial');
      expect(result.recordsFailed).toBe(3);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('markFailed', () => {
    it('should set status to failed with error message', async () => {
      const logEntity = {
        ...mockLog,
        startedAt: new Date(Date.now() - 2000),
      };

      mockRepository.findOneByOrFail.mockResolvedValue(logEntity);
      mockRepository.save.mockImplementation((entity: unknown) =>
        Promise.resolve(entity as IngestionLogEntity),
      );

      const result = await service.markFailed('log-1', 'Pipeline not found');

      expect(result.status).toBe('failed');
      expect(result.errors).toEqual([
        { recordIndex: -1, message: 'Pipeline not found' },
      ]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
