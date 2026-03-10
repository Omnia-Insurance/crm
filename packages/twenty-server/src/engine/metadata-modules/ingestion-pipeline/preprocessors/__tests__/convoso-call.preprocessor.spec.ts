import { Test, TestingModule } from '@nestjs/testing';

import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { ConvosoCallPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

describe('ConvosoCallPreprocessor', () => {
  let preprocessor: ConvosoCallPreprocessor;
  let mockWorkspaceOrmManager: jest.Mocked<GlobalWorkspaceOrmManager>;
  let mockLeadSourceRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let mockPersonRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };

  const workspaceId = 'workspace-123';

  const buildPipeline = (
    timeZone?: string,
  ): IngestionPipelineEntity =>
    ({
      id: 'pipeline-123',
      name: 'Convoso Call Sync',
      workspaceId,
      sourceRequestConfig: timeZone
        ? {
            dateRangeParams: {
              startParam: 'start_time',
              endParam: 'end_time',
              lookbackMinutes: 120,
              timezone: timeZone,
            },
          }
        : null,
    }) as IngestionPipelineEntity;

  beforeEach(async () => {
    mockLeadSourceRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockPersonRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockWorkspaceOrmManager = {
      getRepository: jest.fn((_, objectName) => {
        if (objectName === 'leadSource') {
          return mockLeadSourceRepo;
        }

        if (objectName === 'person') {
          return mockPersonRepo;
        }

        return {};
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConvosoCallPreprocessor,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: mockWorkspaceOrmManager,
        },
      ],
    }).compile();

    preprocessor = module.get<ConvosoCallPreprocessor>(
      ConvosoCallPreprocessor,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the pipeline timezone when converting Convoso call_date values', async () => {
    const result = await preprocessor.preProcess(
      {
        uniqueid: 'call-123',
        call_type: 'Inbound',
        queue_name: 'SMS Cancel Inbound',
        call_date: '2026-03-10 09:37:00',
      },
      buildPipeline('America/Los_Angeles'),
      workspaceId,
    );

    expect(result?._callDate).toBe('2026-03-10T16:37:00.000Z');
  });

  it('falls back to Los Angeles when the pipeline has no configured timezone', async () => {
    const result = await preprocessor.preProcess(
      {
        uniqueid: 'call-456',
        call_type: 'Inbound',
        queue_name: 'SMS Cancel Inbound',
        call_date: '2026-03-10 09:37:00',
      },
      buildPipeline(),
      workspaceId,
    );

    expect(result?._callDate).toBe('2026-03-10T16:37:00.000Z');
  });

  it('supports non-Pacific Convoso source timezones when explicitly configured', async () => {
    const result = await preprocessor.preProcess(
      {
        uniqueid: 'call-789',
        call_type: 'Inbound',
        queue_name: 'SMS Cancel Inbound',
        call_date: '2026-03-10 09:37:00',
      },
      buildPipeline('America/New_York'),
      workspaceId,
    );

    expect(result?._callDate).toBe('2026-03-10T13:37:00.000Z');
  });
});
