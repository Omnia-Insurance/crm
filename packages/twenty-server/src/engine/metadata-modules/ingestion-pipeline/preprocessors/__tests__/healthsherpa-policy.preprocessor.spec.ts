import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { HealthSherpaPolicyPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor';
import {
  TwentyOrmException,
  TwentyOrmExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

jest.mock(
  'src/modules/policy/utils/lookup-carrier-product-commission.util',
  () => ({ lookupCarrierProductCommission: jest.fn() }),
);

describe('HealthSherpaPolicyPreprocessor', () => {
  let preprocessor: HealthSherpaPolicyPreprocessor;
  let mockWorkspaceOrmManager: {
    getRepositoryWithoutPermissionChecks: jest.Mock;
  };
  let mockPersonRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock };
  let mockAgentRepo: { findOne: jest.Mock };
  let mockCarrierRepo: { findOne: jest.Mock };
  let mockProductRepo: { findOne: jest.Mock };
  let mockProductTypeRepo: { findOne: jest.Mock };

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

    mockCarrierRepo = {
      findOne: jest.fn(),
    };

    mockProductRepo = {
      findOne: jest.fn(),
    };

    mockProductTypeRepo = {
      findOne: jest.fn(),
    };

    mockWorkspaceOrmManager = {
      getRepositoryWithoutPermissionChecks: jest.fn((objectName: string) => {
        if (objectName === 'person') {
          return mockPersonRepo;
        }
        if (objectName === 'agentProfile') {
          return mockAgentRepo;
        }
        if (objectName === 'carrier') {
          return mockCarrierRepo;
        }
        if (objectName === 'product') {
          return mockProductRepo;
        }
        if (objectName === 'productType') {
          return mockProductTypeRepo;
        }
        return {};
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthSherpaPolicyPreprocessor,
        {
          provide: WorkspaceOrmManager,
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
      mockPersonRepo.save.mockResolvedValue([{ id: 'person-new' }]);

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
      mockPersonRepo.save.mockResolvedValue([{ id: 'person-new-123' }]);

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
      mockPersonRepo.save.mockResolvedValue([{ id: 'person-new' }]);

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
      expect(result._personId).toBe('person-new');
    });

    it('should fail the policy instead of linking undefined when the Person save returns no row', async () => {
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.findOne.mockResolvedValue(null);
      mockPersonRepo.save.mockResolvedValue([]);

      await expect(
        preprocessor.preProcess(
          {
            application_id: 'app-123',
            member_phone: '5551234567',
            member_first_name: 'Jane',
            member_last_name: 'Smith',
          },
          mockPipeline,
          workspaceId,
        ),
      ).rejects.toThrow('Failed to find or create Person for policy');
    });

    it('should retry without email on duplicate email error', async () => {
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.findOne.mockResolvedValue(null);
      mockPersonRepo.find.mockResolvedValue([]);

      mockPersonRepo.save.mockRejectedValueOnce(
        new TwentyOrmException(
          'A duplicate entry was detected',
          TwentyOrmExceptionCode.DUPLICATE_ENTRY_DETECTED,
        ),
      );
      mockPersonRepo.save.mockResolvedValueOnce([{ id: 'person-retry' }]);

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

    it('should keep the application id and member details out of logs', async () => {
      const loggedMessages: string[] = [];
      const loggerSpies = (['log', 'warn', 'error'] as const).map((level) =>
        jest
          .spyOn(Logger.prototype, level)
          .mockImplementation((message: unknown) => {
            loggedMessages.push(String(message));
          }),
      );

      mockPersonRepo.findOne.mockResolvedValue(null);
      mockAgentRepo.findOne.mockResolvedValue(null);
      mockPersonRepo.save
        .mockRejectedValueOnce(
          new TwentyOrmException(
            'A duplicate entry was detected',
            TwentyOrmExceptionCode.DUPLICATE_ENTRY_DETECTED,
          ),
        )
        .mockResolvedValueOnce([{ id: 'person-retry' }]);

      await preprocessor.preProcess(
        {
          application_id: 'app-123',
          member_phone: '5551234567',
          member_first_name: 'Jane',
          member_last_name: 'Smith',
          member_email: 'jane.smith@example.com',
        },
        mockPipeline,
        workspaceId,
      );

      loggerSpies.forEach((loggerSpy) => loggerSpy.mockRestore());

      expect(loggedMessages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('retrying without email'),
          expect.stringContaining('Auto-created Person person-retry'),
        ]),
      );

      for (const message of loggedMessages) {
        expect(message).not.toMatch(
          /app-123|5551234567|Jane|Smith|jane\.smith/,
        );
      }
    });
  });

  describe('LTV Lookup', () => {
    it('should look up the commission with the matched carrier and product ids', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });
      mockCarrierRepo.findOne.mockResolvedValue({ id: 'carrier-1' });
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        productTypeId: null,
      });
      jest.mocked(lookupCarrierProductCommission).mockResolvedValue({
        amountMicros: 250_000_000,
        currencyCode: 'USD',
      });

      const result = await preprocessor.preProcess(
        {
          application_id: 'app-123',
          member_phone: '5551234567',
          carrier_name: 'Oscar',
          plan_name: 'Oscar Gold 2026',
        },
        mockPipeline,
        workspaceId,
      );

      expect(lookupCarrierProductCommission).toHaveBeenCalledWith(
        'carrier-1',
        'product-1',
        mockWorkspaceOrmManager,
      );
      expect(result._ltvAmountMicros).toBe(250_000_000);
      expect(result._ltvCurrencyCode).toBe('USD');
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
      expect(result._displayName).toBeDefined();
      expect(result._policyNumber).toBe('app-123');
    });
  });

  describe('Display Name Computation', () => {
    it('should compute display name as "Carrier - ProductType"', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        productTypeId: 'pt-1',
      });
      mockProductTypeRepo.findOne.mockResolvedValue({
        id: 'pt-1',
        name: 'Major Medical',
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
        carrier_name: 'Oscar',
        plan_name: 'Oscar Gold 2026',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._displayName).toBe('Oscar - Major Medical');
    });

    it('should use "Unknown" for missing product type', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        productTypeId: null,
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
        carrier_name: 'Ambetter',
        plan_name: 'Some Plan',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._displayName).toBe('Ambetter - Unknown');
    });

    it('should use "Unknown" for missing carrier', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        productTypeId: 'pt-1',
      });
      mockProductTypeRepo.findOne.mockResolvedValue({
        id: 'pt-1',
        name: 'Dental',
      });

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
        plan_name: 'Delta Dental Plan',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._displayName).toBe('Unknown - Dental');
    });

    it('should fall back to plan_name when neither carrier nor product type available', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });
      mockProductRepo.findOne.mockResolvedValue(null);

      const payload = {
        application_id: 'app-123',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
        plan_name: 'Some Plan Name',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._displayName).toBe('Some Plan Name');
    });

    it('should fall back to application_id when nothing else available', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });

      const payload = {
        application_id: 'app-999',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._displayName).toBe('app-999');
    });

    it('should set _policyNumber from application_id', async () => {
      mockPersonRepo.findOne.mockResolvedValue({ id: 'person-123' });

      const payload = {
        application_id: '7746000833',
        member_phone: '5551234567',
        member_first_name: 'John',
        member_last_name: 'Doe',
      };

      const result = await preprocessor.preProcess(
        payload,
        mockPipeline,
        workspaceId,
      );

      expect(result._policyNumber).toBe('7746000833');
    });
  });
});
