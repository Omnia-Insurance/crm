import { Test, TestingModule } from '@nestjs/testing';

import { HealthSherpaPolicyPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor';
import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

describe('HealthSherpaPolicyPreprocessor', () => {
  let preprocessor: HealthSherpaPolicyPreprocessor;
  let mockWorkspaceOrmManager: jest.Mocked<GlobalWorkspaceOrmManager>;
  let mockPersonRepo: any;
  let mockAgentRepo: any;

  const mockPipeline = {
    id: 'pipeline-123',
    name: 'Health Sherpa Policies',
    workspaceId: 'workspace-456',
  } as IngestionPipelineEntity;

  const workspaceId = 'workspace-456';

  beforeEach(async () => {
    // Mock repositories
    mockPersonRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    };

    mockAgentRepo = {
      findOne: jest.fn(),
    };

    // Mock GlobalWorkspaceOrmManager
    mockWorkspaceOrmManager = {
      getRepository: jest.fn((_, objectName) => {
        if (objectName === 'person') return mockPersonRepo;
        if (objectName === 'agentProfile') return mockAgentRepo;
        return {};
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthSherpaPolicyPreprocessor,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: mockWorkspaceOrmManager,
        },
      ],
    }).compile();

    preprocessor = module.get<HealthSherpaPolicyPreprocessor>(
      HealthSherpaPolicyPreprocessor,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Phone Normalization', () => {
    it('should normalize 10-digit phone number', async () => {
      mockPersonRepo.findOne.mockResolvedValue({
        id: 'person-123',
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '(555) 123-4567',
        member_first_name: 'John',
        member_last_name: 'Doe',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result.member_phone).toBe('5551234567');
      expect(mockPersonRepo.findOne).toHaveBeenCalledWith({
        where: {
          phones: {
            primaryPhoneNumber: '5551234567',
          },
        },
      });
    });

    it('should normalize 11-digit phone number starting with 1', async () => {
      mockPersonRepo.findOne.mockResolvedValue({
        id: 'person-123',
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '1-555-123-4567',
        member_first_name: 'John',
        member_last_name: 'Doe',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result.member_phone).toBe('5551234567');
    });

    it('should handle phone number with only digits', async () => {
      mockPersonRepo.findOne.mockResolvedValue({
        id: 'person-123',
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result.member_phone).toBe('5551234567');
    });
  });

  describe('Person Matching - Strategy 1: Phone', () => {
    it('should match person by phone number', async () => {
      mockPersonRepo.findOne.mockResolvedValue({
        id: 'person-123',
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._personId).toBe('person-123');
      expect(mockPersonRepo.findOne).toHaveBeenCalledWith({
        where: {
          phones: {
            primaryPhoneNumber: '5551234567',
          },
        },
      });
    });
  });

  describe('Person Matching - Strategy 2: Agent + Name', () => {
    it('should match person by agent NPN and name when phone not found', async () => {
      // Phone lookup returns null
      mockPersonRepo.findOne.mockResolvedValueOnce(null);

      // Agent lookup returns agent
      mockAgentRepo.findOne.mockResolvedValue({
        id: 'agent-456',
      });

      // Person lookup by agent returns matches
      mockPersonRepo.find.mockResolvedValue([
        {
          id: 'person-123',
          assignedAgentId: 'agent-456',
          name: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      ]);

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
        policy_aor_npn: '12345678',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._personId).toBe('person-123');
      expect(mockAgentRepo.findOne).toHaveBeenCalledWith({
        where: { npn: '12345678' },
      });
    });

    it('should match case-insensitively by name', async () => {
      mockPersonRepo.findOne.mockResolvedValueOnce(null);
      mockAgentRepo.findOne.mockResolvedValue({ id: 'agent-456' });
      mockPersonRepo.find.mockResolvedValue([
        {
          id: 'person-123',
          assignedAgentId: 'agent-456',
          name: {
            firstName: 'JOHN', // Different case
            lastName: 'DOE',
          },
        },
      ]);

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'john', // lowercase
        member_last_name: 'doe',
        policy_aor_npn: '12345678',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._personId).toBe('person-123');
    });
  });

  describe('Person Matching - Strategy 3: Email', () => {
    it('should match person by email when phone and agent+name not found', async () => {
      // Phone lookup returns null
      mockPersonRepo.findOne.mockResolvedValueOnce(null);

      // Agent lookup returns null
      mockAgentRepo.findOne.mockResolvedValue(null);

      // Email lookup returns person
      mockPersonRepo.findOne.mockResolvedValueOnce({
        id: 'person-789',
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
        member_email: 'john.doe@example.com',
        policy_aor_npn: '12345678',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._personId).toBe('person-789');
      expect(mockPersonRepo.findOne).toHaveBeenCalledWith({
        where: {
          emails: {
            primaryEmail: 'john.doe@example.com',
          },
        },
      });
    });

    it('should skip junk emails', async () => {
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.findOne.mockResolvedValue(null);
      mockPersonRepo.save.mockResolvedValue({ id: 'person-new' });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
        member_email: 'none@none.com', // Junk email
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      // Should auto-create instead of searching by email
      expect(mockPersonRepo.save).toHaveBeenCalled();
      expect(result._personId).toBe('person-new');
    });
  });

  describe('Person Matching - Strategy 4: Auto-Create', () => {
    it('should auto-create person when no match found', async () => {
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.findOne.mockResolvedValue(null);
      mockPersonRepo.find.mockResolvedValue([]);
      mockPersonRepo.save.mockResolvedValue({ id: 'person-new-123' });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'Jane',
        member_last_name: 'Smith',
        member_email: 'jane.smith@example.com',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._personId).toBe('person-new-123');
      expect(mockPersonRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: {
            firstName: 'Jane',
            lastName: 'Smith',
          },
          phones: {
            primaryPhoneNumber: '5551234567',
            primaryPhoneCallingCode: '+1',
          },
          emails: {
            primaryEmail: 'jane.smith@example.com',
          },
          leadStatus: 'CONTACTED',
        }),
      );
    });

    it('should auto-create with agent assignment if agent found', async () => {
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.findOne.mockResolvedValue({ id: 'agent-789' });
      mockPersonRepo.find.mockResolvedValue([]);
      mockPersonRepo.save.mockResolvedValue({ id: 'person-new' });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'Jane',
        member_last_name: 'Smith',
        policy_aor_npn: '87654321',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(mockPersonRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedAgentId: 'agent-789',
        }),
      );
    });

    it('should retry without email on duplicate email error', async () => {
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.findOne.mockResolvedValue(null);
      mockPersonRepo.find.mockResolvedValue([]);

      // First save fails with duplicate
      mockPersonRepo.save.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint'),
      );

      // Second save succeeds
      mockPersonRepo.save.mockResolvedValueOnce({ id: 'person-retry' });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'Jane',
        member_last_name: 'Smith',
        member_email: 'duplicate@example.com',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._personId).toBe('person-retry');
      expect(mockPersonRepo.save).toHaveBeenCalledTimes(2);

      // Second call should not have email
      expect(mockPersonRepo.save.mock.calls[1][0]).not.toHaveProperty('emails');
    });
  });

  describe('Injected Fields', () => {
    it('should inject computed fields into payload', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._personId).toBe('person-123');
      expect(result._source).toBe('healthsherpa');
      expect(result._usd).toBe('USD');
      expect(result._now).toBeDefined();
      expect(new Date(result._now as string)).toBeInstanceOf(Date);
    });
  });
});
