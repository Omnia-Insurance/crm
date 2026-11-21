import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { OldCrmPolicyPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/old-crm-policy.preprocessor';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

jest.mock(
  'src/modules/policy/utils/lookup-carrier-product-commission.util',
  () => ({ lookupCarrierProductCommission: jest.fn() }),
);

type MockRepository = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
};

const buildMockRepository = (objectName: string): MockRepository => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue([{ id: `${objectName}-created` }]),
  update: jest.fn(),
});

const workspaceId = 'workspace-1';

const todayInEastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
}).format(new Date());

const pipeline = {
  id: 'pipeline-1',
  name: 'Old CRM Policies',
  workspaceId,
  sourceUrl: 'https://old-crm.example.com/api/lead-report-api',
  sourceAuthConfig: { type: 'bearer', token: 'test-token' },
} as IngestionPipelineEntity;

const buildPayload = (overrides: Record<string, unknown> = {}) => ({
  policy_id: 101,
  policy_number: 'PN-101',
  phone: '(555) 123-4567',
  first_name: 'jane',
  last_name: 'doe',
  carrier_name: 'Oscar',
  product_name: 'Gold Plan',
  vendor_name: 'Vendor A',
  reg_date: `${todayInEastern} 09:00:00`,
  ...overrides,
});

describe('OldCrmPolicyPreprocessor', () => {
  let preprocessor: OldCrmPolicyPreprocessor;
  let repositoriesByObjectName: Record<string, MockRepository>;
  let mockWorkspaceOrmManager: {
    getRepositoryWithoutPermissionChecks: jest.Mock;
  };
  let mockHttpClient: { get: jest.Mock };

  beforeEach(async () => {
    repositoriesByObjectName = Object.fromEntries(
      [
        'person',
        'carrier',
        'product',
        'leadSource',
        'agentProfile',
        'policy',
        'familyMember',
      ].map((objectName) => [objectName, buildMockRepository(objectName)]),
    );

    mockWorkspaceOrmManager = {
      getRepositoryWithoutPermissionChecks: jest.fn(
        (objectName: string) => repositoriesByObjectName[objectName],
      ),
    };

    mockHttpClient = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OldCrmPolicyPreprocessor,
        { provide: WorkspaceOrmManager, useValue: mockWorkspaceOrmManager },
        {
          provide: SecureHttpClientService,
          useValue: {
            getHttpClient: jest.fn().mockReturnValue(mockHttpClient),
          },
        },
      ],
    }).compile();

    preprocessor = module.get<OldCrmPolicyPreprocessor>(
      OldCrmPolicyPreprocessor,
    );

    jest.mocked(lookupCarrierProductCommission).mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(lookupCarrierProductCommission).mockReset();
  });

  it('links the Person, Carrier, Product and Lead Source ids from the saved rows', async () => {
    repositoriesByObjectName.leadSource.save.mockResolvedValue([
      { id: 'lead-source-1' },
    ]);
    repositoriesByObjectName.person.save.mockResolvedValue([
      { id: 'person-1' },
    ]);
    repositoriesByObjectName.carrier.save.mockResolvedValue([
      { id: 'carrier-1' },
    ]);
    repositoriesByObjectName.product.save.mockResolvedValue([
      { id: 'product-1' },
    ]);
    jest.mocked(lookupCarrierProductCommission).mockResolvedValue({
      amountMicros: 120_000_000,
      currencyCode: 'USD',
    });

    const result = await preprocessor.preProcess(
      buildPayload(),
      pipeline,
      workspaceId,
    );

    expect(repositoriesByObjectName.person.save).toHaveBeenCalledWith(
      expect.objectContaining({
        leadSourceId: 'lead-source-1',
        name: { firstName: 'Jane', lastName: 'Doe' },
      }),
    );
    expect(lookupCarrierProductCommission).toHaveBeenCalledWith(
      'carrier-1',
      'product-1',
      mockWorkspaceOrmManager,
    );
    expect(result).toMatchObject({
      _personId: 'person-1',
      _carrierId: 'carrier-1',
      _productId: 'product-1',
      _ltvAmountMicros: 120_000_000,
    });
  });

  it('reuses existing Carrier and Product ids without creating them', async () => {
    repositoriesByObjectName.person.findOne.mockResolvedValue({
      id: 'person-existing',
      name: { firstName: 'Jane', lastName: 'Doe' },
    });
    repositoriesByObjectName.leadSource.findOne.mockResolvedValue({
      id: 'lead-source-existing',
    });
    repositoriesByObjectName.carrier.findOne.mockResolvedValue({
      id: 'carrier-existing',
    });
    repositoriesByObjectName.product.findOne.mockResolvedValue({
      id: 'product-existing',
    });

    const result = await preprocessor.preProcess(
      buildPayload(),
      pipeline,
      workspaceId,
    );

    expect(repositoriesByObjectName.carrier.save).not.toHaveBeenCalled();
    expect(repositoriesByObjectName.product.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      _personId: 'person-existing',
      _carrierId: 'carrier-existing',
      _productId: 'product-existing',
    });
  });

  it('leaves the carrier unlinked instead of linking undefined when its save returns no row', async () => {
    repositoriesByObjectName.person.save.mockResolvedValue([
      { id: 'person-1' },
    ]);
    repositoriesByObjectName.carrier.save.mockResolvedValue([]);
    repositoriesByObjectName.product.save.mockResolvedValue([
      { id: 'product-1' },
    ]);

    const result = await preprocessor.preProcess(
      buildPayload(),
      pipeline,
      workspaceId,
    );

    expect(result?._carrierId).toBeNull();
    expect(result?._productId).toBe('product-1');
  });

  it('skips the policy without logging member details when the Person save returns no row', async () => {
    const loggedMessages: string[] = [];

    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((message: unknown) => {
          loggedMessages.push(String(message));
        });
    }

    repositoriesByObjectName.person.save.mockResolvedValue([]);

    const result = await preprocessor.preProcess(
      buildPayload(),
      pipeline,
      workspaceId,
    );

    expect(result).toBeNull();
    expect(loggedMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Person save returned no record'),
      ]),
    );

    for (const message of loggedMessages) {
      expect(message).not.toMatch(/5551234567|Jane|jane|PN-101/);
    }
  });

  it('fetches lead details through the SSRF-safe HTTP client', async () => {
    const globalFetchSpy = jest.spyOn(global, 'fetch');

    mockHttpClient.get.mockResolvedValue({
      status: 200,
      data: {
        status: 1,
        response: {
          data: { first_name: 'jane', last_name: 'doe', dob: '1980-01-02' },
        },
      },
    });
    repositoriesByObjectName.person.save.mockResolvedValue([
      { id: 'person-1' },
    ]);

    await preprocessor.preProcess(
      buildPayload({ lead_id: 'abc123' }),
      pipeline,
      workspaceId,
    );

    expect(mockHttpClient.get).toHaveBeenCalledWith(
      'https://old-crm.example.com/api/lead/details/abc123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    expect(globalFetchSpy).not.toHaveBeenCalled();
    expect(repositoriesByObjectName.person.save).toHaveBeenCalledWith(
      expect.objectContaining({ dateOfBirth: '1980-01-02' }),
    );
  });

  it('skips policies registered on another day', async () => {
    const result = await preprocessor.preProcess(
      buildPayload({ reg_date: '2000-01-01 09:00:00' }),
      pipeline,
      workspaceId,
    );

    expect(result).toBeNull();
    expect(
      mockWorkspaceOrmManager.getRepositoryWithoutPermissionChecks,
    ).not.toHaveBeenCalled();
  });
});
