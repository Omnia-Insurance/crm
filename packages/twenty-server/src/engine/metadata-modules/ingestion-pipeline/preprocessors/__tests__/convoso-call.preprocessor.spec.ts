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
    update: jest.Mock;
  };
  let mockFetch: jest.Mock;

  const workspaceId = 'workspace-123';
  const originalFetch = global.fetch;
  const originalConvosoToken = process.env.CONVOSO_API_TOKEN;

  const buildPipeline = (timeZone?: string): IngestionPipelineEntity =>
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
    process.env.CONVOSO_API_TOKEN = 'test-convoso-token';
    mockFetch = jest.fn();
    global.fetch = mockFetch as typeof fetch;

    mockLeadSourceRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockPersonRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
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

    preprocessor = module.get<ConvosoCallPreprocessor>(ConvosoCallPreprocessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;

    if (originalConvosoToken === undefined) {
      delete process.env.CONVOSO_API_TOKEN;
    } else {
      process.env.CONVOSO_API_TOKEN = originalConvosoToken;
    }
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

  it('enriches a newly created person from Convoso lead details when lead_id is present', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: [
          {
            lead_id: '662413',
            first_name: 'john',
            last_name: 'doe',
            email: 'JOHN.DOE@example.com',
            address1: '123 Main St',
            city: 'Tampa',
            state: 'FL',
            postal_code: '33602',
            country: 'US',
            phone_number: '2391231802',
          },
        ],
      }),
    } as any);
    mockPersonRepo.findOne.mockResolvedValue(null);
    mockPersonRepo.save.mockResolvedValue({ id: 'person-123' });

    const result = await preprocessor.preProcess(
      {
        uniqueid: 'call-123',
        call_type: 'Inbound',
        queue_name: 'SMS Cancel Inbound',
        phone_number: '(239) 123-1802',
        lead_id: '662413',
      },
      buildPipeline(),
      workspaceId,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/leads/search?');
    expect(mockFetch.mock.calls[0][0]).toContain('lead_id=662413');
    expect(mockPersonRepo.save).toHaveBeenCalledWith({
      phones: {
        primaryPhoneNumber: '2391231802',
        primaryPhoneCallingCode: '+1',
        primaryPhoneCountryCode: 'US',
      },
      name: {
        firstName: 'John',
        lastName: 'Doe',
      },
      emails: {
        primaryEmail: 'john.doe@example.com',
      },
      addressCustom: {
        addressStreet1: '123 Main St',
        addressCity: 'Tampa',
        addressState: 'FL',
        addressPostcode: '33602',
        addressCountry: 'US',
      },
    });
    expect(result?._personId).toBe('person-123');
  });

  it('falls back to Convoso phone search when lead_id is missing', async () => {
    mockLeadSourceRepo.findOne.mockResolvedValue({ id: 'lead-source-123' });
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: [
          {
            lead_id: '771122',
            list_id: '9988',
            first_name: 'jane',
            last_name: 'smith',
            phone_number: '2391231802',
          },
        ],
      }),
    } as any);
    mockPersonRepo.findOne.mockResolvedValue(null);
    mockPersonRepo.save.mockResolvedValue({ id: 'person-456' });

    await preprocessor.preProcess(
      {
        uniqueid: 'call-456',
        call_type: 'Inbound',
        queue_name: 'Slate U65 Live Transfers',
        source_name: 'Slate U65 Leads',
        list_id: '9988',
        phone_number: '239-123-1802',
      },
      buildPipeline(),
      workspaceId,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('phone_number=2391231802');
    expect(mockFetch.mock.calls[0][0]).toContain('list_id=9988');
    expect(mockPersonRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        leadSourceId: 'lead-source-123',
        name: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
      }),
    );
  });

  it('updates an existing blank person with Convoso lead details', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: [
          {
            lead_id: '662413',
            first_name: 'maria',
            last_name: 'garcia',
            email: 'maria@example.com',
            phone_number: '2391231802',
          },
        ],
      }),
    } as any);
    mockPersonRepo.findOne.mockResolvedValue({
      id: 'person-existing',
      name: {
        firstName: '',
        lastName: '',
      },
      phones: {
        primaryPhoneNumber: '2391231802',
      },
    });
    mockPersonRepo.update.mockResolvedValue(undefined);

    const result = await preprocessor.preProcess(
      {
        uniqueid: 'call-789',
        call_type: 'Inbound',
        queue_name: 'SMS Cancel Inbound',
        phone_number: '2391231802',
        lead_id: '662413',
      },
      buildPipeline(),
      workspaceId,
    );

    expect(mockPersonRepo.save).not.toHaveBeenCalled();
    expect(mockPersonRepo.update).toHaveBeenCalledWith('person-existing', {
      name: {
        firstName: 'Maria',
        lastName: 'Garcia',
      },
      emails: {
        primaryEmail: 'maria@example.com',
      },
    });
    expect(result?._personId).toBe('person-existing');
  });

  it('skips phone-based enrichment when Convoso returns multiple different leads', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: [
          {
            lead_id: 'lead-a',
            first_name: 'Alpha',
            last_name: 'One',
            phone_number: '2391231802',
          },
          {
            lead_id: 'lead-b',
            first_name: 'Beta',
            last_name: 'Two',
            phone_number: '2391231802',
          },
        ],
      }),
    } as any);
    mockPersonRepo.findOne.mockResolvedValue(null);
    mockPersonRepo.save.mockResolvedValue({ id: 'person-789' });

    await preprocessor.preProcess(
      {
        uniqueid: 'call-999',
        call_type: 'Inbound',
        queue_name: 'SMS Cancel Inbound',
        phone_number: '2391231802',
      },
      buildPipeline(),
      workspaceId,
    );

    expect(mockPersonRepo.save).toHaveBeenCalledWith({
      phones: {
        primaryPhoneNumber: '2391231802',
        primaryPhoneCallingCode: '+1',
        primaryPhoneCountryCode: 'US',
      },
      name: {
        firstName: '',
        lastName: '',
      },
    });
  });
});
